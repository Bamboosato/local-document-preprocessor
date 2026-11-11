# MMフォント処理と文字輪郭の由来の追補

> 2026-11-11方針変更: E-01は未解決の別件として管理し、公開判断・検証用配信開始の条件から除外する。以下の調査・未証明・hashは保持し、E-01を理由とする公開保留は当時の方針として読む。現行の管理は[完了台帳](distribution-closeout-register.md)と[公開方針](distribution-adopted-policy.md)を正とする。

2026-11-11 作業管理の更新: [現行完了台帳](distribution-closeout-register.md)に完了工程・外部判断・公開受入を分離した。通常の原文提供/告知案の準備はPR #46でローカル完了。過去の未証明を証明済みに書き換えず、既知の範囲を再び自主調査へ戻さない。公開承認は未完。
2026-11-11。PR #45はhead `76b5ff9`、CI run `42783834578`成功、未解決レビューなしを確認しmain `64d19e883771dd06f2b6759da42f13985b298dfb`へマージした。追加調査は別レビュー用ブランチで行う。

## 検証前の観点

防ぐべき問題は、PDFの組版・コメント差を処理の変更と断定すること、フォント名/軸の類似や後年の同じ配列だけで輪郭の権利元を確定すること、文字列一致を許諾の充足へ置き換えること。

|観点|正常系|異常系|境界値|状態遷移|
|---|---|---|---|---|
|機能|Type 1 cleartextから定義の範囲を静的に読む|未閉鎖/重複/文字列内の偽定義を拒否|Adobe本体・フォント固有パラメーター・コメントを区別|原典→処理対応→許諾適用の判断|
|非機能|外部プログラムを実行しない|取得失敗を不存在の証拠にしない|PDF組版による改行は原画像へ戻す|固定hash→再確認→記録|
|データ|初出source/現在source/WASMの範囲を対応|第三者配布サイトの名前や無料表示を採用しない|一致するデータでも作成前の由来は別問題|過去証跡を保持して追補|
|UI|現行原文導線・公開保留を維持|未解決の許諾を正式承認と表示しない|製品資産変更なしならE2E未実施|追加証拠で保留理由を具体化|

ローカルは新しい静的比較の正常/異常/境界/状態遷移、既存WASM/原文ゲートと文書検査を対象とする。初出の参考原文2点を追加するため、PWA対象1件を逐次実行する。ローカル全件/他ブラウザー、実配信・実機は未実施。macOS/iOSは対象外。アーカイブの公開/添付・デプロイ・新PRのマージ・外部への質問送信は行わない。


## 結果

[処理・初出データの台帳](evidence/mm-font-provenance-review.json)、[検証記録](evidence/mm-provenance-validation.json)に固定URL、commit、入力hashと比較範囲を記録した。今回マージしたのはPR #45だけで、追加差分は別レビュー用。

### 初出データと文字輪郭の由来

元パス `core/src/fxge/fontdata/chromefontdata/FoxitSansMM.c` / `FoxitSerifMM.c` の履歴を調べ、両方の最古の観測commitは `5110c4743751145c4ae1934cd1d83bc6c55bb43f`（commit時刻2014-05-18、message Initial commit）だった。両履歴の返却は5件で上限100件未満。別forkの同パス照会でも同じ最古commitに達した。

このcommitには親 `76b563d2…` がある。GitHubの親tree照会は404だったが、[Google公式Gitiles](https://pdfium.googlesource.com/pdfium/+/76b563d2feed92ed328afb1f15e3466a9536b11b/?format=JSON)では空treeを確認できた。404を元データ不存在の証拠にせず、親なしrepositoryだったとも記載しない。

|対象|初出C配列→現WASM|分かった範囲|
|---|---|---|
|FoxitSansMM|66,919 bytes、SHA-256 ced6f674…、全bytes一致|現在提供しているデータは初出で観測したものと同一|
|FoxitSerifMM|113,417 bytes、SHA-256 24b32eae…、全bytes一致|同上。両snapshot間の全commitで無変更だったことまでは主張しない|
|初出のLICENSE/AUTHORS|BSD系原文1,553 bytes、著作者一覧295 bytesを固定|ソースはPDFium/Foxitの表示を持ち、AUTHORSはFoxitとGoogleを記載。Adobeの別条件を消す根拠にはしない|

原典は[初出Sans配列](https://raw.githubusercontent.com/chromium/pdfium/5110c4743751145c4ae1934cd1d83bc6c55bb43f/core/src/fxge/fontdata/chromefontdata/FoxitSansMM.c)、[初出Serif配列](https://raw.githubusercontent.com/chromium/pdfium/5110c4743751145c4ae1934cd1d83bc6c55bb43f/core/src/fxge/fontdata/chromefontdata/FoxitSerifMM.c)、[同時点LICENSE](https://raw.githubusercontent.com/chromium/pdfium/5110c4743751145c4ae1934cd1d83bc6c55bb43f/LICENSE)、[AUTHORS](https://raw.githubusercontent.com/chromium/pdfium/5110c4743751145c4ae1934cd1d83bc6c55bb43f/AUTHORS)。Cの数値literalを有界に読み、実行せずに復元した配列とWASM内の既知sliceを比較した。

**この一致で、公開前の文字輪郭の作成元までは確定しない。** FontInfoの空白Notice、フォント名、自己申告のCreationDate、軸値、検索結果にある同名フォントの無料表示を独立した由来証明に使わない。暗号化された輪郭部分の復号・実行や、出所不明フォントの取得も行っていない。必要な根拠は当該2データの作成/取得履歴、または適用を説明できる権利者の許諾である。

### MM処理の変更範囲を絞る

[Adobe公式の固定Type 1 Supplement](https://raw.githubusercontent.com/adobe-type-tools/font-tech-notes/eadd3b3ec80d0f3404d40b95cd5315453aa88c73/pdfs/5015.Type1_Supp.pdf)を再hashし、26/35–37/43/45ページを画像でも確認した。外部プログラムを実行せず、PFBのcleartextだけを比較対象とした。

|部分|静的比較の結果|判断の限界|
|---|---|---|
|Appendix Aのwrapper・makeblendedfont等|原典の758字句が両フォントの対応prefixと一致|コメント/空白を除いた字句一致。著作権表示の保持条件や全体の許諾充足は別判定|
|ConvertDesignVector|原典45ページの2軸・4master例と47字句が一致|選択した定義の対応であり、全フォント手続きの完全一致ではない|
|NormalizeDesignVector|Sansは50–1450/50–1450、Serifは110–790/100–900の範囲の正規化templateと一致|43ページは各フォントの軸/masterへ設定する必要を明記。3軸Minion例と違う定数だけで無許諾の改変とは断定しない|
|findfont|両フォントの定義206字句は互いに一致|26ページに無改変/著作権保持を伴う利用許諾説明があるが、この文書には比較する手続き本体がない。固定Adobe資料repositoryでも原本本体を得ておらず、原本無改変とは未判定|
|著作権コメント|製品で既に提供する76 bytesを維持|原典は末尾の句点と追加コメント等が異なる。字句比較から除いたコメント差を保持条件の充足へ置き換えない|

PDFの5箇所の組版上の折返しだけを、画像と照合して明示補正した。対象は `/` と `operatortype` の分離、errordict/ifelseのハイフネーション、`/` と `packedarraytype` の分離、別位置のifelseのハイフネーション。各パターンが正確に1回ある場合だけ補正し、フォント側は変更しない。一般的な空白の全削除や任意の単語連結は使わず、PostScriptのliteral文字列、名前、数値表記、token境界を保持した。

調査実装の初回では、36ページの番号がfooterではなくheaderにあることと、findfontが `bind 3 index exec` の間接的な形で終わることを未対応として拒否した。いずれもフォント変更と断定せず、原画像/固定cleartextへ戻って前提を修正した。既知のheader形と明示的に指定した間接形だけを許可し、未閉鎖・重複・不明な代入形の拒否は維持した。原因は調査実装の前提不足で、失敗を成功へ丸めず境界テストへ反映した。

## 提供物と検証

新しい提供物は初出時のBSD原文とAUTHORSの2点、計1,848 bytes。アプリの第三者ライセンスに独立した「MMフォント初出時の参考原文」欄を作り、全許諾・輪郭由来の確定ではない旨を表示する。前報までの原文/表示は保持し、原典PDF、C配列、フォントbinary、PostScript本体をGitへ追加しない。

再現時の前提はlockどおりの依存と、台帳にある公開WASM hash。ローカル入力は公開ソースのみで、利用者文書を使わない。

1. `python -m unittest scripts/test_mm_provenance.py`: literal配列、文字列/コメント/hex、名前・数値・token境界、不正/重複/間接定義、PDFの明示補正の6ケース。
2. `python -m scripts.verify_mm_provenance`: 固定WASM内の2 PFBから758字句prefixと3定義のfingerprint、原文2点を再照合。CIでもネットワークなしで行う。許諾の機械的な承認ではない。
3. `--initial-directory tmp` を加える場合は台帳の2初出CファイルをinitialSourceFixture名で配置。ソースhash・literal配列と現在のWASMを再比較する。
4. `--reference-directory tmp/pdfs` を加える場合は固定PDFを `adobe-5015.pdf` とし、台帳の抽出器・版で指定ページを抽出して `adobe-5015-pPAGE-46.txt` とする。PDFのraw hashと抽出textのcanonical LF hashを先に確認し、5補正と原典A/Dのtokenを再検査する。別抽出器では失敗し得るため画像確認を省略しない。
5. Node原文ゲート、型/build/配布物検査、PWA対象1件を逐次実行し、参考表示と2原文のオフラインhashを確認する。

## 残件・必要な追加証拠

|残件|次に必要な証拠と完了条件|
|---|---|
|MMの輪郭由来|当該2つの完全hashに対応する作成/取得記録、非Adobe派生条件の判断根拠、または別の適用許諾。初出rootのBSD表示だけで完了にしない|
|findfontの原本対応|当該206字句に対応するAdobe原本の版と保持/変更の判定、または当該データを認める別の権利根拠|
|コメント保持条件|原典と現データの句点/コメント差を含め、条件の充足や別根拠を責任者が判断できる記録。現在のraw 76 bytesを無断で改変しない|
|その他WASMの条件|FreeType/IJG/ICU等の正式適用・貢献表示、crate/生成物の個別条件。今回の字句一致から全体へ一般化しない|
|公開受入|最終版/提供物の再固定、許可後の実配信照合、ユーザーのWindows実機、責任者の公開可否判断。今回は公開保留|

提供元へ確認する場合の質問を、送信せず次の内容へ絞る: (1)台帳の2フォントhashの輪郭はどの作成/取得元に基づくか、(2)findfont本体206字句の原典と変更有無を示せるか、(3)Adobe条件への適合または別の許諾根拠を当該データに結び付けられるか。原典A/Dで既に対応を確認した範囲を、再び漠然とした「全コード未確認」へ戻さない。これらの回答取得・権利者/専門家の判断は今回未実施である。


実施結果: 新規Python6ケース・旧ガード込み33ケース、Node原文5ケース、初出C入力とPDF原典入力を含む全再照合、型/build/配布物検査に成功。PWA対象1件はWindows Chrome headless、逐次、失敗/skip/再試行0。HTTP245資産の不一致0、新世代4c05634f7a78a8300d5247d3。通常本番/全npmとTiny67対象監査は全重大度0、実行資産7件のhashは従前と不変。ローカル全件/他ブラウザー/実配信/実機は未実施で、CIは新PRの固定head/runへ結果を記録する。


環境差の追補: Chromeの更新を確認したため、Playwrightの実行中browser.version()をannotationへ記録して対象1件を再実行した。最終実行はChrome 157.0.8103.50、失敗/skip/再試行0。前回の版を今回の実行環境として転記しない。
