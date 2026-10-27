# ELK生成元・WASM依存と原文の追跡計画

2026-10-27。PR #17の後続調査。本体統合・実機確認・macOS/iOS・マージ・デプロイは対象外。

## ケースより先の観点

最優先は、誤った生成元の断定、対象外依存の混入、改変アーカイブの採用、原文欠落を収集成功とする誤判定、アーカイブのパストラバーサルを防ぐこと。

|観点|正常系|異常系|境界値|状態遷移|
|---|---|---|---|---|
|機能|固定commit/lock/targetから依存を絞る|版不明・原文なしは未完了|normal/build/devとworkspace/targetの違い|候補→対象解決→原文確認→残条件|
|非機能|隔離した既存DockerでCargo tree/metadataのみ実行|取得失敗、過大応答、checksum不一致|ダウンロード/展開/件数/時間の上限|再取得・再実行でも元lock不変|
|データ|原文bytes/hash、crate checksumを保持|重複entry、絶対/親パス、リンクを展開しない|長い名前/PAX/GNU longname、空アーカイブ|原文収集済みと宣言のみを分離|
|UI/報告|成果と不明点を区別し追跡可能|実機・配布承認の成功へ一般化しない|全候補数と対象graph数を別表示|旧報告→新証拠への参照、履歴保持|

## 検証意図と範囲

追加の公開WASM追跡では、機能は署名/provenance/取得bytesの対応、非機能は隔離・時間/展開上限、データは固定SRI/commitと原文の区別、UI/報告は未証明事項の表示を先に観点化する。正常系は署名とWASM hash一致、異常系は署名失敗・digestずれ・ログ欠落、境界値はtarball/内包WASM/source graphの証明範囲、状態遷移は未検証claim→公式検証済みclaim→未完の再現ビルドとする。最優先は署名成功を依存全量やELK checkoutの証明へ誤拡張する重大な誤判定を防ぐこと。

- SL-10～11: 公開tarballと導入済みWASM、npm検証済みattestationのsubject/sourceを固定lockへ照合する。履歴0件や410をbuild未実施と断定せず、ELK一意checkout未証明を保持する。オフライン検査は保存データの整合を検査し、暗号署名の再検証は公式npmコマンドで別実施する。

- SL-01～04: 合成tarで正常・長いパス・パストラバーサル・checksum/欠落/切詰めを検査する。上流アーカイブの内容を実行せず、必要な原文だけを取り出す。
- SL-05: target解決結果が固定lock候補に包含され、dev依存や不明な版を暗黙採用しないことを検査する。
- SL-06～09: 解決済みtargetのscope/原文hash、ELKの事実と候補の区分、PDFiumのDEPS候補とバイナリ実内包の区分を、収集済みの固定記録と原文でオフライン照合する。異なる版や原文改変は失敗とする。
- SR-01: ELK公開JSの生成情報、release/commit/差分を一次資料で追跡し、直接証拠と推定候補を区別する。
- SR-02: 公式Rustコンテナーをdigestで記録し、固定anydocソースで`cargo tree --locked -p anydoc-wasm --target wasm32-unknown-unknown -e normal,build`とmetadataを取得。コンパイルやbuild.rsは実行せず、target graphは配布WASMのバイナリSBOMと区別する。
- SR-03: crateアーカイブをlock checksumで検証して原文/NOTICE等を収集。PDFiumは固定submodule/DEPS/ビルド引数と第三者原文を調査する。宣言・実target・実バイナリの各限界を保持する。

ローカルE2Eは未実施とする。製品ランタイムを変更しないため、調査ユニット・出典整合・文書検査を選択する。実ブラウザー・ユーザー実機は動かさない。通常CIではネットワーク調査を実行しない。同じ実機でテストscriptを並列実行しない。
