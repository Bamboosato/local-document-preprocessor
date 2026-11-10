# 通常依存の内部表示とWASM個別条件

2026-11-10。PR #40はhead `ec3cffa` の両CI成功・未解決レビューなしを確認し、main `12f82f39150b7736482fa0eae26e70a42f805a02` へマージした。本作業は別レビュー用ブランチで行う。アーカイブ公開/添付・デプロイは行わず、macOS/iOSは対象外、Windows実機はユーザー別途。

## ケース作成前の観点

最優先は、内部の別著作者/条件の欠落、加工されたJSの出所誤認、WASM候補のAND条件の片落ち、未確認の公開承認を防ぐこと。

|観点|正常|異常|境界|状態遷移|
|---|---|---|---|---|
|機能|内部NOTICE/ヘッダーと提供場所を対応|欠落/改変/版違いの検出|通常npm117組とTiny内包物を区別|未確認→証拠付き判断/保留|
|非機能|固定lockと入力hash、ネットワークなしの再検査|部分的走査を完全調査と表示しない|バイナリ/大型ファイル/生成物を明示|原文保管→build→オフライン提供|
|データ|同一本文でも権利者/出典を保持|ANDをORと取り違えない|WASMの実リンクと条件準備を分離|旧世代を保持して新しい表示を追加|
|UI|原文・由来・加工説明を利用者が確認|リンク切れを提供済みにしない|可読な表示と無改変原文|オンライン準備後のオフライン確認|

検証は文書・走査結果の整合、必要な提供材料の個別確認、変更した場合のbuild/配布物とPWA対象E2Eを順に行う。走査は調査候補の発見であり完全な著作権調査ではない。実行時のコード寄与・WASM実リンクを文字列検索で確定しない。

## 結果

[検証記録](evidence/distribution-internal-notices-validation.json)、[通常依存の発見台帳](evidence/production-internal-notice-discovery.json)、[WASM個別条件](evidence/wasm-individual-condition-review.json)を作成した。

### 通常依存の内部表示

固定lockの本番扱い117組を対象に、JS/TS/MD/TXTとLICENSE/COPYING/COPYRIGHT/NOTICE/AUTHORS名のファイルを上限4,000,000 bytesで走査した。選択2,162ファイル、内部の権利/ライセンス/由来マーカー187ファイル、選択した内部NOTICE名ファイル0、上限による除外0。バイナリ・source map等の非選択ファイルと、実行時寄与の判定は含まない。マーカー検出は候補発見であり、187件すべての法的適用を確定したとはしない。Types等も含むrootの保守的なパッケージ一覧で、配布コードの完全SBOMではない。

`pdf-lib 1.17.1` でroot MITだけでは表されない内部表示を確認した。固定公開npm tarballのSRIと15 TypeScript入力を照合し、完全なコメントブロック/行コメント群を保持した [INTERNAL-NOTICES.txt](third-party-npm-licenses/pdf-lib@1.17.1/INTERNAL-NOTICES.txt)（4,505 bytes）を追加した。Mozilla Foundation、Glyph & Cog、Niklas von Hertzen、Devon Govett、移植/借用元と上流の加工者の表示を含む。root MITの再ライセンスとは扱わず、内部のApacheを指す表示に対応する [Apache全文](third-party-npm-licenses/pdf-lib@1.17.1/APACHE-2.0.txt)も別資料として提供する。[固定出典](evidence/pdf-lib-1.17.1-notices.json)に元ファイルhash・コメント抽出方法を記録した。

上流の [FlateStream表示](https://raw.githubusercontent.com/Hopding/pdf-lib/v1.17.1/src/core/streams/FlateStream.ts)、[base64の表示](https://raw.githubusercontent.com/Hopding/pdf-lib/v1.17.1/src/utils/base64.ts)と対応する。Apache全文には既存の固定原文をそのまま使用した。これはpdf-libのrootに上流NOTICEが存在したという主張ではない。歴史的PDF.jsのNOTICEと、pdfkit/base64借用元の版・MIT原文の対応は次の確認対象で、内部表示15入力の保存だけで適合完了とはしない。

### 加工表示と配布物

ページ用JS・変換Worker・JSON Workerの3生成chunkへ「結合・圧縮したアプリ生成物で上流原本ではない」旨と第三者ライセンスの場所を先頭コメントとして付けた。ビルド後に無理にファイルを書き換えず、[RolldownのpostBanner](https://rolldown.rs/reference/Interface.OutputOptions)で圧縮後・hash決定前に付ける。[Worker設定](https://vite.dev/config/worker-options)にも同じ出力設定を明示した。固定Tiny公開JSとWASM2件の3資産は旧固定hashのまま無改変。アプリの変換ロジック・依存版・SWの更新方針を変更しない。

第三者ライセンスから内部表示2点をオフライン提供し、生成JSの加工と、Tiny公開JSが無改変であることを区別して表示する。ライブラリ作者の原文をこの説明で置き換えない。加工表示を追加したこと自体を、Apache 4節等のすべての条件充足としない。

PDFiumのnpm提供 `LICENSE.pdfium` は、冒頭のBSD系3条件とApache-2.0本文を併記していた。片方の名称で全体を代表させず、従来の単独コピー名 `PDFium-Apache-2.0.txt` を `PDFium-LICENSE.txt` へ変更した。元の全文bytesと、利用者が実際に辿るnpm一覧の `LICENSE.pdfium` は保持する。途中でBSDのみを示す案を検討したが全文確認で修正した。これはPDFium全体のライセンスを単一条件へ再分類する変更ではない。[固定上流のLICENSE](https://raw.githubusercontent.com/embedpdf/pdfium/cb29e78f2ba00c9298714d5f4a8bf7765f1e802f/LICENSE)も両部分を含むが、上流sourceと公開WASMの完全な内包範囲は別の問題。

### WASM候補の個別条件

固定Cargo候補3件の公開crateをメモリ取得し、既存checksumを再照合した。LICENSE/COPYRIGHT等の候補名ファイルは合計8点で、保管済み8原文のhashとすべて一致。ファイル名で探した追加原文候補の過不足の確認であり、各crateの全ソース内部の権利関係まで確定したものではない。

|対象|準備用の推奨と保持する条件|提供・未完|
|---|---|---|
|encoding_rs 0.8.35|MIT AND BSD-3-Clause。MITの権利/許諾と、WHATWGの権利/条件/免責、binary資料での再掲、無断推奨禁止を保持|既存4原文を保持。ORのMITを選ぶ案でもBSD側を省かない。WASM内包と対象データの範囲は未証明|
|unicode-ident 1.0.24|MIT AND Unicode-3.0。MIT許諾とUnicodeの権利/許諾をsoftware/dataまたは関連資料へ保持し、無断の宣伝利用をしない|既存3原文を保持。MIT原文に明示的な著作権行がないため勝手に創作せず、作者/権利者の適用範囲は確認を残す|
|zlib-rs 0.6.6|Zlib。出所詐称禁止、変更ソースの明示、source配布での原文保持。製品資料での謝辞は任意|Trifecta Tech Foundation 2024の原文856 bytesを第3のWASM候補として追加。実リンク・生成WASMの加工/配布形態は別途|
|PDFiumの提供原文|冒頭のBSD系再掲/無断推奨禁止とApache全文をともに保持|原文名を中立化。どの部分にApache 4節・歴史的NOTICEが適用されるか、9外部領域/29原文候補は個別確認を継続|

準備用の推奨は正式公開版のライセンス選択/法的適合の承認とは分ける。原文上のこの3候補について全ソースZIPの一律提供義務は読み取っていないが、残る93 registry依存・workspace原文2点・PDFium内包物や別条件を対象外にしない。[Apache 4節](https://www.apache.org/licenses/LICENSE-2.0)の原文提供・加工表示・適用される権利/NOTICEの保持を、候補原文の大量同梱で充足したとは扱わない。

## 検証と残件

- 新旧の原文ゲート2ケース成功。内部表示の欠落・改変、元15ソースの改変、版違いを拒否し、復元後に成功。pakoの既存ガードも成功した。
- `npm run build` と `npm run check:dist` 成功。加工表示を生成JSから一時的に除くと検査が拒否し、元bytesへ復元後に再成功。PDFium別名変更時には配布物の期待一覧の追従漏れも検出し、全出力名を揃えて再検証した。
- ローカルE2Eは**対象ケースのみ**。PWA原文/オフライン、JSONの図・構文検証、実WASM変換の3ケース成功、失敗0・skip0・再試行なし。PDFium名を最終形へ揃えた後、PWA1件も再成功。生成コメントによりページ/Worker chunkが変わるため選定した。全件・別ブラウザー・実機・実配信は未実施。Windows Chrome headlessで逐次実行した。
- 新PWA世代 `8ac0428d0eb24c556bee2616`、manifest223資産、SW/manifestを含むHTTP225資産で不一致0。root117組の原文・内部表示121資料、Tiny69原文、WASM3候補8原文を保持。旧版の固定221/222生成物を上書きせず履歴に残す。
- 通常の本番/全npmと既定Tiny67対象の脆弱性監査は全重大度0。これは今回の内部NOTICEの網羅性・適用判断の代わりにはならない。

文書83件・ローカルリンク411件で問題0。差分空白検査も成功。

残件は、まずpdf-libが指す歴史的PDF.js NOTICEとpdfkit/base64原文の版対応、走査で得た他パッケージの内部表示の個別判定。その後、WASMの残り93依存・workspaceとPDFium候補の条件確認を進める。必要な表示・提供材料が整うまで公開判定を保留し、実配信先での照合とユーザーのWindows実機受入は別途行う。今回マージしたのはPR #40のみで、以降の変更はレビュー用PRにする。
