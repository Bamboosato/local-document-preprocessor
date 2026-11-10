# WASMの内包痕跡と正式表示に向けた確認

2026-11-10。PR #43はhead `9c5ced7`、CI run `42772799647`の両ジョブ成功、未解決レビューなしを確認してmain `16e2d1dd284ac71199d4f9392ee1727fc8e0b2d6`へマージした。新しい調査は別レビュー用ブランチで行う。

## 検証前の観点

防ぐべき問題は、lock/候補資料だけで実内包を断定すること、バイナリーに残る権利表示を見落とすこと、文字列がないだけで除外すること、生成物と異なる版を正式表示すること。

|観点|正常系|異常系|境界値|状態遷移|
|---|---|---|---|---|
|機能|公開bytesのセクションと出典を対応|不正header/長さ/LEB128を拒否|data内の痕跡とcustom/codeの文字列を区別|候補→痕跡確認→実対象/表示判断|
|非機能|外部WASMを実行せず有界解析|切れたdataを成功扱いしない|0件は不存在証明にしない|同一入力の反復で同一記録|
|データ|hash/offset/版を固定|別版・改変bytesを混ぜない|埋込pathはビルド由来の手がかりで完全SBOMでない|旧証跡を保持して追補|
|UI|正式表示の判断条件を記録|候補表示を正式表示と扱わない|機能を変えない調査のE2Eは未実施|履行未完から公開承認へ自動移行しない|

ローカルでは静的調査・解析器の正常/異常/境界試験と文書検査を対象とする。確認したデータの原文を製品へ追加するため、PWAの対象1件を逐次実行し、オフラインのhash照合を確認する。全件/他ブラウザー/実配信・実機はローカルでは未実施とする。macOS/iOSは対象外。アーカイブの公開・添付、デプロイ、新PRのマージは行わない。


## 結果と根拠

[WASMデータ照合台帳](evidence/wasm-data-inclusion-review.json)、[借用コード系列](evidence/borrowed-code-family-review.json)、[提供する原文](evidence/wasm-data-notice-materials.json)を固定した。WASMは既存の[公開npm照合記録](evidence/json-published-wasm-correspondence.json)と同じSHA-256/サイズで、外部コードの実行・WASMのinstantiateはしていない。

### 実内包の証拠を分ける

|対象|今回確認した範囲|判断の限界|
|---|---|---|
|anydoc 0.1.7|data 445セグメントからcrate名/版34組を検出。既存96候補と全件一致、候補外0|panic等のpathを含むビルド由来の痕跡。各crate全体のリンク・到達性や完全SBOMを保証しない。未観測62候補を除外しない|
|pdf-inspector 0.1.7のCMap|checksum固定crateの168個中167個、計1,124,716 bytesがWASM dataの連続bytesと一致。残1個もactive-dataを順にゼロベースで配置した静的像で一致|分割1個はAdobe-Japan1-UCS2.bcmap、40,951 bytes。連続file bytesの不一致をソース版違いと扱わない。静的配置像は実行後メモリの検証ではない|
|CMapのAdobe許諾文|同crateのexternal/bcmaps/LICENSE 2,080 bytesがWASM dataにも全文一致|MITのcrateラベルだけではCMap固有条件を表せない。原文保持の確認は全依存の適合判断ではない|
|PDFiumのフォント|固定source cb29e78f…の16個のC++ byte配列、計445,077 bytesがdata内に全文一致|そのデータの同一性を確認。PDFium全体のcheckout/パッチ/DEPSの同一性までは示さない|
|PDFiumのライブラリー診断|dataにlibpng/OpenJPEG/zlibの診断文字列|実装由来の補助証拠。具体版・実利用範囲・FreeType/IJG/ICU等の有無を単語の有無だけで決めない|

anydocのcustom producersはwalrus 0.26.4とwasm-bindgen 0.2.126 (21ac804a9)を記載し、Rustコンパイラー版は記載しない。PDFiumにはcustom sectionがなかった。ビルドログ不足を埋込情報で埋めたとは扱わない。

出典は[固定PDFiumフォント](https://raw.githubusercontent.com/embedpdf/runtime/cb29e78f2ba00c9298714d5f4a8bf7765f1e802f/core/fxge/fontdata/chromefontdata/FoxitSans.cpp)、[checksum照合したpdf-inspector crate](https://static.crates.io/crates/pdf-inspector/pdf-inspector-0.1.7.crate)。各入力URL・サイズ・hash・WASM file offsetを台帳へ記録した。runtimeへのリポジトリー名変更は固定commitの変更と混同しない。

最初の連続bytes比較ではCMap 1個が不一致だった。境界を調べると途中でdataセグメントが切れ、ゼロ部分が省略されていた。原因は実装不具合ではなく調査手法の観点不足（格納形式の境界）であり、active-dataの静的配置を追加して一致を確認した。再発防止としてゼロの隙間・重複書込順・データ領域外の同じ文字列を扱う回帰試験を加えた。

### 正式表示・配布条件に向けた対応

- CMap: Adobeの権利表示・許諾条件・免責全文を独立資料として第三者ライセンスからオフライン提供する。binary資料での再掲、source再配布時の保持、無断の推奨表示禁止を省略しない。WASM内に埋め込まれていることだけで利用者向け提供を完了とせず、独立した導線とhashを検査する。
- PDFiumフォント: 全16ソースで共通の「2014 The PDFium Authors」「Original code copyright 2014 Foxit Software Inc.」とBSD系原文への案内をそのまま提供する。既存PDFiumの複合原文へのリンクも保持する。2個のMMフォントにある1990–1994 Adobe表示はWASMにも保持されているが、フォントの追加許諾・出典全体をこのヘッダーだけで確定しない。
- FreeTypeのFTL、IJG/libjpeg-turbo、ICUの正式な適用範囲・貢献表示は未決を継続する。前報の条件付き表示案をそのまま正式版へ変更しない。
- 新資料は[原文台帳](evidence/wasm-data-notice-materials.json)の2点のみ。既存の9原文/条件付き案と過去の候補195原文を保持する。全候補原文の数を義務充足の根拠にしない。

### 実借用版を絞る

base64は[lookupを導入した2015年のcommit](https://github.com/niklasvh/base64-arraybuffer/commit/1616895ea14ed71f6e629501215512aa97f3b9c3)を確認した。固定ファイルはv0.2.0と全bytes一致（SHA-256 f1749f1d…）。導入時刻以前の当該pathの履歴3件ではこのcommitが最新で、旧0.1.2はindexOf方式だった。pdf-libのlookup/charCodeAt方式は2015年以降のコード系列と対応する。独自改変や別forkの可能性を消しておらず、実際に取得したtag/checkoutまでは一意に証明しない。既存2012 Niklas/MIT原文を保持する。

PDF.jsはv2.0.943を参照すると、7 closure中6個が従来の字句正規化で一致し、FlateStreamも `this.dict = str.dict;` をpdf-lib側がコメントアウトした1行の明示的な差を戻すと一致した。Streamは元から一致していた。[前報](pdfium-license-followup.md)のクラス名の誤記を訂正した。前報のJSONはFlateStreamだけ不一致と正しく記録しており、その証跡は変更していない。これは選択した7処理と明示差分の対応であって、全ファイル・意味的同等性・一意な借用commitの証明ではない。既存Apache原文・権利表示・変更表示と2版のAUTHORS参考候補を保持する。

## 再確認手順と検証

前提はmain 16e2d1d…を基点とする本ブランチ、lockどおりのnpm依存、既存公開bytesと同じWASM。入力は公開ソースだけで、利用者文書を使わない。

1. `python -m unittest scripts/test_inspect_wasm_materials.py` — セクション境界、長さ/LEB128の異常、フォント配列、分割/ゼロ/書込順の8ケース。
2. `python -m scripts.verify_wasm_data_evidence` — ネットワーク/実行なしで2 WASMのhash・data内34組・原文・168 CMap・16フォントの記録を再照合。CIにも追加。
3. 固定URLの原文を一時ディレクトリーへ取得した場合は `python -m scripts.verify_wasm_data_evidence --source-directory tmp/wasm-source44`。台帳pathの `/` を `__` にしたファイル名で配置し、C++を実行せずliteral byte配列を読んで出典との対応も再確認する。crateは指定checksumを先に確認し、展開・実行しない。
4. `npm run test:licenses`、build/配布物検査、PWA対象1件を逐次実行。原文欠落/改変、WASM変更を拒否し、復元で成功することを確認する。

検証結果は[実施記録](evidence/wasm-inclusion-validation.json)に記載。実配信・実機、macOS/iOS、追加PRのマージ・アーカイブ公開/添付・デプロイは実施しない。

## 残件と次の判断

|残件|次の成果物・完了条件|
|---|---|
|実借用checkout|base64/PDF.jsのborrowイベントを示す作者記録等、または確認できたコード系列と差分によって必要な原文・権利/NOTICE範囲を判断した記録。版名を創作しない|
|フォントの許諾連鎖|Foxit由来16データとMM内Adobe表示について、追加条件の要否・原文範囲を原典で説明し、正式表示を確定|
|WASMコードの実対象|34組の痕跡以外の実装/生成物を個別対応し、必要な条件・変更/NOTICEを確定。完全再ビルドを一律の完了条件にはしない|
|FreeType/IJG/ICU等|固定ソースの設定・依存箇所と実binaryの証拠を合わせ、正式貢献表示・複合条件の適用範囲を決定。文字列不在だけで除外しない|
|公開受入|版/提供物/提供先を再固定し、許可後の実配信照合・ユーザーのWindows実機確認・責任者の公開判定。今回は公開承認に進めない|


実施結果: Pythonの新規8ケース・旧ガードを含む23ケース、Node原文4ケース、固定入力との再照合、build/配布物検査に成功。初回の旧Pythonガードはsandboxのsystem temporary directoryへの書込/cleanup拒否で15エラーとなったが、環境問題としてTEMP/TMPを作業領域内へ明示し、コードを変えず23ケース成功を確認した。PWA対象1件はWindows Chrome headless 156.0.8078.81、逐次、skip/再試行0で成功。通常の本番/全npmとTiny67対象の監査は全重大度0、HTTP242資産の不一致0。実行資産7件のhashは従前と不変。新PWA世代は6f5fe39c47c93a9cf5497505。全件/他ブラウザー/実配信/実機はローカルでは未実施であり、CI結果はPRの固定headに紐付けて追記する。
