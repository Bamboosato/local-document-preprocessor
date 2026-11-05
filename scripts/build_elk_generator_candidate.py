"""Build an unapproved local review ZIP for one ELK generator candidate."""
import argparse
import json
import re
import stat
import tarfile
import zipfile
from pathlib import Path

import build_elk_local_candidate as base
import verify_elk_candidate as verify_elk

PROJECT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT / 'tmp/elk-generator-review-9bc'
PREVIOUS = PROJECT / 'tmp/elk-fixed-source-7ca/elkjs-11-roots-review-d.zip'
PREVIOUS_SHA = 'ee19af9f3d3be729584fcfdf4d08a4c860a5d48fcfb1ce840e4849802d83fbc8'
PREFIXES = ('plugins/org.eclipse.elk.core.meta/', 'plugins/org.eclipse.elk.core.meta.ui/')
VARIANTS = {
    '7ca': {'commit': verify_elk.COMMIT, 'tree': verify_elk.TREE,
            'directory': PROJECT / 'tmp/elk-fixed-source-7ca', 'tar': 'elk-7ca.tar.gz',
            'tree_file': 'root-tree.json', 'sha256': base.TAR_SHA, 'count': 96},
    '9bc': {'commit': '9bc93474e1dc649450e8c97abb45d16b7c88e35b',
            'tree': '96d01f92f5768fdae183eeb4a93ca9d32719f110',
            'directory': OUTPUT_DIR, 'tar': 'elk-9bc.tar.gz', 'tree_file': 'tree.json',
            'sha256': '0407f76021af5b72dd002cb914a2b892beb8e8a1963afcb9abda38a80513cba3', 'count': 97},
}


def build(variant, output):
    if variant not in VARIANTS:
        raise ValueError('invalid-variant')
    if (output.resolve().parent != OUTPUT_DIR.resolve() or
            not re.fullmatch(r'elkjs-generator-review-' + variant + r'-[a-z0-9]+\.zip', output.name)):
        raise ValueError('invalid-output')
    if output.exists():
        raise FileExistsError('output-already-exists')
    spec = VARIANTS[variant]
    archive = spec['directory'] / spec['tar']
    if base.digest(archive.read_bytes()) != spec['sha256'] or base.digest(PREVIOUS.read_bytes()) != PREVIOUS_SHA:
        raise ValueError('input-hash-mismatch')
    commit = json.loads((spec['directory'] / 'commit.json').read_text(encoding='utf8'))
    tree = json.loads((spec['directory'] / spec['tree_file']).read_text(encoding='utf8'))
    verify_elk.verify(archive, commit, tree, spec['commit'], spec['tree'])
    payload = {}
    seen = set()

    def add(path, data):
        base.check_entry(path, data)
        if path.casefold() in seen:
            raise ValueError('duplicate-path')
        seen.add(path.casefold())
        payload[path] = data

    with zipfile.ZipFile(PREVIOUS) as previous:
        if previous.testzip() is not None or len(previous.namelist()) != len(set(previous.namelist())):
            raise ValueError('previous-archive-invalid')
        for entry in previous.infolist():
            if entry.filename == 'MANIFEST.json':
                continue
            if entry.is_dir() or entry.file_size > verify_elk.MAX_FILE:
                raise ValueError('previous-entry-invalid')
            add(entry.filename, previous.read(entry))
    if len(payload) != 722:
        raise ValueError('previous-entry-count')
    generator_count = 0
    root = 'elk-' + spec['commit'] + '/'
    with tarfile.open(archive, 'r:gz') as tar:
        for member in tar:
            if not member.isfile():
                continue
            rel = member.name[len(root):]
            if rel.startswith(PREFIXES):
                add(f'elk-generator-candidate/{variant}/{rel}', tar.extractfile(member).read())
                generator_count += 1
    if generator_count != spec['count']:
        raise ValueError('generator-count-mismatch')
    records = [{'path': name, 'bytes': len(data), 'sha256': base.digest(data)} for name, data in sorted(payload.items())]
    manifest = {'schema': 1, 'status': 'local-review-candidate-only',
                'scope': 'Direct roots and one generator source candidate; actual build inputs and corresponding source completeness remain undetermined; not approved for distribution',
                'previous_candidate_sha256': PREVIOUS_SHA, 'generator_variant': variant,
                'generator_commit': spec['commit'], 'generator_tree': spec['tree'],
                'generator_archive_sha256': spec['sha256'], 'files': records}
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf8')
    add('MANIFEST.json', manifest_bytes)
    with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as result:
        for name, data in sorted(payload.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            result.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(output) as result:
        if result.testzip() is not None or result.namelist() != sorted(payload):
            raise ValueError('output-archive-invalid')
        if any(base.digest(result.read(name)) != base.digest(data) for name, data in payload.items()):
            raise ValueError('output-content-mismatch')
    return {'variant': variant, 'entries': len(payload), 'sha256': base.digest(output.read_bytes()),
            'manifest_sha256': base.digest(manifest_bytes)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('variant', choices=tuple(VARIANTS))
    parser.add_argument('output', help='new elkjs-generator-review-VARIANT-NAME.zip in local tmp directory')
    args = parser.parse_args()
    try:
        print(json.dumps(build(args.variant, OUTPUT_DIR / args.output)))
    except (OSError, ValueError, zipfile.BadZipFile, tarfile.TarError):
        parser.exit(1, 'candidate creation failed; inspect local inputs\n')
