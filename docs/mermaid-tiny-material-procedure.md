# Tiny配布材料のクリーン再取得と提供形態

> 2026-11-10 現行の提供形態: [本体12.3.0切替報告](mermaid-tiny-12.3-product-cutover.md)を参照。承認済み候補とhash照合した69原文/75資産を `docs/third-party-source-licenses/mermaid-tiny/12.3.0/` に固定し、通常ビルドはtmpやネットワークを使わずここから複写する。版・台帳・監査の基点は `scripts/tiny-release.json`。`scripts/freeze-tiny-licenses.mjs` は新しい版の固定用で、既存出力を上書きしない。以下の12.2.0クリーン取得手順・不合格は履歴として保持し、12.3.0の再取得根拠は[候補照合](mermaid-tiny-12.3-review.md)を参照する。

> 最新状況: 材料の再取得と本体提供形態は確認したが、固定Tiny 12.2.0は内包依存の脆弱性監査で配布採用を保留している。[本体移行報告](mermaid-tiny-product-migration.md)を参照。以下の取得手順は、その候補を検証するための再現手順であり、配布承認ではない。

対象は隔離PoCのTiny 12.2.0。製品への接続・公開は行わない。固定計画は [取得計画](evidence/mermaid-tiny-material-retrieval-plan.json)。古い調査ディレクトリーやnpm/pnpmキャッシュを参照せず、公開HTTPSから直接取得する。

## 検証観点（ケース作成前）

最優先で防ぐのは、別版の原文を正常と判定することと、不完全な再取得を完了扱いすること。

|観点|正常系|異常系|境界値|状態遷移|
|---|---|---|---|---|
|機能|固定材料から従来と同一の提供物を生成|欠落・hash不一致・取得不能を拒否|対象63組と参照資料の過不足|取得完了後だけindexを作る|
|非機能|キャッシュ・install script不要|不正パス・重複・特殊ファイルを拒否|取得サイズ・展開サイズ・項目数の上限|失敗フォルダーを再使用・上書きしない|
|データ|原文・表示・パッチ・bundleを固定hash照合|計画と証跡の不一致、別版を拒否|ディレクトリー項目も検査・計数|材料改変後は配置を拒否|
|UI|一覧から全原文・参考資料をオフラインで開く|未取得の外部リンクに依存しない|同一オリジン78静的資産|異なるPWA世代で旧タブ保持→新世代へ移行|

合成アーカイブで異常・境界を再現し、実取得では新規の空ディレクトリーを使用する。ブラウザー試験は逐次実行。ネットワーク制限による初回取得失敗と、材料の不一致は原因を区別する。PoC対象E2Eを実施し、本体全件・実配信・Windows実機・macOS/iOSは対象外とする。

## 再取得手順

前提: Python 3（取得は標準ライブラリーのみ）、Node/npm、ルートとPoCのlockに基づく開発ツール。材料の取得・配置ではinstall scriptを実行しない。コマンドはリポジトリー直下から実行する。

```powershell
python experiments/mermaid-no-elk/fetch-materials.py docs/evidence/mermaid-tiny-material-retrieval-plan.json tmp/tiny-materials-new
node experiments/mermaid-no-elk/build.mjs --materials=../../tmp/tiny-materials-new
node experiments/mermaid-no-elk/prepare-license-candidates.mjs tmp/tiny-materials-new
```

`--materials` はPoCディレクトリーからの相対パス。配置コマンドの材料パスは実行ディレクトリーからの相対パス。検証一式はPoCディレクトリーで次を実行する（出力JSONは新規パス）。

```powershell
node run-acceptance.mjs ../../tmp/tiny-materials-new ../../tmp/tiny-clean-acceptance.json
python -m unittest discover -s . -p test_fetch_materials.py -v
```

取得先は新規であること。失敗時はindexを作らず、そのフォルダーは調査用として残し、別の新規パスで再実行する。取得先・材料・証跡を自動削除しない。65 npm tarballは固定上流lock/Tiny lockのSHA-512、上流source tarは固定commitとSHA-256、由来原文2点は固定URL・サイズ・SHA-256で検証する。展開コマンドは使用せず、アーカイブから指定した通常ファイルだけを読む。固定計画を変更するときのみ、保守用 `make-material-plan.py` がPyYAMLと再構築済み上流を必要とする。通常の再取得には不要。

## 採用する提供形態

取得計画・照合スクリプト・証跡を管理対象とし、実行bundleと原文・表示・パッチを同じ生成物の固定スナップショットとして扱う。材料ディレクトリーのindexは249ファイルのhashを保持する。これは原文と表示を取り出す最小スナップショットであり、パッチ適用済み依存のインストール済み環境や、上流ソース一式の代替ではない。

最終静的形態は `/licenses/index.html`、原文68点、`source-notices.txt`、上流パッチ2点、`generator-license.txt`、`manifest.json` の74資産。Tinyを含む描画PoCは合計78資産。DOMPurifyはApache-2.0を選ぶ方針を表示し、両原文を保持する。表示にはパッケージ名・版、由来ソースの固定commit、生成器参考資料と実行依存の区別、変更の説明を保持する。バンドル内の既存表示を除去しない。

この形態を本体の第三者ライセンス導線へ接続し、PWA manifestで本文hashを固定する計画とする。原文本文を外部サイトから取得する設計にはせず、同一オリジンでオフライン閲覧できるようにする。大きな調査アーカイブはアプリに同梱せず、PWA自動取得の対象にしない。Tiny関連で追加のソース一式提供が必要な依存は今回の確認範囲では検出していない。anydoc/PDFiumの義務・提供物は独立して扱う。

現段階は製品版の提供形態を隔離PoCで具体化したもの。本体接続後は製品の表示文言、リンク、原文、bundleとPWA世代を再検査する。公開条件充足・実配信・実機の判定とは分ける。
