"""Compute the CSP hashes for the inline <script> blocks in www/index.html.

    py -3 tools/csp_hashes.py            # print them, and say whether _headers is current
    py -3 tools/csp_hashes.py --write    # rewrite script-src in www/_headers

WHY THIS EXISTS. E13.1 removed 'unsafe-inline' from script-src, which is what turned an escaping
slip into account takeover: with it, the browser cannot tell this app's code from an attacker's.
The application itself moved to www/app.js so that no hash has to track a file that changes on
every edit - a stale hash does not degrade the app, it BLANKS it.

What is left inline is three small blocks that must run before first paint: the Turnstile callback,
the Capacitor native check, and the one that keeps the sign-in gate up while the session is read.
They are the reason 'unsafe-inline' existed, and they almost never change, so hashing them is safe.

check_syntax.py fails when these go stale, so the failure lands in CI rather than on the live site.
"""
import base64
import hashlib
import io
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(BASE, "www", "index.html")
HEADERS = os.path.join(BASE, "www", "_headers")

INLINE = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S)

# Anchored on the real header line, NOT on the words "script-src" anywhere in the file. The first
# version of this matched the explanatory COMMENT at the top of _headers - which happens to contain
# the phrase - and rewriting that comment corrupted it. A comment is not a directive.
CSP_LINE = re.compile(r"^([ \t]*Content-Security-Policy:[ \t]*)(.*)$", re.M)


def hashes(html=None):
    """The sha256-... tokens for every inline script block, in document order."""
    s = html if html is not None else io.open(HTML, encoding="utf-8").read()
    out = []
    for m in INLINE.finditer(s):
        d = hashlib.sha256(m.group(1).encode("utf-8")).digest()
        out.append("'sha256-" + base64.b64encode(d).decode() + "'")
    return out


def _csp_line(text):
    return CSP_LINE.search(text)


def script_src(headers=None):
    s = headers if headers is not None else io.open(HEADERS, encoding="utf-8").read()
    line = _csp_line(s)
    if not line:
        return None
    m = re.search(r"script-src ([^;]*);", line.group(2))
    return m.group(1).strip() if m else None


def wanted(current):
    """Keep every non-hash source exactly as it is; replace only the hash list."""
    keep = [t for t in current.split() if not t.startswith("'sha256-") and t != "'unsafe-inline'"]
    return " ".join(keep + hashes())


def main():
    cur = script_src()
    if cur is None:
        print("csp hashes : FAIL - no script-src in the Content-Security-Policy header")
        return 1
    want = wanted(cur)
    if "--write" in sys.argv:
        s = io.open(HEADERS, encoding="utf-8").read()
        line = _csp_line(s)
        fixed = line.group(2).replace("script-src " + cur + ";", "script-src " + want + ";", 1)
        if fixed == line.group(2):
            print("csp hashes : FAIL - could not rewrite script-src in the header line")
            return 1
        s = s[:line.start(2)] + fixed + s[line.end(2):]
        io.open(HEADERS, "w", encoding="utf-8", newline="").write(s)
        print("csp hashes : written")
        print("  script-src " + want)
        return 0
    for h in hashes():
        print("  " + h)
    if cur.strip() == want.strip():
        print("csp hashes : www/_headers is current")
        return 0
    print("csp hashes : STALE")
    print("  have: " + cur)
    print("  want: " + want)
    return 1


if __name__ == "__main__":
    sys.exit(main())
