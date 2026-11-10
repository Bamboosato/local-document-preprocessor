"""Static lexical fingerprints only: never execute downloaded JavaScript."""
import ast
import json
from pathlib import Path
import re
import sys

NAMES = ['Ascii85Stream', 'AsciiHexStream', 'DecodeStream', 'FlateStream', 'LZWStream', 'RunLengthStream', 'Stream']
LEX = re.compile(r'''(?P<string>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(?P<comment>//[^\n]*|/\*[\s\S]*?\*/)|(?P<space>\s+)|(?P<other>.)''', re.S)


def normalize(source):
    result = []
    for token in LEX.finditer(source):
        if token.lastgroup in ['comment', 'space']:
            continue
        text = token.group()
        if token.lastgroup == 'string':
            try:
                text = json.dumps(ast.literal_eval(text), ensure_ascii=True)
            except (ValueError, SyntaxError):
                pass
        result.append(text)
    return ''.join(result)


def closure(source, name):
    start = re.search(r'var\s+' + re.escape(name) + r'\s*=\s*\(function', source)
    if not start:
        return None
    returned = source.find('return ' + name + ';', start.start())
    end = source.find('})();', returned)
    return source[start.start():end + 5] if returned >= 0 and end >= 0 else None


def compare(directory):
    directory = Path(directory)
    rows = []
    for tag in ['v1.4.20', 'v1.7.225', 'v1.10.100', 'v2.0.943']:
        upstream = (directory / ('pdfjs-' + tag + '.txt')).read_text(encoding='utf-8')
        classes = []
        for name in NAMES:
            local = closure((directory / ('pdflib-' + name + '.txt')).read_text(encoding='utf-8'), name)
            other = closure(upstream, name)
            classes.append({'name': name, 'localFound': local is not None, 'upstreamFound': other is not None,
                            'normalizedEqual': local is not None and other is not None and normalize(local) == normalize(other)})
        rows.append({'tag': tag, 'classes': classes, 'matches': sum(c['normalizedEqual'] for c in classes)})
    return {'method': 'Lexical comment/whitespace and quoted-string spelling normalization on selected ES5 closures only; not semantic, full-file or unique-origin proof', 'results': rows}


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: compare_borrowed_sources.py INPUT_DIRECTORY NEW_OUTPUT_JSON')
    with Path(sys.argv[2]).open('x', encoding='utf-8', newline='\n') as output:
        json.dump(compare(sys.argv[1]), output, indent=2)
        output.write('\n')
