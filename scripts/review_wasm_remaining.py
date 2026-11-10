"""Read fixed crates without execution/extraction; condition preparation only."""
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
FAMILIES = ('Apache-2.0', 'BSL-1.0', 'Unlicense', '0BSD', 'Zlib', 'MIT')


def conditional_profile(expression):
    # Do not turn deprecated slash notation into a confirmed OR grant.
    residual = expression
    families = []
    for name in FAMILIES:
        if name in residual:
            families.append(name)
            residual = residual.replace(name, '')
    if not families or re.sub(r'\bOR\b|[\s()/]', '', residual):
        raise ValueError('Unsupported remaining-candidate expression')
    legacy = '/' in expression
    choice = None if legacy else ('MIT' if 'MIT' in families else 'Apache-2.0' if 'Apache-2.0' in families else families[0])
    return {'families': families, 'legacySlashNeedsConfirmation': legacy,
            'preparationRecommendation': choice, 'declaredExpressionPreserved': expression,
            'finalApplicability': 'not determined from metadata or license-text presence'}


def fetch(url):
    with urllib.request.urlopen(url, timeout=40) as response:
        data = response.read(32_000_001)
    if len(data) > 32_000_000:
        raise ValueError('Archive/text size limit')
    return data


def review(pkg):
    expected_url = f"https://static.crates.io/crates/{pkg['name']}/{pkg['name']}-{pkg['version']}.crate"
    if pkg['sourceArchive'] != expected_url:
        raise ValueError('Unexpected archive URL')
    raw = fetch(expected_url)
    if hashlib.sha256(raw).hexdigest() != pkg['checksum']:
        raise ValueError('Crate checksum mismatch')
    prefix = f"{pkg['name']}-{pkg['version']}/"
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
        members = archive.getmembers()
        if len(members) > 10000:
            raise ValueError('Archive entry limit')
        files = {m.name[len(prefix):]: m for m in members if m.isfile() and m.name.startswith(prefix)}
        candidates = []
        for name, member in sorted(files.items()):
            if not re.match(r'^(?:licen[sc]e|copying|copyright|notice|authors)(?:[._-]|$)', name.rsplit('/', 1)[-1], re.I):
                continue
            if member.size > 2_000_000:
                raise ValueError('Notice size limit')
            data = archive.extractfile(member).read()
            candidates.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        originals = []
        for original in pkg['originals']:
            data = (ROOT / original['reviewPath']).read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            if digest != original['sha256'] or len(data) != original['bytes']:
                raise ValueError('Retained original mismatch')
            matches = [c['path'] for c in candidates if c['sha256'] == digest]
            kind = 'verified-crate-original'
            if not matches:
                fallback = pkg.get('workspaceFallback')
                if not fallback or original.get('sourceKind') != 'pinned-workspace-repository':
                    raise ValueError('Original not found in verified archive')
                base = f"https://raw.githubusercontent.com/Michael-F-Bryan/include_dir/{fallback['commit']}/"
                if original.get('sourceURL') != base + 'LICENSE':
                    raise ValueError('Unexpected workspace fallback')
                remote = fetch(original['sourceURL'])
                if remote != data:
                    raise ValueError('Workspace original mismatch')
                vcs = json.loads(archive.extractfile(files['.cargo_vcs_info.json']).read())
                if vcs['git']['sha1'] != fallback['commit'] or vcs['path_in_vcs'] != fallback['pathInVcs']:
                    raise ValueError('Workspace version correspondence mismatch')
                kind = 'verified-fixed-workspace-fallback'
            rights = [line.strip()[:200] for line in data.decode('utf-8').splitlines() if re.search('copyright|©', line, re.I)]
            originals.append({**original, 'verification': kind, 'archivePathsWithSameBytes': matches, 'copyrightLines': rights})
        known = {o['sha256'] for o in originals}
        extra = [c for c in candidates if c['sha256'] not in known]
        readme_paths = [n for n in files if '/' not in n and n.lower().startswith('readme')]
        hints = []
        for name in readme_paths:
            if files[name].size > 1_000_000:
                continue
            text = archive.extractfile(files[name]).read().decode('utf-8', errors='replace')
            for line in text.splitlines():
                if re.search(r'licen[sc]|Apache|Unlicense|dual', line, re.I):
                    hints.append({'path': name, 'line': line.strip()[:300]})
    return {'name': pkg['name'], 'version': pkg['version'], 'declaredLicense': pkg['declaredLicense'],
            'archiveUrl': expected_url, 'archiveSha256': pkg['checksum'], 'archiveVerified': True,
            'profile': conditional_profile(pkg['declaredLicense']), 'originals': originals,
            'additionalNoticeCandidates': extra, 'readmeLicenseHints': hints,
            'remaining': ['Confirm applicable scope in actual published WASM', 'Review inline source rights/NOTICE and final distribution changes'],
            'allApplicableConditionsSatisfied': False}


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r'docs/evidence/[a-z0-9][a-z0-9.-]*\.json', sys.argv[1]) or '..' in sys.argv[1]:
        raise SystemExit('Expected new docs/evidence JSON path')
    inventory = json.loads((ROOT / 'docs/evidence/json-anydoc-target-licenses.json').read_text(encoding='utf-8'))
    previous = {('encoding_rs', '0.8.35'), ('unicode-ident', '1.0.24'), ('zlib-rs', '0.6.6')}
    packages = [p for p in inventory['packages'] if (p['name'], p['version']) not in previous]
    if len(packages) != 93:
        raise ValueError('Unexpected remaining inventory')
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(review, packages))
    result = {'schema': 1, 'date': '2026-11-10', 'sourceCommit': inventory['source']['commit'],
              'scope': 'Fixed archive/original correspondence and conditional preparation profiles; not linked WASM SBOM or legal release approval',
              'packages': rows, 'summary': {'packages': len(rows), 'originals': sum(len(p['originals']) for p in rows),
              'additionalNoticeCandidates': sum(len(p['additionalNoticeCandidates']) for p in rows),
              'legacySlashCases': sum(p['profile']['legacySlashNeedsConfirmation'] for p in rows),
              'verifiedWorkspaceFallbacks': sum(o['verification'] == 'verified-fixed-workspace-fallback' for p in rows for o in p['originals'])}}
    with (ROOT / sys.argv[1]).open('x', encoding='utf-8', newline='\n') as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
        output.write('\n')
    print(json.dumps(result['summary']))


if __name__ == '__main__':
    main()
