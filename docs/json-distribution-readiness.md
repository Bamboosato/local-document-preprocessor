# JSON採用方式の配布条件確認表

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
|`khroma@2.1.0`|licenseメタデータなし、原文`license`あり|宣言欄はnullを保持。原文と対象版の対応を人がレビューし、推測したSPDXで上書きしない|
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
