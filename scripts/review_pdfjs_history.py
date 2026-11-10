"""Replay the bounded pre-copy source-file comparison without executing JS."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from scripts.compare_borrowed_sources import closure, normalize, NAMES


def compare(directory, inventory, local_directory):
    directory, local_directory = Path(directory), Path(local_directory)
    if not 0 < len(inventory['inputs']) <= 100:
        raise ValueError('history input count out of bounds')
    local = {}
    for name in NAMES:
        text = (local_directory / ('pdflib-' + name + '.txt')).read_text(encoding='utf-8')
        block = closure(text, name)
        if block is None:
            raise ValueError('copied closure absent')
        if name == 'FlateStream':
            delta = '    // this.dict = str.dict;'
            if block.count(delta) != 1:
                raise ValueError('explicit FlateStream delta changed')
            block = block.replace(delta, '    this.dict = str.dict;')
        local[name] = normalize(block)
    results, seen = [], set()
    for row in inventory['inputs']:
        commit = row['commit']
        if not re.fullmatch(r'[0-9a-f]{40}', commit) or commit in seen:
            raise ValueError('unsafe or duplicate history commit')
        seen.add(commit)
        raw = (directory / (commit + '.txt')).read_bytes()
        if len(raw) > 1024 * 1024 or hashlib.sha256(raw).hexdigest() != row['sha256']:
            raise ValueError('history source mismatch')
        text = raw.decode('utf-8')
        found = {name: closure(text, name) for name in NAMES}
        matches = [name for name in NAMES if found[name] is not None and normalize(found[name]) == local[name]]
        results.append({**row, 'found': sum(v is not None for v in found.values()), 'matches': matches,
                        'matchCount': len(matches), 'glyphCogNotice': 'Copyright 1996-2003 Glyph & Cog' in text})
    return {'method': 'Selected seven ES5 closures, lexical normalization and only the explicit FlateStream assignment delta; no unique borrow-event proof',
            'query': inventory['query'], 'results': results}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('history_directory')
    parser.add_argument('inventory')
    parser.add_argument('local_directory')
    parser.add_argument('new_output')
    args = parser.parse_args()
    result = compare(args.history_directory, json.loads(Path(args.inventory).read_text(encoding='utf-8')), args.local_directory)
    with Path(args.new_output).open('x', encoding='utf-8', newline='\n') as out:
        json.dump(result, out, indent=2)
        out.write('\n')
