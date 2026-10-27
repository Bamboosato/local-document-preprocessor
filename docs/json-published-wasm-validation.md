# 公開WASMの署名・対応とELK実checkoutの追跡

2026-10-27。基点`81339ca4b0307cbb12b2fb029bc39a14821e1a7a`、PR #17の追加調査。[先行報告](json-source-license-validation.md)と[検証観点](json-source-license-plan.md)を補完する。本体統合保留、実機はユーザーが別途確認、macOS/iOS対象外、マージ・デプロイなし。

## 今回確認できた対応

公式npm 11.19.1 / Node 24.22.1で`npm audit signatures`を実行し、2パッケージのregistry署名と、anydoc 1件のprovenance attestationの検証が成功した。`invalid=[]`、`missing=[]`。専用のprivate packageに固定2依存だけを入れ、`npm ci --ignore-scripts --no-audit --no-fund`を先に実施した。root/prototypeの依存・lockは変更していない。

環境は公式`node@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205`。コンテナーへ共有したのは調査ディレクトリーだけで、資格情報・Git・Docker socket・ポート公開は使わない。上流build scriptは実行しない。[npm公式の検証説明](https://docs.npmjs.com/verifying-registry-signatures/)、[provenance説明](https://docs.npmjs.com/generating-provenance-statements/)

|段階|anydoc 0.1.7|PDFium 2.14.4|
|---|---|---|
|registry署名|公式npmで成功|公式npmで成功|
|公開tarballのSHA-512 SRI|固定root lockと一致|固定root lockと一致|
|tarball内WASMと導入済みWASM|6,485,379 bytes一致|4,633,788 bytes一致|
|provenance attestation|公式npmで検証成功、subject digestも上記SRIと一致|今回の結果にはなし|
|source/workflowへの対応|署名付き公開工程のclaimは固定commit/workflowを指す|先行調査のviewer tag内WASMとbytes一致|
|実コンパイルの全依存・再現ビルド|未証明|未証明|

anydocのWASM SHA-256は`409e45e75062df06bed445c352ffddaf3bae15ff376f5d514d45f4891debd09e`、PDFiumは`c0af5a6aca30d7e54a149c3a68e317116ca906d6edc28fd3318b12c7d9478ac8`。[tarballとWASM照合記録](evidence/json-published-wasm-correspondence.json)を保存した。

[npm検証出力・公開署名bundle](evidence/json-npm-signature-verification.json)と[テキスト結果](evidence/json-npm-signature-summary.txt)を保持する。npmのJSONの`verified`配列は今回attestationのあるanydoc 1件を列挙し、registry署名2件の件数はテキスト結果にある。これを混同しない。オフラインのSL検査は保存結果の整合検査であり、暗号検証の代替ではない。

## anydocのsourceと公開工程

検証済みSLSA v1 claimのsubject SHA-512は取得tarballの固定SRIと一致し、resolvedDependenciesは`firecrawl/anydoc@4a45addbd607e8b59f0c263bca26aab228e10370`、workflowは`.github/workflows/release.yml` / `refs/tags/v0.1.7`を指す。先行報告ではpayloadの内容照合だけだったが、今回公式npmによるattestation検証まで進んだ。

ただし、これは公開工程・source参照・tarball・内包WASMを結ぶ証拠であり、そのsourceだけからWASMを生成したことや、先行Cargo target graph 96件と実リンクコードの完全一致までは証明しない。workflowはstable Rustが可変、wasm-pack buildに明示`--locked`なしで、完全な再現条件が不足する。npm provenance自体もソースの安全性や全依存一覧を保証しない。

claimの[run 31127846118](https://github.com/firecrawl/anydoc/actions/runs/31127846118)を公開APIで追ったところ、head SHA/tag/pathは一致するがstatus=queued、conclusion=null、jobs=0件だった。署名検証の成功とは別の観測であり、公開run APIを成功ビルドログとして採用しない。この不整合の原因、実際のRust版・コンパイルログ・全リンク内容は確定していない。

## ELKとPDFiumの履歴探索の限界

ELKはelkjs固定commit `a8304cf79fde75bc2ab1a89d28320f53f8637436`をhead_shaとしてActions履歴を照会したが0件、0.9.3のrelease添付assetも0件だった。先行の「ELK 0.9.1＋#955相当」という直接ソース特徴は維持する。一方で実checkoutを示すログ・manifest・生成物への埋込revisionは今回も得られていない。履歴0件からビルド未実施や特定commitを推定しない。

PDFiumはviewer固定commit `07ed5fe3739ec22522450863282b1b0618b88a6f`に20件のrunを確認し、[Release run 27126180386](https://github.com/embedpdf/embed-pdf-viewer/actions/runs/27126180386)とrelease jobのsuccessを確認した。しかしjob log取得はHTTP 410、run artifactは0件だった。release成功や同じcommitだけではWASM生成時のsubmodule・GN args・DEPS・リンクgraphを実行証拠として確定できない。

[公開API観測記録](evidence/json-build-history-observations.json)に照会URL、対象commit/run/job、結果を保存した。0件や410の原因を履歴期限・削除などのいずれかへ断定しない。

## 検査・残件

SL-10は固定lock/SRIと公開tarball内WASM・導入済みbytesの対応、SL-11は保存attestationのsubject/source対応と未確定境界を検査する。改変SRI等の異常系とarchive境界検査は既存DS/SLも併用する。ネットワーク調査は通常CIから呼ばない。製品ランタイム変更がないためローカルE2Eは未実施、実機・Apple・本体統合を成功扱いにしない。

ローカル結果: SL 11/11、DS 8/8成功。文書48件・ローカルリンク169件、問題0件。追加スクリプトの構文検査、`git diff --check`も成功。npm JSONがregistry署名全件を列挙するという前提は実出力で否定され、attestation一覧とテキスト件数を分けて修正した（データ形式の観点）。

残件は次の通り。

1. ELK: 公開者が実ビルドで用いたcheckout commit、固定生成依存、生成ログ/manifest。公開資料だけでは一意に確定できず、上流保持記録か固定条件での再生成照合が必要。
2. anydoc: 実コンパイルtoolchain/lock・リンク内容・生成資産と96件のtarget graphの完全対応。今回の署名付き公開工程との対応は成果として確定し、再現ビルドは未実施。
3. PDFium: 実GN/リンクgraphとvendor WASMの生成対応。registry署名とtarball内WASM一致は確認できたが、ソース再現・全内包物は未証明。
4. 配布前: 対応ソース・原文・NOTICE・バンドル版と提供先の整合。原文226件の収集と配布承認は別段階。

上流への連絡・issue作成は行っていない。実機確認・本体統合・配布は今回の作業対象に含めない。
