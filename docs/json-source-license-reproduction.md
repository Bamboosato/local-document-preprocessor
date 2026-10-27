# ソース追跡・原文収集の再現手順

2026-10-27。[調査結果と限界](json-source-license-validation.md)を先に読む。調査用の固定ソースを読む手順で、本体統合・デプロイ・ユーザー実機操作を行わない。通常build/CIからネットワーク調査を呼ばない。

## anydoc

root/prototypeの固定npm依存を導入済み、既存Dockerが利用可能なWindows環境で行う。同じ実機で他テストを並行しない。cwdは`experiments/json-gates`。

```powershell
npm run research:source-prepare
```

固定アーカイブと元Cargo.lockを照合し、Git管理外`evidence/source-audit/anydoc`へ取得、改行をLFに揃えた調査用resolve.shを作る。上流のbuild.sh等を実行しない。次を一つのコマンドとして実行する（改行せず入力）。

```powershell
docker run --rm --mount "type=bind,source=$((Get-Location).Path)\evidence\source-audit,target=/audit" --workdir /audit/anydoc rust@sha256:1a939748a7cbab172de91a014e3804a97af1394a8c844faa67fce9401c4e40fb sh /audit/resolve.sh
```

共有は調査フォルダーだけ。ポート公開・特権モード・Docker socket共有は使わない。hostのCargo/PATHは変更しない。終了時にコンテナーは削除する。Cargo tree/metadataは依存を取得するがコンパイル・build.rsは実行しない。

```powershell
npm run research:source-collect
npm run research:source-review
```

collectはlock不変、固定候補との包含、crate checksumを確認。原文がないものはmissingとして記録する。今回のinclude_dir系だけは固定VCS情報とworkspace宣言を検証して補完する。review（`research:source-review`）はレビュー用原文ファイルとJSONを生成するローカル操作。missingがあれば生成を停止する。原文とmanifestの差分を確認し、依頼された範囲だけコミットする。

## ELK

```powershell
npm run research:elk
```

固定elkjs commitと公開workerのhash、ELK tag/#955/直前候補の差分と修正特徴を照合する。`resolution`に残る未確定事項を消して成功へ読み替えない。上流のコンパイルやJS実行はしない。

## PDFium

```powershell
npm run research:pdfium
```

Windows Nodeの取得経路で失敗する場合は、同一固定treeを次の公開APIから`evidence/source-audit/pdfium-tree.json`へ取得し、`--local-tree`を使用できる。別commitへ置換しない。

```powershell
Invoke-WebRequest -Uri 'https://api.github.com/repos/embedpdf/pdfium/git/trees/cb29e78f2ba00c9298714d5f4a8bf7765f1e802f?recursive=1' -OutFile 'evidence/source-audit/pdfium-tree.json'
```

今回成功した実行環境は公式Nodeのdigest固定コンテナー。prototypeディレクトリーを読取専用で`/work/experiments/json-gates`へ、rootの`docs/evidence`と`docs/third-party-source-licenses`だけを書込可能で同じ`/work/docs/...`へ共有し、作業ディレクトリーを`/work/experiments/json-gates`にする。

```text
image: node@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
command: node pdfium-license-research.mjs --local-tree
```

生成先は原文フォルダーとJSONのみ。パッケージ本体や製品SW/CSPを変更しない。失敗時にTLS検証・保護設定を無効化しない。固定URL/hash、失敗したsource ID/状態だけを記録し、本文・秘密情報・個人のパスはログへ出さない。

## 公開WASM・npm署名の追補

[追加結果](json-published-wasm-validation.md)。cwdは引き続き`experiments/json-gates`。

```powershell
node published-wasm-research.mjs prepare
```

専用private package/lockをGit管理外`evidence/published-wasm`へ生成する。既存Nodeのdigest固定コンテナーへこのディレクトリーだけを`/audit`として共有し、`--workdir /audit`で次を逐次実行する。イメージは上記Nodeと同じで、npm 11.19.1を記録する。資格情報やユーザー設定は共有しない。

```sh
npm ci --ignore-scripts --no-audit --no-fund > install.log 2>&1
npm audit signatures > signatures.log 2>&1
npm audit signatures --json --include-attestations > signatures.json
```

各終了コード0を確認してから次へ進む。失敗出力を成功した記録へ混入させない。ホストで`node published-wasm-research.mjs review`を実行すると、保存結果のdigest/sourceと件数を検査し、レビュー用JSON/bundleとテキスト結果を保存する。reviewは暗号検証そのものではない。

`node published-wasm-research.mjs collect`は固定root lockの2 tarballを取得し、SRI照合、安全tar読取、内包WASMと導入済みbytesを照合する。Nodeコンテナーで実行する場合、prototypeとroot node_modules/package-lock.jsonを読取専用で`/work`以下の同じ相対位置へ、`docs/evidence`だけを書込可能で共有する。上流WASMを実行せず、製品distは変更しない。

履歴照会のURL/run/jobは[観測JSON](evidence/json-build-history-observations.json)を使う。将来のAPI応答は変わるので、この観測の0件/410/queuedを恒久的な状態とみなさない。

## オフライン検査の実行

```powershell
npm run test:sources
npm run test:distribution
```

原文フォルダーの`.gitattributes`を保持する。改行変換・原文削除・版ずれはhash検査を失敗させる。外部ネットワークが使えない状態で研究スクリプトを無理に成功扱いにせず、既存snapshotは調査日時付きの履歴として扱う。
