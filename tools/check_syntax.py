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
i = s.index('<script>', s.index('</style>'))
j = s.rindex('</script>')
lines = s[i + 8:j].split('\n')

BS = chr(92)          # backslash, written this way to avoid escaping headaches
QUOTES = '"' + "'" + '`'

depth = 0
instr = None
incomment = False
last0 = 0

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

print('final depth :', depth)
print('unclosed string:', instr, ' in comment:', incomment)
print('last balanced line:', last0)
print('--- from there ---')
for x in range(max(0, last0 - 1), min(last0 + 14, len(lines))):
    print('%5d  %s' % (x + 1, lines[x][:100]))

# Exit non-zero when it is actually broken. This only ever printed, which made it useless as a CI
# gate - a step that cannot fail is not a check. The failure it exists to catch (a one-line comment
# swallowing renderAll's body) is silent otherwise.
if depth != 0 or instr or incomment:
    sys.stderr.write('BROKEN: unbalanced braces or an unterminated string/comment\n')
    sys.exit(1)
