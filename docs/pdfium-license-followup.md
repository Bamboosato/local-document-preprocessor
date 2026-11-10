# 実借用版・条件選択とPDFium追加原文の確認

2026-11-10。PR #42は固定head `33a0fca` の両CI成功・未解決指摘なしを確認しmain `03fd82656916ede1e9f74c6bfa61356a2fcca04b` へマージした。本作業は別レビュー用ブランチで実施。アーカイブ公開/添付・デプロイは行わず、macOS/iOSは対象外、Windows実機はユーザー別途。

## ケース作成前の観点

最優先で防ぐべき問題は、別版の原文で条件充足とすること、必要なbinary表示を原文リンクだけで済ませること、実内包や実借用版を未証明のまま確定表示すること。

|観点|正常|異常|境界|状態遷移|
|---|---|---|---|---|
|機能|固定出典・条件と提供場所の対応|原文欠落/改変・出典違いの拒否|版確定/共通本文/版未特定を区別|保留理由を追加証拠で更新|
|非機能|完全treeと固定hash、オフライン再検査|truncated/取得失敗を確認済みにしない|複数条件/例外/必要な貢献表示|取得→資料固定→build→オフライン|
|データ|原文・権利者・改変説明を保持|任意の年/版/ORを創作しない|metadataのshippedは実リンク証明でない|古い証跡を上書きせず追加|
|UI|条件付きの表示案と実提供を区別|未提供を提供済みにしない|参考候補が確定版に見えない|更新世代の原文閲覧|

製品資料を追加した場合は原文ゲート・build/配布物検査・PWA対象ケースを逐次実行する。条件や版の調査だけなら不要な全E2Eは追加せず、実機/実配信と分離する。

## 結果

[検証記録](evidence/pdfium-license-followup-validation.json)、[候補資料台帳](evidence/pdfium-notice-materials.json)、[借用版の調査](evidence/borrowed-actual-version-investigation.json)、[条件選択の準備方針](evidence/legacy-license-preparation-policy.json)を追加した。

### PDFium未収集3領域

固定PDFium `cb29e78f…` のtruncatedでない完全treeを再確認した。3領域のsrc原文がtreeにないのはDEPSで外部取得されるためで、READMEの名前だけから原文不要とはしない。

|領域|固定DEPS revision/条件|今回の原文と注意|
|---|---|---|
|cpu_features|`936b9ab5…`、checkout_android|LICENSE 12,876 bytes。Apache本文だけでなくAndroid Open Source Project 2010のBSD系条項も全文保持|
|dragonbox|`beeeef91…`、checkout_v8|Apache-with-LLVM-Exception 12,262 bytesとBoost 1,338 bytes。LLVM例外を削らず保持|
|googletest|`4fe3307f…`|BSD系LICENSE 1,475 bytes。metadataのShipped=noだけで実配布物からの除外を確定しない|

取得元は[固定cpu_features原文](https://raw.githubusercontent.com/google/cpu_features/936b9ab5515dead115606559502e3864958f7f6e/LICENSE)、[固定dragonbox原文](https://raw.githubusercontent.com/jk-jeon/dragonbox/beeeef91cf6fef89a4d4ba5e95d47ca64ccb3a44/LICENSE-Apache2-LLVM)、[固定googletest原文](https://raw.githubusercontent.com/google/googletest/4fe3307fb2d9f86d19777c7eb0e4809e9694dde7/LICENSE)等。Chromium mirrorの固定URLから取得し、原文bytesとhashを固定した。

[dragonbox README](https://raw.githubusercontent.com/embedpdf/pdfium/cb29e78f2ba00c9298714d5f4a8bf7765f1e802f/third_party/dragonbox/README.pdfium)のrevision `6c7c925b…` はDEPSと異なる。両revisionの原文2点は同一bytesだった。対応するコードや実ビルド入力が同一であるとはしない。checkout_android/v8は取得条件として記録し、実WASMの条件値・リンクの証明には使わない。

新たな4原文で、以前の29原文候補に対する未収集3領域の資料不足を補完した。旧29原文は履歴として変更しない。すべての内部NOTICEやソース内権利表示が揃ったという結論ではない。

### 固有条件と提供形態

4新原文に加え、固定出典とhashが確認されているFreeTypeのFTL、libjpeg-turboのLICENSE.md/README.ijg、ICUのLICENSE/license.htmlの5原文を候補資料として提供する。計9原文と[条件付き貢献表示案](third-party-wasm-notices/pdfium/CANDIDATE-CREDITS.txt)1点、計81,276 bytes。第三者ライセンスの独立したPDFium候補欄に置き、実内包・条件充足が未確認である旨を表示する。

- FreeType: FTLを選ぶ場合、binary資料でFreeTypeの仕事に基づく旨を表示する条件がある。表示案を準備したが、実対象の版・変更・例外は引き続き確認する。任意の年を補わず、無改変の原文の年・権利者を保持する。
- IJG/libjpeg-turbo: libjpeg系の利用が含まれる場合に必要なIJG貢献表示を準備した。TurboJPEG API、SIMD部分等の条件は一律ORへ縮約せず原文と対応させる。
- ICU: 原文2点に含まれる複合的な第三者表示をそのまま保持する。単一のMIT表記や短い謝辞で置き換えない。
- cpu_featuresの追加BSD部分、dragonboxのLLVM例外・Boost代替、googletestの無断推奨禁止等を省かない。原文数の増加だけを義務充足の根拠としない。

表示案は「該当コードを含む場合」の準備資料として明示する。実内包が未確定の状態で「このbinaryはFreeType等を含む」と断定する正式表示へ自動移行しない。必要な原文はオフラインへ含めるが、大きなソースZIPやコードarchiveは取得対象へ追加していない。

### 実借用版の調査

base64はpdf-libの導入commit `762a22bb…`（2019-06-30）に遡り、現在の公開npmソースと導入時ソースが全bytes一致した。公開時刻は0.1.2が2014-03-18、0.2.0が2019-04-28、1.0.2が2022-01-22。従って1.0.2は実借用元ではなく、同じMIT原文を確認する参照資料に限る。0.1.2/0.2.0や当時の別commitの一意な特定はできていない。既存の共通MIT原文・2012 Niklasの表示は保持する。

PDF.js streamsのコピーcommit `a942700f…`（2019-05-22）と、TypeScript変換commit `825e6161…` を特定した。コピー時の関連PR/commitコメントの照会では追加の版指定が得られなかった。7 ES5 closureについて、コメント/空白/引用符表記のみを正規化して4版と静的比較し、v1.4.20は2件、v1.7.225は3件、v1.10.100は4件、v2.0.943は6件が一致した。FlateStreamは一致せず（次報で1行の変更を確認）、全ファイル一致や一意な借用版・意味的同等性の証明とはしない。

比較はJavaScriptを実行せずテキストとして行う。再現用は `scripts/compare_borrowed_sources.py INPUT_DIRECTORY NEW_OUTPUT_JSON`。取得URL・各入力hashは調査台帳に記録。文字列の内容をコメント/空白として消さないこと、closureが見つからない場合を一致扱いしないことをオフライン試験で検査した。元の参考候補表示を確定版に書き換えず、実借用版でのNOTICE/権利範囲は残す。

### 条件選択2件

fnv/rangemapはcrateのVCS情報から公開元commitを特定し、その固定READMEも確認したが、スラッシュ以外の明示的な選択記載は今回見つからなかった。ORの意味を創作して一方を省略する代わりに、**MITとApache-2.0の両条件を満たす準備方針**へ切り替える。上流の宣言式はそのまま保持し、上流ライセンスをANDへ再分類する主張ではない。

この方針で選択だけを待つ独立作業は準備段階から外す。両原文、該当する権利/NOTICE、変更表示を保持する具体的な履行と実対象は別途確認する。最終適合・公開承認まで完了したとはしない。

## 検証と残件

- Node原文ゲート3ケース成功。新候補9原文/表示案の欠落・改変・wrapper版違いを拒否し、復元後成功。CPU追加BSD、LLVM例外、表示案が未確定である文言も検査。
- Python研究ガード5ケース成功（旧ELK候補ガードを含むCI相当の合計15ケース、監査ポリシー12ケースも成功）。静的比較の境界も確認し、外部コードは実行しない。新旧条件表・原文の網羅性や法的適合を自動判定する試験ではない。
- build/型/配布物検査成功。実行資産7件のhashは従前の固定記録と不変。依存版・変換実装・Worker/SWロジックは変更していない。
- ローカルE2Eは原文・候補表示の変更に対応するPWA1件のみを選び、Windows Chrome headless、逐次、失敗0・skip0・再試行なしで成功。追加10資料のオフラインhashと候補である表示を確認。全件/他ブラウザー/実機/実配信は未実施。
- 新PWA世代 `745e49248a4954c0b159e423`、manifest238/HTTP240資産、不一致0。通常の本番/全npm・Tiny67対象監査は全重大度0。旧生成物・証跡を上書きしていない。

残件は、実WASMに対するsource/DEPS候補の適用・内包・変更情報と、必要な正式貢献表示の確定、ICU等の内部条件/例外、他の通常依存・WASM内部表示の個別判定。base64/PDF.jsの実借用版は未確定の履歴を保持し、原文対応の証拠と混同しない。正式公開は配布準備方針に従って保留し、許可された実配信とユーザーのWindows実機受入を別途行う。今回マージしたのはPR #42のみで、追加差分はレビュー用PRに分離する。
