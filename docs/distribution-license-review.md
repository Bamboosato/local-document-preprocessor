# 現行配布候補のライセンス照合と残件

2026-11-02。PR #22を取り込んだmain `a6642c3bcc0bc53a0e2e121f381bc9ea0b03b6d7` を基点とする。対応ソース等に未証明項目が残り、配布条件を満たしたという判定ではない。macOS/iOS対象外、実機はユーザー別途、マージとデプロイはしない。

## 調査観点

機能は配布物と取得先の一致、非機能はオフライン時と外部提供先の可用性、データは版・原文bytes・告知の欠落、UIは利用者が原文と対応ソースに到達できること。正常系・欠落/取得不能・空/複数NOTICE・新旧版切替を区別する。最優先は配布条件を満たしたと誤認させることを防ぐ。

## 確認結果

- 当初の `dist/licenses/inventory.json` は本番npm依存233パッケージ・原文235ファイルを列挙し、列挙済みファイルのSHA-256は一致したが、DOMPurifyの `LICENSE-MPL` が未収集だった。ファイル名規則がハイフンを許可しない実装問題と、inventory内だけを見る検査観点不足が原因。ハイフンを含む原文名を収集し、実行スクリプト拡張子は除外、DOMPurifyの両原文を配布物検査で確認する。NOTICEはes-toolkit由来の1件。この一覧は依存候補の保守的な収集であり、最小リンク一覧やWASM実リンクgraphの証明ではない。
- `elkjs@0.9.3` の原文 `LICENSE.md` は `EPL-2.0` として一覧に含まれる。配布manifestにはELK関連JavaScriptが2ファイル含まれ、PWAは全静的資産を事前取得する。
- JSONから生成するソースは `flowchart TD` で、製品のMermaid初期化にはELK指定がない。インストール済みMermaid 12.2.0で製品と同じ初期化を行った設定照会では `layout: elk` だった。Windows ChromiumでSW登録を抑止した状態の合成JSON表示では `/assets/elk-QONTBCTQ-B86qWPhQ.js` の取得とSVG表示を確認した。現行方式でもELKは使用される。
- 当初画面に原文へのリンクがなかったため、npm原文一覧を生成し、結果を保持したまま別タブで開くリンクを追加した。233パッケージ・236原文すべてのhash一致を確認。既定メタデータがnullの `khroma@2.1.0` も原文はMIT。`dompurify@3.4.17` は `(MPL-2.0 OR Apache-2.0)` と宣言し、両原文を同梱する。どちらの条件を選択するかを今回決定したわけではない。
- es-toolkitのNOTICEはLodash由来の告知を含み、その原文をnpm一覧から参照できる。anydoc/PDFium内包物候補の[取得済み原文と出典](json-source-license-validation.md)は調査証跡であり、npm一覧だけで全内包物の告知が済むとは判断しない。

|配布候補・版|同梱原文/告知|対応ソース・残る確認|
|---|---|---|
|Mermaid 12.2.0|MIT原文|[npmアーカイブ](https://registry.npmjs.org/mermaid/-/mermaid-12.2.0.tgz)、hashとintegrityはinventory。npm配布物は編集用ソースの完全性を意味しない|
|elkjs 0.9.3|EPL-2.0原文|[リリース/ソース候補](https://github.com/kieler/elkjs/releases/tag/0.9.3)。ELK生成時checkout・生成依存との完全対応は未証明|
|DOMPurify 3.4.17|Apache-2.0とMPL-2.0両原文|[npmアーカイブ](https://registry.npmjs.org/dompurify/-/dompurify-3.4.17.tgz)。条件選択と告知の最終判定は未実施|
|es-toolkit 1.53.0|MIT原文とNOTICE|[npmアーカイブ](https://registry.npmjs.org/es-toolkit/-/es-toolkit-1.53.0.tgz)。NOTICE対象部分と実バンドルの関係は未判定|
|anydoc WASM 0.1.7|npmパッケージのMIT原文|[npmアーカイブ](https://registry.npmjs.org/@firecrawl/anydoc-wasm/-/anydoc-wasm-0.1.7.tgz)と[上流調査](json-source-license-validation.md)。Rust依存候補96件と実WASMの完全対応は未証明|
|PDFium wrapper 2.14.4|wrapper MITと同梱PDFium Apache-2.0原文|[npmアーカイブ](https://registry.npmjs.org/@embedpdf/pdfium/-/pdfium-2.14.4.tgz)と[上流調査](json-source-license-validation.md)。実リンクgraphと内包物の網羅性は未証明|

## 追加照合: バイト・ソース参照・原文の対応

2026-11-02に、PR #23のローカルビルド出力と保存済み[公開WASM対応記録](evidence/json-published-wasm-correspondence.json)・[収集原文](third-party-source-licenses/)を照合した。次の「確認済み」は対象を指定したバイト/参照の一致であり、配布条件の最終承認や全リンク構成の証明ではない。

|対象|確認済み|候補・未証明|
|---|---|---|
|ELK / elkjs 0.9.3|標準図でELK chunkが取得される。配布一覧にELK由来chunk 2件、npm原文 `LICENSE.md`（SHA-256 `89591d4578fb1ebd91501312a3d25f021bd865a2e436641c1cf7b1bc3c1617`）。[0.9.3リリース](https://github.com/kieler/elkjs/releases/tag/0.9.3)はELK 0.9.1と#955を記載。elkjs側commitは `a8304cf79fde75bc2ab1a89d28320f53f8637436`。保存したELK原文2件は記録hashと一致|ELK側 `7ca51784e42a24201f29bc13e458728b6fc61cdc` と `9bc93474e1dc649450e8c97abb45d16b7c88e35b` は直接ソース候補。実checkout・生成依存・公開chunkとの完全な生成対応は不明。[追跡記録](evidence/json-elk-source-trace.json)参照。npm原文があることは編集用ソース全体の提供を意味しない|
|anydoc WASM 0.1.7|配布WASMと導入済みnpm内WASMのSHA-256は共に `409e45e75062df06bed445c352ffddaf3bae15ff376f5d514d45f4891debd09e`。保存済み公開tarball内bytesとも一致。既存の署名検証済みprovenanceは[固定source commit](https://github.com/firecrawl/anydoc/tree/4a45addbd607e8b59f0c263bca26aab228e10370)と公開workflowを参照。実際のHTTP APIでもcommitの存在を確認。保存したRust target候補195原文のhash不一致0件|target候補96依存は固定sourceのCargo解決結果で、実WASMのリンク一覧ではない。公開run APIは引き続きqueued・conclusionなしであり、成功ビルドログとは扱わない。コンパイラ/lock/実リンク内容と全告知の一致は不明|
|PDFium wrapper 2.14.4|配布WASMと導入済みnpm内WASMのSHA-256は共に `c0af5a6aca30d7e54a149c3a68e317116ca906d6edc28fd3318b12c7d9478ac8`。保存済み公開tarballとviewer tag内bytesの一致記録あり。npm wrapperのMIT原文と `LICENSE.pdfium` を同梱し、保存したsource/DEPS候補29原文のhash不一致0件|[固定DEPS原文](https://raw.githubusercontent.com/embedpdf/pdfium/cb29e78f2ba00c9298714d5f4a8bf7765f1e802f/DEPS)は取得可能。2026-11-02時点の旧commit GitHub APIは移動応答で、新しい取得先の同等性は未確認。viewerのrelease run成功は確認できたが、保存済み調査ではjob log HTTP 410・artifact 0件。実submodule/ビルド引数/リンクgraphは不明|

3対象の保存原文は合計226件で全hash一致。これらはリポジトリ内の調査証跡であり `dist/licenses/dependencies/` に同じパスで一括収録されるわけではない。npm原文一覧内の任意ファイルと同じhashを持つ件数は、anydoc候補195件中5件、PDFium候補29件中0件、ELK候補2件中2件。汎用的な同一ライセンス文の重複もあり、この件数から実内包物や法的に必要な原文の件数は決められない。

### 次の最小作業と受入条件

1. **こちらで可能な照合**: 実配布候補に使う固定版ごとに、実行資産のhash、公開tarball/署名記録、source候補、同梱/調査用原文とNOTICEの所在、告知候補を一つの対応表に固定する。受入条件は各欄に証拠へのリンクと「一致/候補/不明」を付け、不明を空欄や成功にしないこと。ELK chunkからの再現やWASMリンクgraphは、そのための証拠が得られない限り不明のままにする。
2. **実配信・実機**: 公開前の実配信先でhash/MIME/案内先とソース取得先の到達性を確認し、ユーザーがWindowsのインストール済みPWA・オフライン・実容量を確認する。受入条件は対象バージョン・ブラウザー・配信元・操作順・結果を記録すること。macOS/iOSは対象外。
3. **配布判断**: 実際に含まれる対象物について、原文/NOTICEの提供場所、EPL該当時の対応ソースと取得方法、二重ライセンスの選択、未証明の許容可否を判断する。受入条件は、選んだ配布形態と対象バージョンに対し、根拠と責任者の判断が記録されること。権利者への連絡や承認取得は今回行っていない。

実装検証head `12658041a87049e9ab401d3f8a6514c893d06c4f` の[CI](https://github.com/Bamboosato/local-document-preprocessor/actions/runs/41377275454)は両ジョブ成功し、UbuntuのVerifyで `Install dependencies`（`npm ci`）も成功した。これはWindowsでのクリーンインストール再現を示さない。今回の追加作業は静的証跡と文書のみで、実機の並列操作や全E2Eの再実行はしていない。文書更新後のheadのCI結果はPRのChecksを参照する。

## パス不一致の検出・修正

`@`を`%40`にした原文URLにローカルVite previewが200でアプリHTMLを返す現象を再現した。200だけでは原文到達を証明できず、同じURLをSHA-256で検査するPWA installも完了できない。影響は重大（オフライン準備失敗）。原因は配布URLの正規化と配信側の解釈の不一致、および実サーバーで本文まで照合しないテスト観点不足。従来E2Eの非同期predicateもactivationの完了保証になっていなかった。

生成manifest・SW・一覧リンクで `@` をそのまま使い、既存の `%40` 入力もSW内で正規化する。ready待機を明示し、オフラインで原文本文を確認するE2Eと、両表記を検証するSW単体テストを追加。Windows Chromiumの手動自動化でPWA ready→オフライン→JSON図・一覧→DOMPurify MPL原文の内容一致と元結果保持を確認した。初回のready待ち試行は非同期predicateの誤用でタイムアウトし、`navigator.serviceWorker.ready` を待つ手順で再実行した。実配信CDNの動作は未確認。

## 検証範囲

- Windowsの `npm run check`: 単体/Component 121件、SW 10件、ビルド・配布物検査成功。その後のURL修正ではSW 11件とビルド・配布物検査を再実行。追加E2EはChromiumで1件成功。文書検査は62文書・249リンク・0件問題、監査ポリシー12件成功、依存脆弱性は本番/全依存とも0件（検査時点）。
- ビルド出力は443静的資産、約24.5MB。列挙した原文の全hashを確認した。npm installからのクリーン環境再現ではない。
- 変更がSWに及ぶため、Chrome/EdgeのPWA対象6件ずつをWindowsで直列実行し、両方成功（Chrome 1.9分、Edge 2.2分）。ローカルでの全E2E、Firefox、実インストール済みPWA/実容量、macOS/iOSは未実施。PRのCI結果はChecksを参照する。自動化成功は実機・本番配信の証明ではない。

## 条件と残る確認

未証明の理由、必要な証拠、配布方式・対象版・提供先・受入範囲の判断は[配布判断の根拠表](distribution-decision-matrix.md)に、承認済みの[版別アーカイブのローカル検証](distribution-local-archive-validation.md)は別途整理した。生成したZIPはローカルのみで保持する。

[EPL-2.0原文](https://www.eclipse.org/legal/epl/epl-v20.html)の3.1は、実行形式を配布する場合の対応ソースの提供と取得方法の案内を規定し、3.3には例外もある。実際の配布対象・適用関係・対応ソースと案内方法を個別に確認する必要がある。[Apache-2.0原文](https://www.apache.org/licenses/LICENSE-2.0.html)の4節は、対象物にNOTICEがある場合の告知などを規定する。各依存の適用範囲や配布形態を確定するまでは、原文同梱だけを条件充足とみなさない。

未完: クリーンインストールからの再現、実配布先/CDNと第三者ソース取得先の継続的な到達性、各依存の告知と対応ソースの最終判定、anydoc/PDFium内包物の未証明範囲の評価。特にELKの[EPL原文](https://github.com/kieler/elkjs/blob/0.9.3/LICENSE.md)と[elkjs 0.9.3リリース](https://github.com/kieler/elkjs/releases/tag/0.9.3)を候補として記録するが、対応ソースの完全性は未確定。既存の[ELK・WASM原文調査](json-source-license-validation.md)のELK実checkout・公開WASMとの完全対応・PDFium実リンクgraphは未証明のまま保持する。配布判断前に、該当する条件・告知・ソース提供方法について権利者または専門家による確認が必要。
