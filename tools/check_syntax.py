import io

s = io.open(r'C:\dev\portfolio-builder\www\index.html', encoding='utf-8').read()
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
