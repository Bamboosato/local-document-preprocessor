# 実借用元とMMフォントの許諾条件の追補

2026-11-10。PR #44は固定head `86ce61c`のCI run `42777893050`両ジョブ成功、未解決レビューなしを確認してmain `26470b9f6471df4edadd6e1e3dc47da83bd53e3d`へマージした。追加作業は別ブランチでレビュー用PRまで。

## 検証前の観点

優先して防ぐのは、BSDのファイルヘッダーだけで内包プログラムの別条件を消すこと、同じコードが複数版にあるのに実借用版を一意に断定すること、参考原典を製品の履行済み表示へ変更すること。

|観点|正常系|異常系|境界値|状態遷移|
|---|---|---|---|---|
|機能|PFB各segmentとAdobe表示・処理を静的に対応|切れた長さ・不明segmentを拒否|暗号化部分をPostScriptとして読まない|ファイル許諾→内包処理の条件→適用判定|
|非機能|外部コードを実行せず固定bytesを確認|取得失敗を不存在や許諾不要にしない|PDF抽出の改行やページ境界をコード改変と断定しない|固定原典→ページの目視→条件表|
|データ|source/WASM/hash/年代と範囲を記録|別版・別フォント・別許諾を混ぜない|字句一致はborrowイベント・全意味の証明ではない|過去証跡を保持して追補|
|UI|現行の原文導線を維持|参考資料を正式承認として表示しない|製品資産を変えない調査はE2E未実施|未確定条件の解決前に公開しない|

ローカルは新しい静的解析の正常/異常/境界/状態遷移と既存WASM/原文ゲート、文書検査を対象とする。MM内Adobeの76 bytesの表示を追加するため、PWA対象1件を逐次実行し、原文への到達とオフラインhashを検査する。全件/他ブラウザーはローカル未実施。実配信・実機は未実施、macOS/iOSは対象外。アーカイブ公開/添付・デプロイ・新PRマージは行わない。


## 結果と判断

[MMフォントの許諾・観測台帳](evidence/font-permission-chain-review.json)、[PDF.js内容版の照合](evidence/pdfjs-file-revision-review.json)、[検証記録](evidence/font-chain-validation.json)を追加した。原典・内容版の対応と、未記録のborrowイベント・条件充足を区別する。

### 実借用版と提供原文

PDF.jsの `src/core/stream.js` について、2019-05-22のpdf-libコピー時点以前の変更履歴を照会し、返された79件（上限100件未満）を固定commitのテキストとして取得した。対象7 closureを、既報のコメント/空白/引用符表記とFlateStreamの明示1行の差だけで比較した。

|照合|結果|
|---|---|
|7処理が一致するファイル変更snapshot|32bfa55d…（2018-07-26）と6adeabbb…（2018-09-12）の2件|
|7処理とGlyph & Cog表示が対応|6adeabbb66b8acf63dbd4e52f56a8cedfcfe21a4。後者は当該表示を追加した変更|
|固定内容版と既存参考版|6adeabbb…のstream.js全文はv2.0.943の同ファイルとraw bytes一致|
|LICENSE/AUTHORS|6adeabbb…の原文10,174 bytes/AUTHORS 981 bytesは既存のPDFJS-LICENSE/PDFJS-AUTHORS-v2.0.943と全文一致|
|NOTICE|6adeabbb…のtruncatedでない完全treeにNOTICE/NOTICE.txtという名前のファイルなし。非典型名や全ソースヘッダーの網羅性は主張しない|
|実際の取得tag/checkout|未記録。同一ファイル内容は複数のrepository commit/tagに存在し得るため、一意なborrowイベントの証明ではない|

これにより、選択したコードと権利表示を参照する**ファイル内容版**は6adeabbb…まで固定できる。版名だけを推測する追加探索より、既存のApache原文・Mozilla/Glyph & Cog表示・TS移植/変更説明が必要範囲を保持しているかという判定へ進める。既存提供物を別版の原文に差し替えてはいない。完全な原著作者間の許諾履歴や全改変範囲を独立監査したという結論ではない。

base64のlookup内容系列1616895…についても、固定tree内のLICENSE-MIT 1,062 bytesは既存BASE64-MITと全bytes一致。treeは11項目、truncatedなし、NOTICE名のファイルなし。実tag/checkoutの未記録は履歴として残し、一意性の不足だけで参照原文対応まで未確認へ戻さない。

根拠は[PDF.jsの表示追加commit](https://github.com/mozilla/pdf.js/commit/6adeabbb66b8acf63dbd4e52f56a8cedfcfe21a4)、[固定LICENSE](https://raw.githubusercontent.com/mozilla/pdf.js/6adeabbb66b8acf63dbd4e52f56a8cedfcfe21a4/LICENSE)、[固定AUTHORS](https://raw.githubusercontent.com/mozilla/pdf.js/6adeabbb66b8acf63dbd4e52f56a8cedfcfe21a4/AUTHORS)、[base64固定MIT](https://raw.githubusercontent.com/niklasvh/base64-arraybuffer/1616895ea14ed71f6e629501215512aa97f3b9c3/LICENSE-MIT)。取得入力のhashと79件の比較結果を台帳に保持する。

### MMフォントとAdobeの追加条件

PDFiumの公開WASMに全文一致した16データのうち、FoxitSansMM/FoxitSerifMMはPFB形式で、cleartextのヘッダーはType 1を示す。他14データと同じ形式・同じ内包処理と決めつけない。PFBの長さ・種別・終端を静的に読み、暗号化segmentの中身は解釈/復号/実行しない。

2フォントのcleartextには、1990–1994 Adobe Systems Incorporatedの著作権表示とmakeblendedfont/NormalizeDesignVector/ConvertDesignVector等の処理がある。FontInfoのNoticeフィールドは空白であり、それ自体を追加許諾の証拠にしない。

Adobe公式の[Type 1 Font Format Supplement・固定PDF](https://raw.githubusercontent.com/adobe-type-tools/font-tech-notes/eadd3b3ec80d0f3404d40b95cd5315453aa88c73/pdfs/5015.Type1_Supp.pdf#page=35)（1994-05-15、PDF/印刷35ページ）を取得し、抽出だけでなくページ画像でAppendix Aの許諾を確認した。これは一般的なAdobe Fonts契約やCMapのBSD系原文とは異なる対象である。

|原典で示される条件の要約|今回の確認・残件|
|---|---|
|Type 1フォントプログラム内で使う|2データのPFB cleartextヘッダーはType 1。これだけで他条件まで満たしたとはしない|
|文書にあるコードをそのまま使う|全処理の一致は未確定。PDFの行折返し/コメント、フォント固有の設計値、実際の変更を区別して確認する|
|著作権表示を保持する|2フォント内に共通のAdobe表示76 bytesを確認し、そのまま独立資料として追加。原典との厳密な保持条件の判定は未完|
|文字輪郭がAdobeのフォントからのコピー/派生でない|未確認。Foxit/PDFiumのソースヘッダーだけで輪郭の由来を独立証明しない|

PDFium/FoxitのBSD系ソース表示と、MM内Adobe処理の条件は分けて扱う。公式リポジトリーの文書向けCC-BY-ND-4.0表示も、内包処理にBSDを適用できる根拠へ転用しない。今回の観測だけで違反または適合を断定せず、条件に対応する根拠が揃うまでMM部分の公開判定を保留する。

新規提供物は76 bytesのPDFIUM-MM-ADOBE-COPYRIGHTのみで、プログラムやフォントbinary・原典PDFをGitへ追加しない。第三者ライセンスの既存WASMデータ欄に「許諾条件確認中」としてリンクし、欠落/改変拒否、PWAへの収録とオフラインhashを検証する。表示の追加は、コード変更や輪郭由来の条件を代わりに満たすものではない。

## 検証と再現

- `python -m unittest scripts/test_font_license_chain.py`: PFBの正常/暗号化部分の区別、不正長/種別/終端、欠落/改変表示、複数一致を一意化しない履歴比較の4ケース。
- `python -m scripts.verify_font_chain_evidence`: 固定PDFium WASMの2フォント/PFB観測/76 bytes表示を、前報の実データ証跡とネットワークなしで再照合。許諾充足を自動判定するコマンドではない。CIへ追加した。
- 履歴再現: 台帳URLで79入力を `COMMIT.txt` として一時フォルダーへ取得し、先行コピーcommitの7ファイルを `pdflib-CLASS.txt` として配置。`python -m scripts.review_pdfjs_history HISTORY_DIRECTORY INVENTORY_JSON LOCAL_DIRECTORY NEW_OUTPUT_JSON`。inventoryはqueryとinputs（commit/url/date/bytes/sha256）の配列で、台帳resultsから比較前の入力欄を使える。hash不一致/重複/不正path/不完全なclosureを拒否する。
- 原文テストは初回、資料追加で配列位置が変わり、WASM改変ケースが原文を改変して失敗した。原因はテストデータの位置依存で、対象を明示pathへ変更。期待エラーとの照合で検出でき、例外の期待を緩めずに修正した。

## 次の判断に必要な証拠

|対象|必要な回答/証拠|完了条件|
|---|---|---|
|MM処理の許諾|台帳の2フォントhashに対する処理の原典/版・変更点、追加許諾または適用根拠|文書条件に対する履行か別の有効な根拠を記録。単にBSDという総称で完了にしない|
|MMの文字輪郭|当該データの作成/取得元とAdobe輪郭に由来しないことの根拠|該当条件の判定を責任者ができる記録。必要な権利者/専門家確認はこの論点へ限定|
|PDF.js/base64|内容版に対応する権利/原文/NOTICE/改変説明の最終範囲|ファイル内容版の対応は確認済みとして用い、実tagが未記録であることと履行不足を分ける|
|その他WASM|FreeType/IJG/ICU等の正式な実適用・複合条件と、通常crate/生成物の個別条件|前報の候補/痕跡と実対象を対応し、正式表示・必要な提供を確定。今回のフォント条件から全依存の適否を一般化しない|

提供元へ質問する場合は、2フォントとWASMのhash、原典35ページ、コード保持/輪郭由来の2論点を添える。今回は質問・メール・issue投稿を送信していない。自動的なフォント除去/差替や依存更新も行わない。公開可否は配布準備方針に沿って引き続き保留する。


実施結果: 新規Python4ケース、旧ガード込み27ケースと原文4ケース、2フォントの静的再照合、型/build/配布物検査に成功。PWA対象1件はWindows Chrome headless、逐次、失敗/skip/再試行0。新PWA世代db9addd002390ea6e80d4bae、HTTP243資産の不一致0、実行資産7件は従来hashと不変。通常本番/全npmおよびTiny67対象の監査は全重大度0。ローカル全件/他ブラウザー/実配信/実機は未実施。CI結果は新PRの固定headとrunに紐付けて記録する。
