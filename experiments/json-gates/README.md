# JSON v0.2（追補1）技術検証ハーネス

製品へ組み込む前のG-01～G-04用の試作。既存アプリの入力受付・画面・production Workerは変更しない。合成データ専用で、外部変換サービスを使用しない。

先に[検証観点](../../docs/json-gates-test-plan.md)を読む。最終判定は[検証結果](../../docs/json-gates-validation.md)を参照する。ケースが成功していても、未確認の実機項目や未達のG-04を通過扱いにしない。

G-04の後続試作は[代替方式の観点・選定](../../docs/json-g04-alternative-plan.md)と[再検証結果](../../docs/json-g04-alternative-validation.md)を参照する。従来のiframe候補は比較用に残し、本体統合は引き続き保留する。

Firefox期限精度・WebKitオフライン再読込の追加検証は[残件の改善・再検証](../../docs/json-g04-followup-validation.md)を参照する。初回・代替初版の結果は履歴であり、最新版の環境・判定と区別する。

## 準備

リポジトリの依存がインストールされたWindows／Node 24環境を使用する。Vite、Playwright、Markdown処理と既存PDF経路はリポジトリ側を使用する。JSON解析とMermaidは本フォルダーの`package-lock.json`で固定し、rootの依存定義は変更しない。

```powershell
cd C:\work_codex\local-document-preprocessor\experiments\json-gates
npm ci --ignore-scripts
npm test
npm run build
npm run preview
```

別のターミナルで、同じフォルダーから一つずつ実行する。

```powershell
node browser-check.mjs chrome edge firefox webkit
node alternative-check.mjs chrome edge firefox webkit
node memory-check.mjs
npm audit --omit=dev
```

Chrome／Edgeはローカルの実ブラウザを使用する。今回の追補検証では試作内のPlaywrightを`1.64.0`に固定した。同じ試作フォルダーで`npx playwright install firefox webkit`を実行して対応ブラウザーを準備する。rootの依存定義・lockfileは変更しない。Playwright WebKitはmacOS Safari／iPhone Safari実機の証明にはならない。

自動再読込の影響を避けるため、検証は**ビルド済みのpreview**で行う。開発用`npm run serve`では依存の最適化でページが再読込される場合がある。ビルド・ブラウザ実行・メモリ計測を同時に走らせず、ブラウザも一台ずつ逐次実行する。

対象限定の再現には、PowerShellで次のように指定する。使用後は環境変数を消す。

```powershell
$env:GATE_FILTER='G04-01|G04-02|G04-03'
$env:EVIDENCE_SUFFIX='-reproduction'
node browser-check.mjs chrome edge firefox webkit
Remove-Item Env:GATE_FILTER, Env:EVIDENCE_SUFFIX
```

## 構成

- `core.mjs`: 厳密UTF-8、深さ／件数の事前走査、字句保持構文木、重複キーとUnicodeの検査、Pointer解決、3スタイル生成、1解析セットのキャッシュ。
- `core.test.mjs`: 文法・データ・境界・AST／plain textの照合。実装の出力だけで期待値を作らず、既知のセル、トークン、復号後の値とも比較する。
- `redacted-reporter.mjs`: 単体検査の失敗でもactual／expectedの文書全量やスタックを出さず、fixture IDと失敗分類だけを表示する。
- `worker.mjs`: 検査・詳細抜粋・表示窓・生成・解析キャッシュ、既存PDF変換経路の対照と取消。文書本文をUIへ全複製しない。
- `app.mjs`／`index.html`／`style.css`: ネイティブラジオ、対象と開閉の分離、1階層50件／総300行、字下げ64px、選択位置復元、取消と確定の試作。
- `validation-worker.mjs`: 固定したMermaidの厳格設定で構文検証。コードポイント50,000を明示検査する。ライブラリ側のUTF-16単位の上限とは分離する。
- `diagram-host.mjs`／`renderer.mjs`／`frame.html`: sandbox iframe候補、出所・nonce・世代照合、描画前後のSVG検査、初期化15秒／描画5秒、出力許可と再描画の分離。**このiframe方式は全ブラウザの中断・オフライン要件を満たしていない**。
- `public/gate-sw.js`: 専用ポート上の静的資産だけをキャッシュする試作。入力・結果・設定・クエリ付きURLを保存しない。production SWは変更しない。
- `browser-check.mjs`: ケース意図付きの逐次検証。スクリーンショットは合成データのみ。実行ログはfixture ID・集計値・時間・状態とし、本文を出さない。
- `memory-check.mjs`: Chrome CDPでUIとWorkerのヒープ／backing storageを別々にサンプリングする。明示GCありの診断値であり、プロセス全体の最大メモリではない。
- `probe-labels.mjs`: 不採用の文字参照方式等を比較する診断。`matches:false`は従来候補の再現であり、採用候補の合格を意味しない。

## 証跡と測定の読み方

`evidence/`はローカル生成物として除外している。ブラウザごとのJSONにケースID・意図・成否・測定値を保存する。画像は対象UIの確認・失敗時に取得し、合成データを使った場合もツリー・詳細・対象・図等のデータ領域をマスクする。本文をコンソールやエラーに記録しない。コミット可能な結果の要約は`docs/json-gates-validation.md`へ記録する。

失敗・前提未達・実行環境不足があればブラウザスクリプトは終了コード1を返す。G-04に未達が残る現在の候補では、全件コマンドの終了コード1が正しい結果となる。

G-04の有限6500ms負荷は、特定のJSONが実際に6500ms掛かるという主張ではない。描画処理が長時間同期実行されたとき、選んだ隔離コンテキストを親が5秒で実際に破棄できるかを検査する。タイムアウトを延長して成功扱いにはしない。

320px表示と、640px幅での本文・ラベル32px表示は試作のレイアウト検査であり、実ブラウザのページズーム200%・OSの文字拡大・スクリーンリーダー・タッチ実機確認の代用ではない。JSON/PDF混在の確認も、productionキューへ統合した全E2Eの代用ではない。

Mermaidのメタデータ構文は`labelType: text`を必須とする。既定のMarkdown解釈や文字参照だけへの依存を避け、キーと値はJSONとして復号可能な表記にする。安全性・文字保持の検証が済んでいない別形式へ自動で切り替えない。

## G-04の独立Worker代替試作

ビルド・preview後に `http://127.0.0.1:4187/#worker` を開くと代替コントローラーを使う。図の操作は `window.gates.diagram` から試験する。ハッシュなしは従来iframe候補。両候補はService Workerを共有しないため、比較時は新しいブラウザーコンテキストを使う。

- `diagram-worker-host.mjs`: 固定MermaidによるWorker構文検証、検証したソースとレイアウト入力の一致検査、5秒／15秒の中断、新世代・新Workerによる再試行、固定SVG要素とtextContentによる表示。DOM追加を10ノード単位で非同期に分割し、クリア等の介入を受け入れる。静的資材を専用Cache Storageから読み出し、自己完結したスクリプトとして起動する。小さな静的コードでBlob Workerの起動能力を確認し、失敗時は静的コードのdata URLを使う。文書・MermaidソースはURLに入れない。
- `layout-worker.mjs`: 最大200ノードのJSON木専用配置。DOM・通信・保存を使用しない。Mermaidの座標計算や汎用構文を実装するものではない。
- `alternative-sw.js`／ビルド生成の`gate-assets.json`: 同一オリジンの静的JS/CSS資材を先に取得する。入力・結果を保存しない。今回の試作は比較用iframe等も含む資材一式を取得するため、製品の必要最小資材への分離は未実施。
- `alternative-check.mjs`: 状態・件数・時間・一致判定だけを`evidence/alternative-<engine>.json`へ保存する。長時間処理は有限6500msの故障注入。実行は必ず順次行う。
- `offline-worker-probe.mjs`: アプリを使わない最小例で、オンライン／オフライン時のBlob・data URL Worker起動を4ブラウザーで逐次比較する。結果は`evidence/offline-worker-probe-<engine>.json`に保存する。

`ALT_FILTER`でケースを限定でき、`EVIDENCE_SUFFIX`で別名の証跡へ保存できる。対象限定実行で省略したケースは`not-run`と記録する。最新の通し確認はフィルターなしの12ケース／ブラウザー。ALT-11はページ再読込を含むPWA診断、ALT-12は旧資材取得の遅着と新Worker破棄の競合検査である。失敗を除外して終了コードを0にはしない。

## 期限精度・オフライン模擬の追加検証

- `deadline.mjs`: 単調増加する時計による絶対期限を最大50ms周期で確認し、非同期応答の採用前にも確認する。5秒／15秒の予算は延長しない。隠れたタブ・OS停止等でJavaScript自体が実行されない状況の厳密な実時間保証ではない。
- `deadline.test.mjs`: タイマー配送を妨げる同期負荷の後でも期限後の応答を拒否すること、通知の一回性、キャンセルを検査する。
- `timing-probe.mjs`: Firefoxで長い単発タイマーのみ／短周期監視併用／Workerタイマー併用を一つずつ比較する。各条件を2回、同じ実機で他の試験を動かさずに実行する。
- `navigation-probe.mjs`: アプリ・Cache APIなしの固定SW応答を、通常・模擬オフライン・接続先停止・HTTPルート遮断で比較する。条件ごとに独立したローカルサーバーとコンテキストを作り、SWなしの対照も確認する。
- `origin-stop-check.mjs`: ビルド済み試作を独立したローカルサーバーで提供後、そのサーバーを停止して再読込・JSON再生成・入力非復元を確認する。サーバー停止は端末の通信断そのものとは区別する。
- `browser-runtime.mjs`: 通常は試作内の固定SDKを使う。`PW_BASELINE=1`時だけrootのSDK実体を使い、証跡にバージョンを記録する。今回のroot実体は1.62.1。将来rootが更新された場合、同じ比較環境にはならない。

追加検証コマンドの例（各々を完了させてから次へ進む）:

```powershell
node --test --test-reporter=./redacted-reporter.mjs deadline.test.mjs
$env:EVIDENCE_SUFFIX='-followup'
node alternative-check.mjs chrome edge firefox webkit
Remove-Item Env:EVIDENCE_SUFFIX
node navigation-probe.mjs webkit chrome firefox
node origin-stop-check.mjs
```

旧環境との比較は、`$env:PW_BASELINE='1'`を設定して対象のprobeまたは`alternative-check.mjs`を実行し、完了後に`Remove-Item Env:PW_BASELINE`で解除する。旧ブラウザーも保持する場合、インストール時に`PLAYWRIGHT_SKIP_BROWSER_GC=1`を使用する。新旧バージョンの証跡を上書きせず区別する。

この候補は独自のSVG表示方式であり、Mermaid標準レンダラーとの外観一致や、設計済みの拡大縮小・支援技術操作の完成を意味しない。ソース出力は従来のMermaidのまま維持する。

## 2026-10-26 製品採用前の追加候補

> 後続ユーザー承認により、独自SVG＋静的URL Workerを採用した。[採用決定と対象範囲](../../docs/json-adoption-decision.md)と[承認後の追加計画](../../docs/json-adoption-followup-plan.md)を優先する。macOS/iOSは今回対象外、本体統合はWindows向け残条件を満たすまで保留。

追加の[観点・ケース](../../docs/json-product-readiness-plan.md)、[要件対応表](../../docs/json-requirement-evidence-matrix.md)、[採用案](../../docs/json-product-adoption-proposal.md)、[今回の検証報告](../../docs/json-product-readiness-validation.md)、[実機手順](../../docs/json-device-validation-runbook.md)を参照する。本体統合は保留。従来4187のBlob/data方式を置き換えず、静的URL Workerを別ビルド・別ポート4188で検証する。

```powershell
npm ci --ignore-scripts
npm test
npm run build
npm run build:readiness
npm run check:readiness
node readiness-build.mjs --preview
```

別ターミナルから下記を順次実行する。4187を使用する検査では、先に既存の `npm run preview` も起動する。全コマンドを同時に走らせない。

```powershell
$env:EVIDENCE_SUFFIX='-final'
node readiness-check.mjs chrome edge firefox webkit
node alternative-check.mjs chrome edge firefox webkit
$env:GATE_FILTER='G01-browser|G02-|G03-'
node browser-check.mjs chrome edge firefox webkit
Remove-Item Env:GATE_FILTER, Env:EVIDENCE_SUFFIX
node selection-race-check.mjs chrome edge firefox webkit
node memory-readiness-check.mjs
```

各nodeコマンドの終了コードと証跡を確認してから次へ進む。エラーを後続コマンドの成功で上書きしない。フィルターで省略したケースは `not-run` となる。`readiness-*-final.json` と `selection-race-*.json` に入力本文を含めず件数・状態・照合判定を保存する。

`readiness-build.mjs` は検証ページ、ローカルfavicon、検証・配置Workerだけの資産一覧と世代付きSWを生成する。CSPはHTTPヘッダーで設定し、`worker-src 'self'`、Blob/data代替なし。追加候補にanydoc/PDFiumを含めない。生成物は `dist-readiness/` として除外する。

`readiness-sw.test.mjs` は保存拒否・容量不足・旧世代削除境界のNode検査。実機PWA更新を証明しない。`readiness-artifacts.test.mjs` はHTMLを含む配布資産の全量一致を検査する。`selection-race-check.mjs` は実Workerの正常応答を保留・重複配送し、現設定の判定前に確定できないことを検査する。逐次キューなので詳細要求同士の逆転を発生させた主張はしない。

`memory-readiness-check.mjs` はChromeで50 MiB単一入力、20件の完了済み表、200ノード図と図資産を順次含める追加診断。`memory-readiness-chrome.json` にUI/JSON Workerのヒープ・backing storage・保持件数を記録し、GC前後を分ける。真のピーク、OS/ネイティブ領域、図Workerの一時ピーク、20最大入力を同時受付した実機の保証にはならない。

`viewport-probe.mjs` はアプリなしの固定ページで動的リサイズと初期狭幅を対照測定する。Firefoxの未達を除外して成功終了にはしない。G03-03は独立contextの初期画面幅でレイアウトを検査し、動的リサイズ成功とは扱わない。`READINESS_FILTER` では追加候補の対象ケースを指定でき、省略はnot-runと記録する。

## 採用決定後の表示・更新・配布物検査

`diagram-view.mjs` は全体表示・倍率上下限・100%・図/ソース・検証済み本文保持の再試行を提供する。`readiness-policy.mjs` が配信CSPを共有する。`license-assets.mjs` は試作production依存の原文とNOTICE、版、取得元、integrityを `dist-readiness/licenses/` に生成する。ライセンスメタデータ未宣言はnullで明示し、原文を省略しない。原文・取得元・integrityの欠落はbuild失敗。収集成功とEPL等の配布条件の最終確認を混同しない。ライセンス文書は実行資産の先行Cacheには含めない。

ビルド・preview後に以下を一つずつ実行する。

```powershell
node adoption-check.mjs chrome edge
node update-check.mjs chrome edge
$env:MEMORY_PROFILE='adopted'
node memory-readiness-check.mjs
Remove-Item Env:MEMORY_PROFILE
$env:EVIDENCE_SUFFIX='-adopted'
node readiness-check.mjs chrome edge
Remove-Item Env:EVIDENCE_SUFFIX
```

AD-01～06は操作・全量保持・ソース出力可否、UP-01～04は二世代SW・複数タブ・配信404・容量不足/保存拒否の故障注入を検査する。UP検査はケース専用のlocalhostサーバーを起動・終了するためpreviewを必要としない。実OSインストール済みPWAや実ストレージ制限の証明にはしない。`adoption-*.json`、`update-*.json`、`readiness-*-adopted.json`を証跡として保存する。画像の文書領域はマスクする。

`MEMORY_PROFILE=adopted` はG02-M02として、合成PDFの実WASM変換後に50 MiB JSONを20件保持し、部分配列の20完了結果と最大図を含めて段階測定する。証跡は `memory-adopted-chrome.json`。JSON全体の上限を守り、巨大な兄弟値を部分出力へ混入させない条件で測る。解析と図は既存4187のハーネスを使用する。Fileのネイティブ領域・OS総量・WASM処理中の瞬間ピークは含まない。既定のG02-M01とは別条件であり、同じ結果として扱わない。

CIでは試作SDKのChromiumでAD/UPを逐次実行し、独立previewを開始・終了する。ローカルで同じCI経路を再現する場合は4188の手動previewを停止してから、対応Chromiumを準備し `node run-adoption-ci.mjs` を実行する。CIのChromiumをWindows Chrome/Edge実測の代用にはしない。

配信設定の比較には、previewを停止してから `$env:READINESS_CORS='1'` を設定し `node readiness-build.mjs --preview` を起動する。同じビルドで `Vary: Origin` の有無を比較できる。比較後は停止し環境変数を解除して通常起動へ戻す。キャッシュ照合やCSPを緩める回避策は使用しない。過去・比較・最終の証跡は `EVIDENCE_SUFFIX` で区別する。
