# JSON採用方式の配布条件確認表

> 最新の[ELK/WASM追加調査](json-source-license-validation.md)でanydocのWASM target 96依存・原文195件、PDFium候補29件、ELK関連2件を収集した。以下の188候補/未収集という記述は初回調査時点の履歴として保持し、現在の未収集状態を示さない。実バイナリ対応等の残条件は最新報告を参照する。

> 2026-10-27追加調査: 固定版metadata/出典の[機械記録](evidence/json-distribution-source-records.json)、[追加報告](json-followup-review-validation.md)、[告知文の下書き](json-third-party-notice-draft.md)を追加した。原文/対応ソースの残条件は継続する。

2026-10-27。[接続前計画](json-integration-readiness-plan.md)に沿う独立調査。本体へ新しい依存を追加せず、公開・デプロイも行っていない。

## 今回具体化した証跡

旧報告の118依存の保守的な収集とは別に、WASM共存試作のRollupモジュール一覧をroot/prototypeそれぞれのlockへ対応付けた。`dist-integration/licenses/bundled.json`へ122パッケージ、912モジュール（両WASMを含む）、原文/NOTICE 124ファイルを記録する。tree-shaken項目を含み得る保守的な一覧で、最小依存一覧とは称しない。

各項目は名前、版、取得元tarball、integrity、repository、lock内の相対位置、モジュール相対名とSHA-256、同梱原文の相対位置を持つ。絶対ローカルパス、文書本文を含めない。未識別、lock不一致、原文欠落はビルド失敗。配布物検査では実ファイルhashと照合し、両WASMのhashが出典に一致することも確認する。

これはnpmパッケージに対する出典照合であり、WASM内にリンクされた全ライブラリのSBOMや対応ソースを得た証拠ではない。生成物はGit管理外のローカルビルド出力である。

## 依存別の判断と残条件

|対象|今回確認した事実|配布前に満たす条件|
|---|---|---|
|`elkjs@0.9.3` / EPL-2.0|検証Workerのモジュール一覧に`lib/elk.bundled.js`が存在し、生成JSにも`org.eclipse.elk`を確認。独自SVG配置だから依存が消えたとは扱わない|対応する編集用ソース、生成元ELK/GWT等の版・取得先・ビルド手順を固定し、提供方法の告知を配布物から辿れるようにする。npm tarballや生成済みJSのURLだけで充足とは判定しない|
|`dompurify@3.4.17` / MPL-2.0 OR Apache-2.0|package宣言と原文を収集|二者択一のApache-2.0を用いる方針。既存の著作権表示・原文を保持し、適用するNOTICE等を確認。原文からMPL部分を削除しない|
|`khroma@2.1.0`|licenseメタデータなし。同版インストール済み原文`license`がMITであることを追加確認し、hashを記録|宣言欄のnullと原文確認結果MITを別項目で保持。元の著作権表示・MIT原文を同梱。宣言欄を推測値で上書きしない|
|その他MIT/ISC/BSD/Apache等|実モジュールに対応する原文を収集|実際に配る版の著作権・原文・NOTICEを保持。license宣言だけの一覧で原文を代用しない|
|`@firecrawl/anydoc-wasm@0.1.7`|JSとWASMの出典/hash、MIT原文を記録|WASMに内包するRust等の依存と原文の網羅性を、対応ビルド情報と突合する。npm表層のMIT宣言だけで結論を出さない|
|`@embedpdf/pdfium@2.14.4`|JS/WASMの出典/hash、`LICENSE`と`LICENSE.pdfium`を同梱|組み込まれたPDFiumと第三者ライブラリの版・条件・原文の網羅性を確認。`LICENSE.pdfium`の存在だけで全内包物の確認完了とはしない|

EPL-2.0の3.1ではソースの提供と取得方法の通知が規定され、Source Codeは修正に適した形式と定義される。上記のEPL対応案はこの原文に基づく。原文収集だけで残条件を消さない。[Eclipse公式EPL-2.0原文](https://www.eclipse.org/org/documents/epl-2.0/EPL-2.0.txt)

DOMPurifyのApache選択はパッケージのOR宣言に基づく配布設計である。MPLを選択して実行形式を配布する場合はソース取得方法を知らせる等の条件があるため、選択と原文の保持を明示する。[Mozilla公式MPL 2.0原文](https://www.mozilla.org/en-US/MPL/2.0/)、[公式FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)

## 製品配布時の完了条件

実配布ビルドに対して同じ出典/hash一覧を生成し、原文・NOTICE・対応ソース・変更差分・告知文を一つの世代へ対応付ける。原文一覧への到達性と、告知したソースがその版に対応することをネットワーク経由でも確認する。新バージョンへ更新したら旧版の条件確認を流用しない。ライセンス文書やソースを実行資産の先行Cacheへ自動で追加しない。

対応ソースとWASM内包物の確認、配布画面からの到達性は未完了。今回の成果は配布条件を確認できる証跡と具体的な残条件であり、製品配布の最終承認ではない。

## EPL対応ソース調査で判明した版の差

上流の[elkjs 0.9.3リリース](https://github.com/kieler/elkjs/releases/tag/0.9.3)は、ELK 0.9.1を基に、ELK側で当時未リリースの変更（#955）を含むと説明している。したがって「ELK 0.9.3」という同名版のソースを探して代用する方針は採らない。

同タグの[build.gradle](https://raw.githubusercontent.com/kieler/elkjs/0.9.3/build.gradle)では隣接するELK checkoutからJava等のソースを取り込み、GWTで生成する。Java 8～17、GWT 2.10.0、EMF-GWT 2.12.4等の指定があり、JCenterとsnapshot取得先にも依存する。elkjs側のタグだけを取得しても、ELK checkout・未リリース変更・ビルド依存を固定したことにはならない。次の具体作業は、それらの対応commitと取得可能性の固定、配布バンドルとの対応確認、告知文と到達性の検証である。今回は上流ビルドの再現・対応ソース提供完了までを主張しない。

## 固定版への追加追跡結果

調査日時とhashは[JSON記録](evidence/json-distribution-source-records.json)を正とする。`npm run research:distribution`で再取得できる。公開コードの実行・インストール・上流ビルドの実行はしない。npm metadataの版/取得元/SRIをローカルlockへ照合し、取得tarballのSHA-512も検査した。これは公開アーカイブの整合検査で、公開者の署名検証ではない。

|対象|今回確定した事実|未解消の条件|
|---|---|---|
|elkjs 0.9.3|npm gitHeadは`a8304cf79fde75bc2ab1a89d28320f53f8637436`。同commitの`lib/elk.bundled.js`は手元の同版JSとSHA-256一致（`b0745abd7f23cd91690a1587e377edbe19fd7233c783300290936720546216d4`）|同commitのCIはELKを`ref: master`で取得。生成元ELKの正確なcommit・変更差分・依存の対応は未確定。生成済みJSの一致と編集用ソース提供を区別|
|anydoc-wasm 0.1.7|npm gitHeadと公開attestationの記載は`4a45addbd607e8b59f0c263bca26aab228e10370`。subjectのSHA-512はlockのSRIと一致。対応Cargo.toml/wasm manifest/Cargo.lock/release workflowを取得|attestationの暗号学的な検証は未実施。WASM対象のfeature/依存closure、crate原文と必要なNOTICE、配布告知が未完了|
|PDFium 2.14.4|npm gitHeadなし。リリース`v2.14.4`のcommitは`07ed5fe3739ec22522450863282b1b0618b88a6f`。そのvendor WASMと`LICENSE.pdfium`は同版インストール済みファイルと一致。WASM hashは`c0af5a6aca30d7e54a149c3a68e317116ca906d6edc28fd3318b12c7d9478ac8`|ソースsubmoduleは`embedpdf/pdfium`の`cb29e78f2ba00c9298714d5f4a8bf7765f1e802f`。そのソース/patch/DEPSから配布WASMを生成した完全な証跡と、内包第三者原文の網羅性は未確認|

一次資料: [elkjs固定CI](https://raw.githubusercontent.com/kieler/elkjs/a8304cf79fde75bc2ab1a89d28320f53f8637436/.github/workflows/ci.yml)、[anydoc固定release workflow](https://raw.githubusercontent.com/firecrawl/anydoc/4a45addbd607e8b59f0c263bca26aab228e10370/.github/workflows/release.yml)、[npm公開attestation](https://registry.npmjs.org/-/npm/v1/attestations/@firecrawl%2fanydoc-wasm@0.1.7)、[PDFiumリリース](https://github.com/embedpdf/embed-pdf-viewer/releases/tag/v2.14.4)、[固定submodule情報](https://api.github.com/repos/embedpdf/embed-pdf-viewer/contents/packages/pdfium/pdfium-src?ref=07ed5fe3739ec22522450863282b1b0618b88a6f)。

PDFiumの固定build.shにはV8/XFA/Skia無効のGN引数があり、Dockerfileはemsdk 3.1.70を指定する。ただしdepot_tools取得とgclient同期も行うため、ソースcommit一つの指定でツールチェーン全体の固定を証明しない。[固定build.sh](https://raw.githubusercontent.com/embedpdf/embed-pdf-viewer/07ed5fe3739ec22522450863282b1b0618b88a6f/packages/pdfium/scripts/build.sh)、[Dockerfile](https://raw.githubusercontent.com/embedpdf/embed-pdf-viewer/07ed5fe3739ec22522450863282b1b0618b88a6f/packages/pdfium/Dockerfile)

## anydocのCargo.lock候補調査

固定Cargo.lockはworkspace全体で192 package、うちregistry由来188候補。188件すべてで同版の公開crate metadataのchecksumをlockへ照合した。宣言ライセンス不明は0件。ただし原文は未収集であり、Node/Python/開発依存を含むworkspace lock全体をWASM内包一覧とは扱わない。現環境にcargoがなく、WASM対象のclosureは未生成。判定欄は`wasmIncluded: not-determined`を保持する。

宣言にはMIT/Apacheの選択、Unicode-3.0とのAND、LLVM-exception、Zlib、旧形式のスラッシュ表記等がある。LGPLを含むOR宣言もあり、これを「LGPLのみ必須」や「MITのみで一律充足」と読み替えない。全候補の宣言原文をJSONへ保持した。原文・実target・選択する条件の照合を終えるまで最終配布承認は保留する。

次に必要なのは、ELK生成元版の証跡、WASM targetの依存/feature graph、各原文・必要なNOTICEの収集と対応ソース提供方法の確定である。これらは実機試験では解消しない調査残件で、Windows確認が成功しても別途保持する。
