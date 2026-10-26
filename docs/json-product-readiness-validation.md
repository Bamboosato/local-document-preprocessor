# JSON製品採用前の残件検証・設計結果

> 後続決定（2026-10-26）: [採用決定と対象範囲](json-adoption-decision.md)により、方式の未決定状態は解消し、macOS/iOS関連はユーザーの後日確認へ分離した。以下は採用前に行った検証の履歴であり、当時の保留理由を保持する。今回のWindows向け判定は後続決定を優先する。

実施日: 2026-10-26 / 基準コミット: `48f975a`\
作業ブランチ: `codex/json-gates-product-readiness`。測定はこの基準に本PRの試作変更を加えた作業ツリーで実施。\
仕様: [要件v0.2追補1](local-document-preprocessor-json-requirements-v0.2.md)・[画面設計v0.2追補1](local-document-preprocessor-json-screen-design-v0.2.md)\
観点: [追加計画](json-product-readiness-plan.md) / [要件対応表](json-requirement-evidence-matrix.md) / [採用案](json-product-adoption-proposal.md) / [実機手順](json-device-validation-runbook.md)

## 判定と変更範囲

**本体統合は保留。Windowsの追加候補32件・既存図候補48件・G-01～03対象32件・応答競合4件は成功したが、方式採用・製品CSP・配布ライセンス・実Safari/PWA・実機負荷等の解除条件は残る。** Firefoxの動的viewport変更はアプリなしでも未達であり、初期狭幅表示の成功で置き換えて解消扱いにしない。

最優先の致命リスクは未検証本文の公開、値の無警告欠落、文書間混入、送信・永続化。重大リスクは中断・回復不能と更新時の起動不能。今回の合成fixture・対象操作では未検証出力や本文保存を検出していないが、未実装の製品JSON機能全体を安全・完成とした意味ではない。

変更は試作、試作専用CI検査、検証・設計文書、両仕様書の明示的な未採用案。`src/`、production SW、root依存・lockfile、既存の要件本文の採用条件は変えていない。旧iframe候補と過去の検証報告は保持した。マージ・デプロイは行わない。

## 基準・環境・引継ぎ

- 指示書の基準 `12396dca16f1008c66adde5775d6240abe43f6a3` 以後、今回の開始時点までのコミットは `48f975a`（指示書とREADMEの追加）だけ。試作・仕様・依存・CIを過去版へ戻していない。
- 開始時の作業ツリーはclean。既存 `experiments/json-gates/evidence/` の過去JSON・画像・ログが存在することを確認した。これらはGit管理外であり、レビューでは過去の報告を実施条件付きの証拠として扱う。過去48件を今回の件数へ加算していない。
- Windows `10.0.26200`、x64、OS報告RAM約31 GiB、Node `24.22.1`、npm `11.19.1`。headless・新規コンテキスト・合成fixtureのみ。各スクリプト、各ブラウザー、ビルド、計測を逐次実行した。
- rootは `npm ci`、試作は `npm ci --ignore-scripts` でクリーン取得。root実体のViteが開始時 `8.2.1` だったため、lockfileどおり `8.3.4` に揃えてから最終検証。初期ビルドを最終結果へ混ぜていない。
- rootのPlaywrightは `1.62.1`、試作は `1.64.0`。試作のMermaidは `12.2.0`、jsonc-parserは `3.3.1`。ViteとPDF対照経路はroot側を使い、試作の新旧SDKを混同しない。rootのundiciは既存lockfileの `7.30.1` を維持。
- Chrome `155.0.8059.85`、Edge `155.0.4283.62`、Playwright Firefox `157.0`、Playwright WebKit `27.2`。WebKitを実Safariの証拠としない。
- 最初の依存取得はネットワーク制限、最初のブラウザー接続は隔離された配信先へのタイムアウトで前提未達。許可された経路でクリーン取得し、ブラウザーと配信を同じ接続環境に揃えて再実行した。これらをアプリのゲート失敗には数えない。

## 今回の試作と検証

### 静的URL Workerと最小資産の別候補

`readiness.html` / `readiness.mjs` / `readiness-build.mjs` を追加し、4188の独立ビルドで `worker-src 'self'` の検証を行った。図コントローラーにWorkerローダーの注入点を追加し、既存Blob/data方式の既定動作を保持した。追加候補は静的URLだけで起動し、入力・ソースはpostMessageで渡す。新依存は追加していない。

全ラベル・全親子辺を照合し、能動SVG要素・入力由来画像・リンクがないことを検査。不正文法・モデル不一致・検証資産取得失敗は出力不可、図だけの再試行も不可。検証済み本文ありの描画失敗は出力許可を維持し、明示再試行とクリアを確認した。

|最終PR-01～08|描画中断ms / UIの100ms応答回数|初期化中断ms|取得済みオフライン再読込・新Worker|結果|
|---|---:|---:|---|---|
|Chrome|5,000.3 / 50|15,003.9|成功|8/8|
|Edge|5,000.1 / 50|15,000.3|成功|8/8|
|Firefox|5,000 / 50|15,000|成功|8/8|
|Playwright WebKit|5,004 / 46|15,015|成功|8/8|

合計32件成功。5秒／15秒の予算、描画4,900以上5,300未満、初期化14,900以上15,300未満という既存許容値を維持した。外部HTTP要求0、CSP違反0、動的URL Worker0、localStorage/sessionStorage/IndexedDB保存0、キャッシュはビルド一覧内の静的資産だけ。PR-06はSWを遮断した資産取得失敗であり、実通信断の冷状態は既存ALT-10と区別する。

|同じVite 8.3.4環境のビルド比較|先行取得ファイル数|先行取得bytes|範囲|
|---|---:|---:|---|
|既存比較用の `gate-assets.json`|120|10,923,931|JS/CSSのみ。HTML・manifest等は別|
|追加候補の `readiness-assets.json`|5|5,185,237|HTML・entry JS・検証Worker・配置Worker・静的favicon|

追加候補はSWとmanifestも含め配布7ファイル、計5,186,806 bytes。比較母集団は上表のとおり異なる。汎用Mermaidの検証バンドル約5.18 MBは依然大きく、フロー専用パーサーとして最小化できた主張はしない。製品の全資産サイズでもない。

### 世代更新と失敗制御

`readiness-sw-template.js` はHTML・JS・Worker・SWテンプレートとCSPから決めた世代のCacheへ全資産を取得する。install失敗は新世代だけ削除、旧世代維持。skipWaitingなし、activateで自prefixの旧Cacheだけ削除する。Cache拒否時のオンライン静的要求は継続し、入力・結果は保存しない。

SW-01～05はNodeで成功。旧世代・別用途Cache保持、容量不足、保存拒否、非GET/クエリ/他オリジン/未列挙URL、読出し拒否時のオンライン継続を確認した。PR-B01も成功し、配布HTML・JS・SVGとmanifestの集合、Workerの存在と世代を検査した。これらはブラウザーの実PWA更新・OS容量制限の実測ではない。

CSPを世代計算へ含めた最終調整後は、PR-05/08だけを4ブラウザーで追試し8件成功（`readiness-*-generation-check.json`）。残りはnot-runと記録し、前の32件へ加算していない。HTML・Worker・描画コードは同一で、世代とキャッシュ境界の影響を確認した。

### 既存試作・UI応答・メモリ

- `npm test`: 既存core/deadline23件＋SW5件＝28件成功。配布物PR-B01は別途1件成功。既存値・Pointer・境界・Markdown AST/plain textの検査を再利用した。
- 既存図候補ALT-01～12: 4ブラウザー各12件、計48件成功。従来Blob/data方式の全ラベル・辺、最大図、中断・再試行、旧世代排除、温/冷オフライン、再読込を回帰確認した。
- G01-browser、G02-00～03、G03-01～03: 4ブラウザー各8件、計32件成功。実PDF対照と取消・A/C回復、50 MiB単一入力、20回の解析追出し、適合復帰、非表示ラジオを確認。狭幅・文字拡大は独立した初期viewportであり、実ズーム・実端末ではない。
- G03-R01: 実Workerの正常生成応答を保留し、不適合対象→元対象へ操作後、旧応答の遅着・重複を注入。現詳細・生成が完了するまで確定不可、一覧表維持、確定時だけ旧結果破棄を4ブラウザーで確認。逐次キューのため詳細要求同士の逆転を発生させた証明ではない。
- G02-M01: Chromeで28サンプルを取得し成功。50 MiB単一入力、20件の完了済み表とplain text、最大図・図資産を順次含めた。保持解析セットは1以内。20最大入力の同時受付やWASM混在の総ピークは未測定。

|メモリ段階|明示GC|UI heap MiB|JSON Worker heap MiB|JSON Worker backing MiB|完了結果数|
|---|---|---:|---:|---:|---:|
|基準|あり|1.26|0.79|0.60|0|
|50 MiB解析直後|なし|1.28|0.86|100.60|0|
|50 MiB解析後|あり|1.29|0.83|50.60|0|
|最大入力を置換・解析追出し後|あり|1.29|0.88|0.60|0|
|20完了結果|あり|54.76|1.40|1.47|20|
|20結果＋200ノード図|なし|57.07|1.84|1.66|20|
|結果を明示置換・図クリア・解析追出し後|あり|1.47|1.10|0.60|0|

UI＋JSON Worker heapのサンプル最大は68.70 MiB。単一入力のbacking storageは別列であり、このheap値へ含めていない。測定はCDP Runtime.getHeapUsageの段階サンプリングで、OS常駐量、File/Blobのネイティブ領域、図Workerの一時ピーク、真の最大値を示さない。明示GCは診断用で、実端末での自然解放時間の保証ではない。完了結果の解放は明示的なfixture置換操作によるもので、アプリが結果を黙って削除する仕様ではない。

## 検出した問題と再発防止

|問題・分類|再現と利用者影響|対応・なぜ検出できたか／前の不足|
|---|---|---|
|HTMLのmanifest欠落：実装問題・成果物観点不足|新候補の初回Chromeオフライン再読込が失敗。ViteのHTML出力がgenerateBundle後で一覧から漏れた|HTMLのURLとソースを世代計算へ明示追加。PR-B01で配布全量と集合照合。JS/Workerだけの一覧検査では起動ページの欠落を検出できなかった|
|Originによるキャッシュ照合差：検証配信設定|HTML修正後もChrome/EdgeでSW制御下・文書completeなのにentry未読込。配信はVary: Origin付き|同一ビルドでCORSだけ無効化するとChromeが成功。その後4ブラウザー最終成功。要求条件とVaryの照合差という説明と整合するが、ブラウザー内部の詳細までは断定しない。READINESS_CORS=1で比較を再現可能とし、ヘッダー差をPR-08で検査。ignoreVaryで回避しない|
|faviconのCSP違反：検証ページ実装|FirefoxのPR-08でimg-src違反。blockedURIがfavicon.icoであることを区別して再現|明示した同一オリジンの静的faviconを配布しimg-src selfを設計に記載。入力由来画像を許可するSVG変更は行わず、能動要素禁止を維持。CSP違反件数を省略せず検出した|
|Firefoxの動的viewport待ち：自動化環境の未達|G03-03通しで待ち。単独実行でも画面サイズ変更段階で45秒のケース期限に到達|アプリなしの固定HTMLでも1280→320が10秒以内に完了せず、初期320は成功。Chrome対照は両方成功。ENV probeは計3成功・1失敗、終了コード1を維持。エンジン内部原因は未確定。レイアウトは独立contextで検査し、動的変更は未達として残す|

最初のFirefox通し実行は中断し、その未完了結果を成功件数へ含めていない。以前はpage.evaluateやサイズ変更等の未完了をケース全体で止める仕組みがなく、原因段階も不明だった。ケースの外側45秒期限と画像取得5秒期限、段階ログを追加して失敗を記録可能にした。これは製品の5秒／15秒期限を延ばす変更ではない。後の32件成功は「独立した初期画面幅でのレイアウト」に対象を明示した結果であり、ENV未達を相殺しない。

## root検証・監査・ライセンス

- root `npm run test:security`: 12件成功。
- root `npm run audit:security`: production・全依存とも指摘0。例外登録・閾値変更なし。
- root `npm run check`: 14ファイル63件成功、型検査・build・check:dist成功。
- 試作 `npm audit --json` と `npm audit --omit=dev --json`: それぞれ終了0、既知脆弱性0。
- root文書検査・製品E2Eの最終結果は、下記の最終確認欄へ記録する。
- CIに試作専用jobを追加し、固定lockfile取得、既存のfail-closed監査方針を再利用する試作監査、28単体・両候補ビルド・manifest検査を実行する。定期監査でも試作依存を確認する。CIのUbuntu検査はWindows実ブラウザー・実機検証の代用ではない。
- 試作lockfileのlicenseメタデータはMIT69、Apache-2.0 9、ISC33、BSD-3-Clause 6、MPL-2.0 OR Apache-2.0 1、EPL-2.0 1、Unlicense 1。これはSDK等も含む全依存のメタデータ集計で、配布バンドルの依存・原文NOTICEを確定したものではない。製品の配布ライセンス対応は残件。

## E2E範囲と証跡

試作は**対象ケースのクロスブラウザー**。旧iframeのG-04失敗全件は方式を変えていないため再実行しない。製品側は現行CIの範囲選択がexperimentsを未分類変更としてfullにするため、Chromium全件を1 worker・専用4191で選択した。全件を既定にしたのではなく、現行の範囲判定を適用した。

Git管理外 `experiments/json-gates/evidence/` の今回の最終証跡:

|ファイル|内容|
|---|---|
|readiness-*-final.json|静的URL候補32件と時間・保存・通信の照合|
|readiness-*-generation-check.json|CSPを世代計算へ追加した後のPR-05/08対象追試8件|
|alternative-*-readiness.json|既存図候補48件|
|*-readiness-final.json（readiness-で始まるものを除く）|G-01～03対象32件、省略G-04はnot-run|
|selection-race-*.json|応答遅着・重複4件|
|memory-readiness-chrome.json|最大単一入力・完了結果・最大図の28サンプル|
|viewport-chrome.json / viewport-firefox.json|アプリなしのサイズ変更・初期狭幅対照。Firefox resize失敗を保持|
|firefox-readiness-diagnostic.json / firefox-readiness-stage.json|元G03-03の単独未達と停止段階|

初期のreadiness-*.jsonは途中調査用で、最終結果と区別する。本文・ラベル・実行URLをログへ出さず、画像のデータ領域をマスクする。詳細な過去証跡がGit管理外である制約は継続するが、この報告と再実行ソースはコミットする。

未実施: macOS/iPhone Safari、実スクリーンリーダー、実200%ページズーム、タッチ・縦横切替、OSメモリ圧・停止復帰、インストール済みPWAの初回/更新/複数タブ/容量不足、製品JSON混在キューとコピー/DL/frontmatter。単体SW検査やPlaywright WebKitで代用しない。

## 統合保留の解除条件と次の具体作業

1. 両仕様書冒頭の未採用案と[方式比較](json-product-adoption-proposal.md)をレビューし、独自SVGの外観差・操作・互換性を採用するか確定する。採用前に既定仕様へ昇格させない。
2. 製品用CSP・配布資産・ライセンス原文/NOTICEを具体化し、実ホストのVary・MIME・キャッシュと静的Worker起動を検証する。追加ページのCSPを製品へ無条件に移植しない。
3. [実機手順](json-device-validation-runbook.md)のDEV-01～11で、最大入力と完了結果・図/WASM込みの実機負荷、支援技術、Safari/PWA・更新・回復を測る。Firefox動的リサイズは別途SDK/環境の最小再現で追跡し、現条件では対応済みにしない。
4. J-AC/UIの対応表に残る製品固有の状態・表示・出力・キュー回復を実装前設計へ落とし込む。すべてのG-01～04解除条件が揃うまでproductionへ接続しない。

### 最終確認

製品Chromium E2Eは専用ポート4191・1 workerで14件すべて成功（23.4秒）。PDF・PPTX・XLSX・DOCX、選択範囲、品質表示、狭幅とPWA静的資産の既存回帰を確認した。これは未統合の製品JSON機能の受入完了を意味しない。

文書検査は31文書・97ローカルリンク、問題0。試作でも既存のfail-closed監査スクリプトを再利用した `npm run audit:security` が成功し、production・全依存とも指摘0。

PRのCI結果はレビュー用PRのチェック欄を参照する。ローカル結果とCIの実行環境を区別する。
