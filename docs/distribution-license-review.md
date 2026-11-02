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

## パス不一致の検出・修正

`@`を`%40`にした原文URLにローカルVite previewが200でアプリHTMLを返す現象を再現した。200だけでは原文到達を証明できず、同じURLをSHA-256で検査するPWA installも完了できない。影響は重大（オフライン準備失敗）。原因は配布URLの正規化と配信側の解釈の不一致、および実サーバーで本文まで照合しないテスト観点不足。従来E2Eの非同期predicateもactivationの完了保証になっていなかった。

生成manifest・SW・一覧リンクで `@` をそのまま使い、既存の `%40` 入力もSW内で正規化する。ready待機を明示し、オフラインで原文本文を確認するE2Eと、両表記を検証するSW単体テストを追加。Windows Chromiumの手動自動化でPWA ready→オフライン→JSON図・一覧→DOMPurify MPL原文の内容一致と元結果保持を確認した。初回のready待ち試行は非同期predicateの誤用でタイムアウトし、`navigator.serviceWorker.ready` を待つ手順で再実行した。実配信CDNの動作は未確認。

## 検証範囲

- Windowsの `npm run check`: 単体/Component 121件、SW 10件、ビルド・配布物検査成功。その後のURL修正ではSW 11件とビルド・配布物検査を再実行。追加E2EはChromiumで1件成功。文書検査は62文書・249リンク・0件問題、監査ポリシー12件成功、依存脆弱性は本番/全依存とも0件（検査時点）。
- ビルド出力は443静的資産、約24.5MB。列挙した原文の全hashを確認した。npm installからのクリーン環境再現ではない。
- 変更がSWに及ぶため、Chrome/EdgeのPWA対象6件ずつをWindowsで直列実行し、両方成功（Chrome 1.9分、Edge 2.2分）。通常の全E2E、Firefox、実インストール済みPWA/実容量、macOS/iOSは今回未実施。自動化成功は実機・本番配信の証明ではない。

## 条件と残る確認

[EPL-2.0原文](https://www.eclipse.org/legal/epl/epl-v20.html)の3.1は、実行形式を配布する場合の対応ソースの提供と取得方法の案内を規定し、3.3には例外もある。実際の配布対象・適用関係・対応ソースと案内方法を個別に確認する必要がある。[Apache-2.0原文](https://www.apache.org/licenses/LICENSE-2.0.html)の4節は、対象物にNOTICEがある場合の告知などを規定する。各依存の適用範囲や配布形態を確定するまでは、原文同梱だけを条件充足とみなさない。

未完: クリーンインストールからの再現、実配布先/CDNと第三者ソース取得先の継続的な到達性、各依存の告知と対応ソースの最終判定、anydoc/PDFium内包物の未証明範囲の評価。特にELKの[EPL原文](https://github.com/kieler/elkjs/blob/0.9.3/LICENSE.md)と[elkjs 0.9.3リリース](https://github.com/kieler/elkjs/releases/tag/0.9.3)を候補として記録するが、対応ソースの完全性は未確定。既存の[ELK・WASM原文調査](json-source-license-validation.md)のELK実checkout・公開WASMとの完全対応・PDFium実リンクgraphは未証明のまま保持する。配布判断前に、該当する条件・告知・ソース提供方法について権利者または専門家による確認が必要。
