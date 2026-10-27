# JSON本体接続前の設計・共存検証結果

> 後続の配布調査・接続レビュー・Windows手順整備は[追加結果](json-followup-review-validation.md)を参照。以下のブラウザー検証は前回実績として保持し、手順整備を実機確認の成功に数えない。

2026-10-27。mainを`e927fe1`（PR #16取り込み済み）へfast-forward更新後、`codex/json-integration-readiness`で作業した。

## 判断

本体統合は保留。接続設計をレビュー可能な形へ具体化し、製品相当CSPの下で既存の両WASMと静的JSON/検証/配置Workerの同時動作を独立試作で確認した。macOS/iOSは引き続き対象外。実読み上げ、実200%ズーム、タッチ、インストール済みPWA、実容量/OSメモリ圧、対応ソースとWASM内包物の配布条件は未確認のまま残す。

まず防ぐべき致命的不具合は未検証出力、文字/辺の欠落、文書間混入、入力の送信・保存である。今回の対象検査では検出していない。ただし独立試作の成功を、本体UI・品質adapter・実PWAの受入成功にはしない。

## 成果

- [本体接続設計](json-product-connection-design.md): 既存ファイルとの対応、設定draft/確定/取消、解析世代と設定版、混在キュー、遅延応答、結果の所有権、図層と品質、コピー/DL/frontmatter、CSP/更新の責務を定義。
- [配布条件確認表](json-distribution-readiness.md): バンドルに対応する出典と原文を生成し、EPL対象、二者択一、宣言不明、WASM内包物ごとに次の条件を特定。
- `experiments/json-gates/integration-*`: 専用ビルド/専用オリジン4190。既存製品の逐次処理、WASM変換/検証、plain text導出、frontmatter関数を呼ぶ。製品`src/`、製品SW、製品CSP、root依存は変更しない。
- Worker自身のHTTPレスポンスにも共通CSPを付与し、`worker-src 'self'`、`script-src 'self' 'wasm-unsafe-eval'`で実行。動的Workerへのfallbackなし。
- 最終HTMLを含む実行資産9件、計16,630,464 bytesのSHA-256とCSP・SWテンプレートから一つの世代を生成。両WASM/全Workerを同じ静的allowlistへ含める。旧試作とCache prefixを分離。
- ビルド出典は122パッケージ/912モジュール/原文124ファイル。実WASMのhashを出典と対応付ける。WASM内包物全体のSBOMではない。
- `vercel.json`で新作業ブランチのGit自動デプロイも無効化。mainの設定は変更しない。
- 未追跡`docs/desktop.ini`は不要なWindows表示名設定のみだったため削除。アプリ用データではなく、Git差分には含まれない。

## テスト範囲と結果

[観点・ケース・前提](json-integration-readiness-plan.md)を先に定義した。新規contextと合成fixtureのみ使用し、Chrome→Edgeを逐次実行した。新しい独立試作の対象ケースをクロスブラウザー実施したもので、製品E2E全件の再実施ではない。CIの既存E2E選定規則は変更しない。

|検査|結果|示せる範囲|
|---|---|---|
|IC-01～07|Chrome 7/7、Edge 7/7成功、計14件|両WASM/静的Worker/CSP共存、全ラベル/辺一致、混在キュー中間失敗、取消後不採用、出力関数、温オフライン、資産失敗、負のCSP対照|
|IU-01～04|Chrome 4/4、Edge 4/4成功、計8件|WASM込み二世代更新、複数タブ、WASM実404/Cache例外時の旧版維持、更新後オフライン両WASM|
|既存UP-01～04回帰|Chrome 4/4成功|共通の更新検査をプロファイル化したことによる既存試作への回帰確認|
|IC-B01 / IC-L01|2件成功|実行資産の脱落/hash不一致、WASM出典不一致、原文欠落、lock不一致を検出する構造|
|既存試作単体|28件成功|解析・締切・Cache失敗境界の回帰|
|root単体/監査方針|63件/12件成功|既存機能とCI選定・監査の規則|
|型/build/製品配布物|成功|既存製品の型とビルド・必須資産|
|文書検査|38文書/128ローカルリンク、問題0件|設計・計画・報告の参照整合|

Chrome 155.0.8059.85、Edge 156.0.4314.42。Node 24.22.1、prototype Playwright 1.64.0、Vite 8.3.4。Windows上のインストール済みブラウザーを自動起動して検証した。画面読み上げやOSインストール済みPWAの確認ではない。

IC-03は実際の`processSequentially`に対する制御された遅延・Abort試験であり、製品clientのWorker破棄や設定世代の実装を検証したものではない。IC-04は生成本文と既存純粋関数の検査であり、OSクリップボード権限・実ファイルのダウンロード・製品ResultCardのイベント配線は未検証。IC-05は今回世代の温オフライン、IUは今回のWASM込み二世代更新の独立検証である。IU-03/04は新SWだけへのCache例外注入で、実OS容量枯渇や権限拒否を証明しない。インストール済み製品PWAの成功へ読み替えない。

## 失敗と再発防止

|事象|分類・原因|対処/検出の理由|
|---|---|---|
|依存とlockの照合が失敗|実装問題: Windowsパス表現の相違、内部の`type`だけのpackage.jsonをパッケージ境界と誤認|相対パスによるroot/prototype分類、name/versionを持つ境界まで探索。lock照合を緩めずIC-L01で検査|
|IC-04/05の初回失敗|テスト観点不足: 未公開ソースを空文字と誤認。生成本文の説明ヘッダーを見落とし|APIの`undefined`と画面textareaの空文字を区別。ヘッダーとMermaidソースの全量を比較して通しで再実行|
|実200%ズームのUI確認に到達できず|環境問題: Browser UseのChromeから127.0.0.1/localhost:4190が`ERR_CONNECTION_TIMED_OUT`。Playwright側の同ページ検証は成功|倍率は変更せず未確認を維持。専用タブ/サーバーを終了。環境差の原因は未確定であり、製品不具合とは断定しない|

Git管理外の`experiments/json-gates/evidence/integration-chrome.json`と`integration-edge.json`、`integration-update-chrome.json`と`integration-update-edge.json`へfixture ID・状態・版・数値/真偽値等のみ保存。本文、Pointer、ローカルパスは出力しない。失敗時もAssertionError等の型と段階に限定。CIではChromiumの同形式JSONを保存する。

## 残件と次の順序

1. 接続設計のレビュー。UI-26の実装/製品受入は本体統合の許可後に行う。
2. 対応ソース/告知とWASM内包物の配布条件確認。実配布版のビルド・原文との対応を完成させる。
3. 独立ビルドで成功した二世代更新・複数タブ・失敗時維持の条件を、統合許可後の製品SWで再検証する。製品の全資産への適用は未確認。
4. Windows実読み上げ・実200%ズーム・利用可能な実タッチ、OSインストール済みPWA更新/復帰、実容量不足/メモリ圧を証跡付きで確認。
5. Windows条件が揃ってから本体統合の実施判断。macOS/iOSの後日確認は今回の停止条件にしない。

本体統合・マージ・デプロイは実施しない。現在のPRは設計と独立検証のレビュー用とする。
