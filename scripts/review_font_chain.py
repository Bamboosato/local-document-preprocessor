"""Static PFB observations only; never execute PostScript or decrypt outlines."""
import hashlib
import re

MAX_FONT_BYTES = 2 * 1024 * 1024
ADOBE = b'% Copyright (c) 1990-1994 Adobe Systems Incorporated'


def inspect_pfb(data):
    if len(data) > MAX_FONT_BYTES:
        raise ValueError('PFB too large')
    pos, segments, ended = 0, [], False
    while pos < len(data):
        if pos + 2 > len(data) or data[pos] != 0x80:
            raise ValueError('invalid PFB segment header')
        kind = data[pos + 1]
        pos += 2
        if kind == 3:
            if pos != len(data):
                raise ValueError('trailing PFB bytes')
            ended = True
            break
        if kind not in (1, 2) or pos + 4 > len(data):
            raise ValueError('unsupported or truncated PFB segment')
        size = int.from_bytes(data[pos:pos + 4], 'little')
        pos += 4
        if pos + size > len(data):
            raise ValueError('truncated PFB payload')
        payload = data[pos:pos + size]
        row = {'kind': kind, 'offset': pos, 'bytes': size, 'sha256': hashlib.sha256(payload).hexdigest()}
        if kind == 1:
            marker = payload.find(ADOBE)
            row.update({'type1Header': payload.startswith(b'%!PS-AdobeFont-1.0:'),
                        'blankFontInfoNoticeObserved': bool(re.search(rb'/Notice\s+\(\s*\)\s+readonly\s+def', payload)),
                        'adobeCopyrightOffset': pos + marker if marker >= 0 else None,
                        'makeblendedfont': b'/makeblendedfont' in payload,
                        'normalizeDesignVector': b'/NormalizeDesignVector' in payload,
                        'convertDesignVector': b'/ConvertDesignVector' in payload})
            if marker >= 0:
                stop = payload.find(b'/shareddict', marker)
                if stop < 0:
                    raise ValueError('Adobe notice boundary absent')
                notice = payload[marker:stop]
                row['adobeNoticeBytes'] = len(notice)
                row['adobeNoticeSha256'] = hashlib.sha256(notice).hexdigest()
        segments.append(row)
        pos += size
    if not ended or not segments or not any(s['kind'] == 1 for s in segments):
        raise ValueError('incomplete PFB')
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'segments': segments,
            'scope': 'PFB framing and cleartext observations only; encrypted sections not interpreted; not proof of grant fulfillment or outline origin'}


def adobe_notice(data, observation):
    rows = [s for s in observation['segments'] if s.get('adobeCopyrightOffset') is not None]
    if len(rows) != 1:
        raise ValueError('ambiguous Adobe notice')
    row = rows[0]
    start = row['adobeCopyrightOffset']
    notice = data[start:start + row['adobeNoticeBytes']]
    if hashlib.sha256(notice).hexdigest() != row['adobeNoticeSha256']:
        raise ValueError('changed Adobe notice')
    return notice
