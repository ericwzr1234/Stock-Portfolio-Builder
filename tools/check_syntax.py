"""Brace / string balance check for www/index.html.

Usage:  python3 tools/check_syntax.py [path-to-html]
Exits 1 when the script block is unbalanced, so it works as a CI gate.
"""
import io
import os
import sys

# Resolve from THIS FILE, the way build_universe.py and render_dashboard.py already do. It was
# pinned to one machine's C:\dev\... absolute path, so it passed everywhere it had ever been run
# and failed the instant CI ran it on Linux - and would have failed on the Mac clone too.
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE, 'www', 'index.html')

s = io.open(TARGET, encoding='utf-8').read()

BS = chr(92)          # backslash, written this way to avoid escaping headaches
QUOTES = '"' + "'" + '`'


def balance(text):
    """Walk JavaScript tracking strings, template literals and comments. Returns
    (final_depth, unclosed_string, in_comment, last_line_at_depth_zero, lines)."""
    lines = text.split('\n')
    depth, instr, incomment, last0 = 0, None, False, 0
    for ln, line in enumerate(lines, 1):
        k = 0
        while k < len(line):
            c = line[k]
            nxt = line[k + 1] if k + 1 < len(line) else ''
            if incomment:
                if c == '*' and nxt == '/':
                    incomment = False
                    k += 1
            elif instr:
                if c == BS:
                    k += 1
                elif c == instr:
                    instr = None
            else:
                if c == '/' and nxt == '*':
                    incomment = True
                    k += 1
                elif c == '/' and nxt == '/':
                    break
                elif c in QUOTES:
                    instr = c
                elif c == '{':
                    depth += 1
                elif c == '}':
                    depth -= 1
            k += 1
        if depth == 0 and not instr and not incomment:
            last0 = ln
    return depth, instr, incomment, last0, lines


# E13.1 split the client in two. This used to scan the SPAN between the first <script> after
# </style> and the last </script>, which was exactly the application while the application lived
# inline. With the app moved to app.js that span is mostly HTML markup, whose quotes and braces are
# not JavaScript - the check failed on a file that was perfectly fine. Check each real JavaScript
# source instead: every inline block, on its own, plus app.js.
import re as _re

_sources = []
for _m in _re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', s, _re.S):
    _sources.append(('index.html inline #%d' % (len(_sources) + 1), _m.group(1)))
_appjs = os.path.join(BASE, 'www', 'app.js')
if os.path.exists(_appjs):
    _sources.append(('app.js', io.open(_appjs, encoding='utf-8').read()))

_bad = False
for _name, _text in _sources:
    _d, _instr, _inc, _last0, _lines = balance(_text)
    if _d or _instr or _inc:
        _bad = True
        print('BROKEN      : %s - depth %d, unclosed string %r, in comment %s'
              % (_name, _d, _instr, _inc))
        print('  last balanced line: %d' % _last0)
        for _x in range(max(0, _last0 - 1), min(_last0 + 12, len(_lines))):
            print('  %5d  %s' % (_x + 1, _lines[_x][:100]))
    else:
        print('%-22s %5d lines, balanced' % (_name + ' :', len(_lines)))
if _bad:
    sys.exit(1)

# ---- CSS custom properties: a name that was never defined VOIDS its whole declaration --------
# Silently. `background: var(--surface)` with no --surface anywhere left the guided-tour bubble
# fully transparent, so the page read straight through it, and nothing anywhere reported a problem.
# Only names used WITHOUT a fallback matter - var(--x, #fff) degrades safely by design.
import re

_css = s[s.index('<style'):s.index('</style>')]
_defined = set(re.findall(r'(--[A-Za-z0-9_-]+)\s*:', _css))
_used = {m.group(1) for m in re.finditer(r'var\(\s*(--[A-Za-z0-9_-]+)\s*([,)])', _css)
         if m.group(2) == ')'}
_undefined = sorted(_used - _defined)
print('css vars    :', len(_defined), 'defined,', len(_used), 'used without a fallback')

# Exit non-zero when it is actually broken. This only ever printed, which made it useless as a CI
# gate - a step that cannot fail is not a check. The failure it exists to catch (a one-line comment
# swallowing renderAll's body) is silent otherwise.
# The brace/string gate now lives in the balance() loop above: it exits 1 itself and names the
# source that broke, which the single module-level `depth` could not do once there was more than
# one JavaScript source to check.
if _undefined:
    sys.stderr.write('BROKEN: CSS variables used but never defined: %s\n' % ', '.join(_undefined))
    sys.exit(1)

# ---- E6.7: the CSP must name the Supabase origin the app actually calls -----------------------
# connect-src is an allowlist. If SB_URL moves (a restored project gets a new ref) and www/_headers
# is not moved with it, every sign-in fails as an opaque browser-console block and nothing in the
# app reports why. Same class as the CSS-variable check above: when you teach the code a new fact,
# teach every reader of it. Absent _headers is skipped, not failed, so a bare checkout still runs.
_hdr = os.path.join(BASE, 'www', '_headers')
_client = s
_appsrc = os.path.join(BASE, 'www', 'app.js')
if os.path.exists(_appsrc):
    _client += io.open(_appsrc, encoding='utf-8').read()
_sbm = re.search(r'const SB_URL\s*=\s*"([^"]+)"', _client)
if not _sbm:
    sys.stderr.write('BROKEN: SB_URL not found in index.html or app.js - connect-src is unverified\n')
    sys.exit(1)
if os.path.exists(_hdr):
    _sb = _sbm.group(1)
    _csp = [ln for ln in io.open(_hdr, encoding='utf-8').read().splitlines()
            if 'Content-Security-Policy' in ln]
    if not _csp:
        sys.stderr.write('BROKEN: www/_headers has no Content-Security-Policy line\n')
        sys.exit(1)
    if _sb not in _csp[0]:
        sys.stderr.write('BROKEN: CSP connect-src does not allow %s - every sign-in would be blocked\n' % _sb)
        sys.exit(1)
    
# ---- HTML nesting -----------------------------------------------------------------------------
# A single stray </div> in the Overview markup closed <main> early, which hoisted the other three
# lanes out of it - and every delegated listener bound to main went dead on those lanes without a
# single error anywhere. Nothing caught it; the sections still rendered. Count the tags.
_html = io.open(TARGET, encoding="utf-8").read()
_body = _html[_html.index('<main>'):_html.index('</main>')]
_depth, _worst, _line = 0, 0, 0
for _i, _l in enumerate(_body.split('\n'), 1):
    _depth += len(re.findall(r'<div\b', _l)) - len(re.findall(r'</div>', _l))
    if _depth < _worst:
        _worst, _line = _depth, _i
if _worst < 0:
    print('div balance : FAIL - <div> underflow inside <main> at relative line %d (depth %d)' % (_line, _worst))
    sys.exit(1)
if _depth != 0:
    print('div balance : FAIL - %d <div> left open inside <main>' % _depth)
    sys.exit(1)
print('div balance : <main> is balanced')

# ---- the V2 compat shim -----------------------------------------------------------------------
# E12 section 2: "This block must be empty when E12 closes; a leftover alias is an unmigrated
# surface." It was emptied in E12.8 by rewriting all 160 uses to the V3 token each already
# resolved to. Nothing stops someone adding one back except this.
_V2 = ('cream', 'paper', 'surface2', 'muted', 'line', 'line2', 'teal', 'teal-d', 'blue', 'sage',
       'slate', 'gold', 'buy', 'sell', 'chip', 'on-accent', 'header-bg', 'tint', 'shadow',
       'shadow-lift')
_back = sorted({m for m in _V2
                if re.search(r'var\(--%s\)' % re.escape(m), _html)
                or re.search(r'^\s*--%s\s*:' % re.escape(m), _html, re.M)})
if _back:
    print('compat shim : FAIL - V2 alias(es) are back: %s' % ', '.join('--' + x for x in _back))
    print('              name the V3 token instead (--bg / --surface / --ink-50 / --accent / ...)')
    sys.exit(1)
print('compat shim : empty, as E12 section 2 requires')

# ---- the CSP hashes for the inline blocks -------------------------------------------------------
# E13.1 removed 'unsafe-inline' from script-src. The three blocks still inline in index.html are
# named by sha256 instead, and a STALE hash does not degrade the app - the browser refuses the
# block outright. So this must fail here, in CI, and never on the live site.
sys.path.insert(0, os.path.join(BASE, 'tools'))
try:
    import csp_hashes as _csphash
    _cur = _csphash.script_src()
    if _cur is None:
        print('csp hashes  : FAIL - no script-src in the Content-Security-Policy header')
        sys.exit(1)
    if "'unsafe-inline'" in _cur:
        print("csp hashes  : FAIL - 'unsafe-inline' is back in script-src")
        sys.exit(1)
    _want = _csphash.wanted(_cur)
    if _cur.strip() != _want.strip():
        print('csp hashes  : FAIL - stale. Run: py -3 tools/csp_hashes.py --write')
        sys.exit(1)
    print('csp hashes  : %d inline blocks, all named in the CSP' % len(_csphash.hashes()))
except ImportError:
    print('csp hashes  : SKIP - tools/csp_hashes.py not importable')

# ---- every untrusted value reaching markup goes through esc() ----------------------------------
# The 2026-08-31 XSS was a symbol reaching innerHTML unescaped. The fix closed the sites one
# payload happened to reach; this closes the class. Kept at ZERO with no allowlist.
try:
    import escaping as _escg
    _bad = _escg.findings()
    if _bad:
        print('escaping    : FAIL - %d untrusted interpolation(s) not passed through esc()' % len(_bad))
        for _n, _l, _e in _bad[:10]:
            print('  %s:%d  %s' % (_n, _l, _e))
        sys.exit(1)
    print('escaping    : no untrusted value reaches markup unescaped')
except ImportError:
    print('escaping    : SKIP - tools/escaping.py not importable')


print('csp         : connect-src allows', _sb)
