"""Every untrusted value that reaches markup must go through esc().

    py -3 tools/escaping.py        # list anything unescaped; exit 1 if there is any

WHY THIS EXISTS. On 2026-08-31 a hostile ticker symbol executed twelve times per render, because
symbols reached innerHTML unescaped in four places. The fix was reactive: it closed the sites that
one payload happened to reach. www/app.js has 94 innerHTML assignments and nothing stopped the
next one.

E13.1 has since removed 'unsafe-inline' from script-src, so an injected script no longer RUNS -
but that is the second layer. Escaping at the sink is the first, and attribute injection is a
defect whether or not today's policy happens to neutralise the payload.

THE INVARIANT IS ZERO, deliberately, with no allowlist. Two catalog-sourced labels were flagged
that were never exploitable - the values are hardcoded - and they were escaped anyway, because
esc() on a safe string is a no-op and an invariant with no exceptions is one nobody has to
remember or re-audit.
"""
import collections
import io
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = [os.path.join(BASE, "www", "app.js"), os.path.join(BASE, "www", "index.html")]

# Accessors carrying text from outside the app: Yahoo, the generated ticker directory, the stored
# portfolio payload, or the user's own typing.
UNTRUSTED = re.compile("|".join([
    r"\bnameOf\(", r"\.name\b", r"\.label\b", r"\.exchange\b", r"\.type\b",
    r"\bthemeOfSym\(", r"\.sym\b", r"\.symbol\b", r"\.theme\b", r"\.date\b",
    r"\.mode\b", r"\.asOfDate\b", r"\.financialCurrency\b", r"\.currency\b",
    r"\.color\b",
]))

# Helpers whose output is a number or a fixed token, and so cannot carry markup.
SAFE_CALL = re.compile(
    r"^\s*(esc|money|pct|num|signed|bil|volFmt|fmtDate|fmtVal|fmtStmtCell|Math\.|String\(Number)")


def interpolations(text):
    """Every ${...}, brace-matched so nested braces and objects survive."""
    out, i = [], 0
    while True:
        i = text.find("${", i)
        if i < 0:
            return out
        d, k = 1, i + 2
        while k < len(text) and d:
            if text[k] == "{":
                d += 1
            elif text[k] == "}":
                d -= 1
            k += 1
        out.append(text[i + 2:k - 1])
        i = k


CONCAT = re.compile(r"""['"]\s*\+\s*([A-Za-z_$][\w$.\[\]()'"]*)\s*\+\s*['"]""")


def findings():
    out = []
    for path in SOURCES:
        if not os.path.exists(path):
            continue
        name = os.path.basename(path)
        for ln, line in enumerate(io.open(path, encoding="utf-8").read().split("\n"), 1):
            for expr in interpolations(line):
                if UNTRUSTED.search(expr) and "esc(" not in expr and not SAFE_CALL.match(expr):
                    out.append((name, ln, expr.strip()[:110]))
            if "innerHTML" in line or "<" in line:
                for m in CONCAT.finditer(line):
                    e = m.group(1)
                    if UNTRUSTED.search(e) and "esc(" not in e and not SAFE_CALL.match(e):
                        out.append((name, ln, e[:110] + "   [concatenation]"))
    return out


def main():
    bad = findings()
    if not bad:
        print("escaping    : no untrusted value reaches markup unescaped")
        return 0
    print("escaping    : FAIL - %d untrusted interpolation(s) not passed through esc()" % len(bad))
    for name, ln, expr in bad:
        print("  %s:%d  %s" % (name, ln, expr))
    print("  Wrap the value in esc(). If it is genuinely safe, wrap it anyway - esc() on a safe")
    print("  string is a no-op, and this invariant is deliberately kept at zero with no allowlist.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
