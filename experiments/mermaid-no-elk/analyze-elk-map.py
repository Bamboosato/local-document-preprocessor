"""Inspect one ELK-labelled source in an external map for a byte-identical rebuild."""
import base64
import hashlib
import json
import re
import sys
from pathlib import Path

if len(sys.argv) != 4:
    raise SystemExit('usage: analyze-elk-map.py REBUILD_JS PUBLISHED_JS REBUILD_MAP')
rebuilt, published, map_path = map(Path, sys.argv[1:])
data = rebuilt.read_bytes()
if data != published.read_bytes():
    raise SystemExit('rebuild mismatch')
source_map = json.loads(map_path.read_text(encoding='utf-8'))
targets = {i for i, name in enumerate(source_map['sources'])
           if name.replace('\\', '/').endswith('/layout-algorithms/elk/algorithms.ts')}
if len(targets) != 1:
    raise SystemExit('expected one source')
alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
source = original_line = original_column = name_index = 0
hits = []
for generated_line, row in enumerate(source_map['mappings'].split(';')):
    generated_column = 0
    for segment in row.split(','):
        if not segment:
            continue
        values, value, shift = [], 0, 0
        for char in segment:
            digit = alphabet.index(char)
            value += (digit & 31) << shift
            if digit & 32:
                shift += 5
            else:
                values.append(-(value >> 1) if value & 1 else value >> 1)
                value = shift = 0
        generated_column += values[0]
        if len(values) >= 4:
            source += values[1]
            original_line += values[2]
            original_column += values[3]
            if len(values) > 4:
                name_index += values[4]
            if source in targets:
                hits.append((generated_line, generated_column, original_line, original_column))
lines = data.decode('utf-8').splitlines()
if not hits or len({hit[0] for hit in hits}) != 1:
    raise SystemExit('unexpected mapped segments')
line_no = hits[0][0]
line = lines[line_no]
# Source maps use UTF-16 code units for generated columns, including non-BMP text.
def offset(col):
    return len(line.encode('utf-16-le')[:col * 2].decode('utf-16-le'))
positions = [offset(hit[1]) for hit in hits]
match = next((m for m in re.finditer(r'var [\w$]+=\w+\(\(\)=>\{"use strict"\}\);', line)
              if m.start() <= min(positions) and max(positions) <= m.end()), None)
if not match or any(hit[2:] != (0, 0) for hit in hits):
    raise SystemExit('mapped region is not the expected empty module wrapper')
print(json.dumps({'rebuildSha256': hashlib.sha256(data).hexdigest(),
                  'sourceMapSha256': hashlib.sha256(map_path.read_bytes()).hexdigest(),
                  'mappedSegments': len(hits), 'originalPositions': 'line 1 column 0',
                  'generatedWrapper': match.group(), 'wrapperBytes': len(match.group().encode())}))
