# 借用元原文の版対応とWASM残依存の確認

2026-11-10。PR #41は固定head `96d5a97` の両CI成功・未解決指摘なしを確認してsquash mergeし、main `a76440c0eae6b85a8cd9caf77ff25e4a28cb5f5b` へ同期した。本作業は別レビュー用ブランチ。アーカイブ公開/添付・デプロイは行わず、macOS/iOSは対象外、Windows実機はユーザー別途。

## ケース作成前の観点

最優先は、別版の借用元原文を対応済みにすること、汎用本文の一致を権利者や実リンクの証明とすること、条件選択/AND/未判定を誤表示すること。

|観点|正常|異常|境界|状態遷移|
|---|---|---|---|---|
|機能|参照commitと原文を対応させる|原文欠落・別版・改変の拒否|固定参照/版指定なし参照を分離|未確認→対応確認/候補/未確定|
|非機能|固定checksumと取得bytesを検証|取得失敗を確認済みにしない|大きいarchive・多くの候補・workspace fallback|取得後のオフライン提供|
|データ|権利表示・条件・出典hashを保持|ANDをOR化しない、スラッシュを無条件にORと解釈しない|同じ本文・異なる参照元/権利者|旧記録を保持した追加照合|
|UI|提供資料と未確認の範囲が分かる|リンク切れを提供済み扱いにしない|候補収集と条件充足を分離|オンライン準備→オフライン閲覧|

製品への原文追加がある場合はbuild/配布物検査とPWA対象ケースを実行する。製品ロジックは変更せず、全件・クロスブラウザーをローカルの既定にしない。元コード・archiveは実行/展開せず、固定出典とテキストを読み取る。

## 結果

[検証記録](evidence/borrowed-source-license-validation.json)、[借用元対応表](evidence/pdf-lib-borrowed-license-review.json)、[残93crateの照合](evidence/wasm-remaining-condition-review.json)、[条件の判断台帳](evidence/wasm-condition-dispositions.json)を作成した。

### 借用元の版と原文

|対象|今回確認した対応|提供・限界|
|---|---|---|
|pdfkit|pdf-libの7参照が指す5固定commitのLICENSEを取得し、全件同一hash/1,067 bytesを確認|[MIT原文](third-party-npm-licenses/pdf-lib@1.17.1/PDFKIT-MIT.txt)を提供。参照元コメントとcommit/pathもビルド時に確認する。移植・変更後のコード全体が上流とbyte一致する主張ではない|
|base64-arraybuffer|公開0.1.2/0.2.0/1.0.2の各archiveをSRI（旧版は公開SHA-1）で照合し、MIT原文1,062 bytesが同一。pdf-libにある2012 Niklas von Hertzen/MITの記載と対応|[共通MIT原文](third-party-npm-licenses/pdf-lib@1.17.1/BASE64-MIT.txt)を参考候補として提供。pdf-libの参照には版/commitがなく、実借用版は未特定|
|PDF.js|v1.10.100=`ea29ec83…`、v2.0.943=`dc98bf76…` のcommitとtruncatedでない完全treeを取得。両版のLICENSEは同一10,174 bytes。AUTHORSは893/981 bytesで異なる|[LICENSE候補](third-party-npm-licenses/pdf-lib@1.17.1/PDFJS-LICENSE.txt)と[AUTHORS旧候補](third-party-npm-licenses/pdf-lib@1.17.1/PDFJS-AUTHORS-v1.10.100.txt)、[AUTHORS新候補](third-party-npm-licenses/pdf-lib@1.17.1/PDFJS-AUTHORS-v2.0.943.txt)を参考候補として保持。実借用版の一意な対応は未証明|

pdfkitは [固定参照1](https://raw.githubusercontent.com/foliojs/pdfkit/1e62e6ffe24b378eb890df507a47610f4c4a7b24/LICENSE)、[固定参照2](https://raw.githubusercontent.com/foliojs/pdfkit/e71edab0dd4657b5a767804ba86c94c58d01fbca/LICENSE)などの原文を確認した。base64は [固定公開metadata](https://registry.npmjs.org/base64-arraybuffer/0.2.0)とarchiveを用い、現行mainのLICENSEを昔の版の原文と見なしていない。

PDF.jsの完全tree2件では `NOTICE` / `NOTICE.txt` は見つからなかった。これは**検査した2候補に限定した不存在確認**であり、実借用版や他の名前の告知が存在しない証明ではない。[固定LICENSE](https://raw.githubusercontent.com/mozilla/pdf.js/ea29ec83e1bb4ea44d71cccc451c6b9374e10fb9/LICENSE)はApache本文を含むが、現在保存した内部コメントの権利表示だけで過去の権利・許諾履歴すべてを独立確認したとはしない。

追加5資料は計14,177 bytes。固定pdfkit原文と参考候補を一覧で明示し、元の内部表示/Apache原文を置き換えない。ゲートは7資料のhash、元15ソースのhash、固定5commitの原文一致と参照元コメントを検査する。別版の借用原文へ差し替えた場合も拒否する。

### WASMの残93 registry候補

公開crateを4件ずつHTTP取得し、コードを実行/展開せず全93checksumを再照合した。保管185原文は全件byte数/hash一致、うちinclude_dir/include_dir_macrosの2件はarchive内のVCS commit/pathと、固定workspaceのLICENSEを再照合した。残る原文は検証済みarchive内と対応する。LICENSE/COPYRIGHT/NOTICE/AUTHORS等の名前で探索した追加候補は0件だったが、ソース内部の権利表示や非典型名の告知の網羅性の証明ではない。

既存3候補8原文と合わせ、registry96組・193原文まで出典対応を確認した。workspace自体の2原文を加えた195原文は従前からの候補集合として保持し、実公開WASMに全96組がリンクされたことや、全条件が満たされたことに置き換えない。

93件について原文・条件式と条件付きの準備プロファイルを記録した。標準OR等ではMIT 84件/Apache 2件を準備用候補とし、全代替原文を保持。Apacheでは原文/加工表示/該当する権利・NOTICE、MITでは該当する権利/許諾表示の保持を確認項目にする。これは選択条件の準備であり、実際の対象範囲・追加提供・履行完了の機械判定ではない。

旧スラッシュ表記7件を別途確認した。

- csv、csv-core: 固定READMEがMITまたはUnlicenseの二重ライセンスと明示。
- stringprep、version_check: 固定READMEがeither/at your optionを明示。
- unicode-properties: COPYRIGHTと固定ソースヘッダーがApacheまたはMITの選択を明示。ヘッダーには2012–2015 Rust Project Developersの表示もあり、最終提供時に確認する。これら5件はMITを準備用候補とする。
- fnv、rangemap: 今回の確認では代替選択の明示を確定しておらず、両原文を保持して選択を保留。スラッシュを無条件にORへ変換しない。

これで93件中、準備用推奨はMIT 89/Apache 2、選択保留2。先行3件のAND等の個別条件は引き継ぎ、未処理の条件を標準MIT一つへ丸めない。checksum不一致、未対応のAND/未知条件、旧形式の誤った選択を拒否するオフライン3テストも追加した。

### PDFiumの個別条件

固定候補29原文を全件再hash照合し、9外部領域を個別に条件表へ整理した。in-treeの9領域も元原文と対応させた。根拠は固定source/DEPS候補であり、公開WASMの完全なリンク一覧ではない。

|対象|条件付きの確認事項|
|---|---|
|abseil|Apache原文・該当する権利/AUTHORS・NOTICE・変更表示|
|brotli|MITの権利/許諾/免責保持|
|fast-float|MITを準備用候補とし、著作者と他のApache/Boost原文も保持。複数原文を自動的なANDとしない|
|FreeType|FTL選択を準備案とする場合、sourceの原文/変更保持と、binary資料でのFreeTypeの貢献表示が必要。年・例外と実適用を確認。GPLv2原文も保管されていることだけでGPL適用とはしない|
|harfbuzz|COPYINGの実際の許諾・権利表示を保持し、汎用MITというラベルだけで判断しない|
|ICU|複合原文と取り込まれた第三者条件を保持し、一つのMITへ縮約しない|
|libpng|版ごとの原文/権利者・由来・変更条件を保持|
|zlib|出所詐称禁止、変更ソースの明示、sourceの原文保持。謝辞は任意|
|jpeg-turbo|IJGに基づくbinary資料の謝辞、TurboJPEG利用時のModified BSD、SIMDのZlib等を実際の利用部分に照らして確認。単純ORにしない|

FreeTypeのFTLとjpeg-turboのREADME.ijg/LICENSE.mdには、単に原文ファイルを同梱するだけでは済まないbinary資料の表示条件があるため、実内包確認と表示案を次に優先する。ICUの複合条件も別に残す。またcpu_features/dragonbox/googletestのREADME metadataに対し、この29原文集合には独立した原文が収集されていない。`shipped` のyes/noだけで対象外にせず、必要原文の範囲を確認する。

## 検証・残件

- Node原文ゲート2ケースとPython研究ガード3ケース成功。条件検査はネットワークなしでCIにも追加し、93archive取得のネットワーク調査をCIへ入れない。
- build/型/配布物検査成功。製品の依存版、変換実装、Worker/SWロジックは変更せず、実行資産7件のhashはPR #41の固定記録から全件不変。
- ローカルE2Eは原文追加とラベルの影響に対応するPWA **1件のみ**、Windows Chrome headlessで逐次実行して成功。借用元5資料を含む全pdf-lib資料のオフラインhashと、固定対応/参考候補の区別を確認。初回はラベルがアンカー隣のテキストノードだけで完全一致検査できず、独立spanへ分けて同じケースを再成功させた。分類は表示構造とテストの可観測性。全件/他ブラウザー/実機/実配信は未実施。
- 新世代 `633ebf4e3c51166b04f6b288`、manifest228/HTTP230資産、不一致0。root117組の原文・内部表示126資料を保持し、従前の固定生成物を上書きしない。
- 通常の本番/全npmとTiny67対象の監査は全重大度0。ただしNOTICEの網羅性や権利条件の充足の証明ではない。

文書84件・ローカルリンク422件で問題0、差分空白検査も成功。監査方針12件、既存を含むオフライン研究ガード13件も成功した。

次の優先順は、(1) PDFiumのFTL/IJG/ICUの表示と未収集3領域の原文、(2) fnv/rangemapの条件選択、base64/PDF.jsの実借用版と権利/告知範囲、(3) WASMのソース内部表示・実対象と最終履行の確認。通常依存の他の内部表示も従前の残件として保持する。必要な条件が未確認のまま公開承認にせず、許可された実配信とユーザー実機の受入は別途行う。今回マージしたのはPR #41だけで、追加差分はレビュー用PRへ分離する。
