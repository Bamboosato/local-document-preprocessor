# 配布候補の固定証跡・告知案・未解決ゲート

2026-11-02、PR #24マージ後のmain `13c7a9c17a5e255b6833db1f887861b0f66b38b9` を入力としたローカル検証記録。これは配布承認や公開を意味しない。アーカイブ公開・添付、マージ、デプロイは行わない。実機はユーザー別途、macOS/iOSは対象外。

## 観点と合格の意味

最優先は、版の異なる原文や不完全なソースを対応済みとして告知すること、文書・結果の混入、世代不一致を防ぐこと。ケースより先に、機能（版と取得先）、非機能（MIME/hash/可用性）、データ（原文/NOTICE・秘密・版）、UI（案内と結果保持）を、正常・取得失敗/改変・空/複数原文・新旧版切替で区別する。ローカルの合格はローカル生成物の整合のみを示す。

## 今回の固定データ

|対象|実測・状態|意味と限界|
|---|---|---|
|生成基点|`13c7a9c17a5e255b6833db1f887861b0f66b38b9`、ローカルproduction build|新PRの文書変更を含む将来commitや実配信物の同一性は別途照合する|
|公開manifest|SHA-256 `255ad9a0570b21f1dd8d183c3a34a73bfcb843bec23019086dc74efd26ff7b85`、世代ID `c86c92d953f97dd762782d79`|公開manifest 442資産。SW埋込み側は公開manifest自身を加え443資産、約24.5MB。SW自身は別扱い|
|anydoc WASM 0.1.7|SHA-256 `409e45e75062df06bed445c352ffddaf3bae15ff376f5d514d45f4891debd09e`|既存の公開npm bytesと一致。target候補は実リンク一覧ではない|
|PDFium WASM 2.14.4|SHA-256 `c0af5a6aca30d7e54a149c3a68e317116ca906d6edc28fd3318b12c7d9478ac8`|既存の公開npm bytesと一致。リンクgraphは未証明|
|ELK chunk|`elk-QONTBCTQ-D4A5a_2-.js`: `f78b38873074b103d3f902fd042a011e01c7dd0f43d5ca9d2af753bb1f34dcff`。`elk-QONTBCTQ-DUyLT7Mo.js`: `45670abe036092c8527b0ecd86b6b4b12490edc117112382a331c88afbb3fb5e`|生成物2件のhash。上流ELK実checkoutや生成チェーン全体の証明ではない|
|原文・NOTICE|本番npm依存233件の236原文、es-toolkit NOTICE、DOMPurify両原文|`/licenses/` のinventoryと一覧はnpm候補であり、WASM全内包物一覧ではない|

## 告知文案（未公開・審査用）

以下は必要な事実を確認するための案であり、法的に十分な告知や利用者向け実装として確定していない。空欄や候補を実URLとして公開しない。

> このアプリには第三者ソフトウェアが含まれます。npm依存から収集したライセンス原文とNOTICEは、画面の「第三者ライセンス」から確認できます。対象版、原文、NOTICEおよび対応ソースの提供範囲は、この版の索引で案内します。

|案内欄|現在の状態|公開前の確定事項|
|---|---|---|
|製品版・生成物|上記基点/manifestのローカル値|実配布するcommitと生成物を再固定し、索引に版とhashを記載|
|npm原文・NOTICE|現行一覧から閲覧可能な候補原文あり|実配信先で本文とhash、表示位置・適用範囲を確認|
|ELK / EPL-2.0|elkjs 0.9.3の原文あり|[EPL原文](https://www.eclipse.org/legal/epl/epl-v20.html)の適用条件・例外を対象配布物に照らし、対応ソースと取得方法を確定。上流releaseを完全な対応ソースと自動的にみなさない|
|DOMPurify|MPL-2.0 OR Apache-2.0、両原文あり|選択・告知を判断し記録|
|anydoc / PDFium|npm原文と調査用候補あり|実内包物と必要な追加告知/原文・対応ソースの範囲を判断|
|source提供先|別HTTPS originと版別索引は[設計候補](distribution-delivery-plan.md)|実ホスト、公開範囲、維持期間、失効/復旧方法を決定・承認|

## 公開前のゲートと次の作業

1. **版・原文照合:** 公開するcommitとlock、manifest、SW自身、236原文/NOTICEのhashを固定し、版変更時は再検証する。今回のローカル結果を他環境の証拠に流用しない。
2. **ソース・告知判断:** ELK checkout、anydoc/PDFiumの実リンクgraph、PDFium候補ZIPの除外1件を未証明として、適用される原文/NOTICE・ソース・取得方法を責任者が判断する。未証明の許容判断は義務の免除を意味しない。権利者への連絡や配布承認は今回行っていない。
3. **公開先の決定と承認:** 版別索引の候補配置・維持担当・取得不能時の取扱いを具体的なホストで決める。実環境検証が公開を要する場合は、対象、公開先と範囲を提示し別途承認を得る。ローカルZIPをそのまま公開しない。
4. **実配信検証:** [配布先手順](distribution-delivery-plan.md)に従い、HTTP 200だけでなく復号後の本文hash、期待MIME、redirect、誤ったHTMLフォールバック、旧タブ/更新/オフラインを確認する。実配信先への要求・検証は未実施。
5. **ユーザー実機:** Windowsのインストール済みPWA・実容量・復帰・読み上げ/倍率/タッチを[実機手順](pwa-generation-validation.md)で別途確認する。macOS/iOSは対象外。

## 今回の検証とスコープ

`npm run build` と `npm run check:dist` が成功し、実測manifest・WASM・ELK hashを上表に記録した。既存のローカルZIP 4件のhashを再確認し、Git管理外であることを確認した。原文・公開tarball対応の既存証跡は[照合報告](distribution-license-review.md)、アーカイブの範囲と除外は[ローカル検証](distribution-local-archive-validation.md)に保持する。上流ビルド実行・アーカイブ公開/添付・実配信要求・実機操作はしていない。文書/設定変更のみのためローカルE2Eは未実施。配布条件の最終判断は未完。
