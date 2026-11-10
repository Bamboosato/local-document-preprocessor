"""Bounded literal/token comparisons only. Never execute C or PostScript."""
import hashlib
import json
import re

MAX_TEXT = 2 * 1024 * 1024
SPACE = b'\x00\t\n\x0c\r '
DELIMITERS = SPACE + b'()<>[]{}/%'
PDF_REPAIRS = [
    ('/\noperatortype', '/operatortype'),
    ('er-\nrordict', 'errordict'),
    ('if-\nelse', 'ifelse'),
    ('/\npackedarraytype', '/packedarraytype'),
    ('ife-\nlse', 'ifelse'),
]


def initial_font_array(source):
    if len(source) > MAX_TEXT:
        raise ValueError('initial font source too large')
    match = re.search(rb'const\s+unsigned\s+char\s+\w+\s*\[\s*(\d+)\s*\]\s*=\s*\{(.*?)\};', source, re.S)
    if not match or re.sub(rb'0x[0-9a-fA-F]+|[\s,]', b'', match[2]):
        raise ValueError('unsupported initial font initializer')
    values = [int(v, 16) for v in re.findall(rb'0x([0-9a-fA-F]+)', match[2])]
    if len(values) != int(match[1]) or any(v > 255 for v in values):
        raise ValueError('initial font initializer length/range mismatch')
    return bytes(values)


def tokens(data):
    """Keep names, numbers and literal strings intact; discard only external whitespace/comments."""
    if len(data) > MAX_TEXT:
        raise ValueError('PostScript input too large')
    result, i = [], 0
    while i < len(data):
        c = data[i]
        if c in SPACE:
            i += 1
            continue
        if c == 37:
            while i < len(data) and data[i] not in b'\r\n': i += 1
            continue
        start = i
        if c == 40:
            depth, i = 1, i + 1
            while i < len(data) and depth:
                if data[i] == 92:
                    if i + 1 >= len(data): raise ValueError('truncated string escape')
                    i += 2
                    continue
                if data[i] == 40: depth += 1
                if data[i] == 41: depth -= 1
                i += 1
            if depth: raise ValueError('unterminated PostScript string')
        elif c == 60:
            if data[i:i + 2] == b'<<': i += 2
            else:
                end = data.find(b'>', i + 1)
                if end < 0 or re.sub(rb'[0-9a-fA-F\x00\t\n\x0c\r ]', b'', data[i + 1:end]):
                    raise ValueError('invalid hex string')
                i = end + 1
        elif c == 62:
            if data[i:i + 2] != b'>>': raise ValueError('unexpected hex delimiter')
            i += 2
        elif c in b'{}[]': i += 1
        elif c == 41: raise ValueError('unexpected string delimiter')
        else:
            i += 1
            if c == 47 and i < len(data) and data[i] == 47:
                i += 1  # Preserve immediate-name syntax; //name is not / /name.
            while i < len(data) and data[i] not in DELIMITERS: i += 1
        result.append(data[start:i])
        if len(result) > 20000: raise ValueError('too many PostScript tokens')
    return result


def fingerprint(items):
    # Structured encoding preserves token boundaries: [ab,c] differs from [a,bc].
    return hashlib.sha256(json.dumps([t.decode('latin-1') for t in items], separators=(',', ':')).encode()).hexdigest()


def definition(data, name, indirect=False):
    items = tokens(data)
    target, matches = b'/' + name.encode('ascii'), []
    for i in range(len(items) - 1):
        if items[i] != target or items[i + 1] != b'{': continue
        depth, j = 1, i + 2
        while j < len(items) and depth:
            if items[j] == b'{': depth += 1
            if items[j] == b'}': depth -= 1
            j += 1
        if depth: raise ValueError('unterminated procedure')
        if items[j:j + 1] == [b'bind']: j += 1
        if items[j:j + 1] in ([b'def'], [b'put']):
            matches.append(items[i:j + 1])
        elif indirect and items[j:j + 3] == [b'3', b'index', b'exec']:
            # Observed findfont wrapper; record syntax only, never execute the stack-selected operation.
            matches.append(items[i:j + 3])
        else:
            raise ValueError('unsupported procedure assignment')
    if len(matches) != 1: raise ValueError('missing or ambiguous procedure')
    return matches[0]


def adobe_prefix(data, count):
    items = tokens(data)
    starts = [i for i in range(len(items) - 1) if items[i:i + 2] == [b'/shareddict', b'where']]
    if len(starts) != 1 or count <= 0 or starts[0] + count > len(items):
        raise ValueError('ambiguous or truncated Adobe wrapper')
    return items[starts[0]:starts[0] + count]


def prepare_appendix_a(pages):
    """Only the five visually checked PDF line-wrap repairs; never alter font tokens."""
    parts = []
    for n in (35, 36, 37):
        page = pages[n]
        lines = page.splitlines()
        if sum(line.strip() == str(n) or line.strip().startswith(f'{n} Appendix A: The makeblendedfont Operator') for line in lines) != 1:
            raise ValueError('unexpected PDF page numbering')
        text = '\n'.join(line for line in lines if line.strip() != str(n) and 'Appendix A: The makeblendedfont Operator' not in line)
        if n == 35:
            if text.count('/shareddict where') != 1: raise ValueError('PDF wrapper absent')
            text = text[text.index('/shareddict where'):]
        parts.append(text)
    text = '\n'.join(parts)
    for before, after in PDF_REPAIRS:
        if text.count(before) != 1: raise ValueError('unexpected PDF wrap pattern')
        text = text.replace(before, after)
    return text.encode('ascii')
