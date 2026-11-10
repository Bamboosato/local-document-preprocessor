# MermaidのELK非同梱構成：隔離PoCと判断

> 2026-11-10 現行状況: [本体12.3.0への切替と回帰](mermaid-tiny-12.3-product-cutover.md)をローカル完了した。旧ELK資産の不在を維持し、既定の67対象監査も0件。以下の12.2.0保留・本体未切替は各追補時点の履歴として保持する。公開・実配信・実機の受入は別途。

> 12.3.0候補の追補: [修正版候補の照合](mermaid-tiny-12.3-review.md)で、公開bytes再生成一致、69原文、補足込み67対象の監査0、隔離PoC8工程成功を確認し、12.3.0を置換先として採用推奨とした。ローカル本体の12.2.0はまだ切り替えておらず、以下の旧候補の不合格と公開保留を取り消すものではない。

> 最新追補: Tinyの本体接続と機能回帰は [本体移行報告](mermaid-tiny-product-migration.md)の範囲で成功した。一方、通常のnpm監査では見えない内包依存を別途照合し、DOMPurify/js-yamlの対象版を検出したため、**固定12.2.0の配布採用は保留**。以下のPoC方式採用推奨を公開承認・監査合格と読まない。

2026-11-06。基点 main `37ec3d3b09624a7efe53e8faa3ba4fa2560bac27`。総合判定は**Tiny 12.2.0の方式採用を推奨、本体への段階的接続をローカル実施**。PoCの採否を受けたユーザー指示により本体の描画・構文検証と原文導線を接続した。最新の変更・回帰・残件は [本体移行報告](mermaid-tiny-product-migration.md)を正とする。以下のPoC記録と過去の未確認はその時点の履歴。正式公開・実配信・実機の判定は別途行う。PR #38は履歴として保持する。

## 今回の採否判断と判断根拠

**隔離PoCの結果に基づき、Tinyを採用して本体移行へ進むことを推奨する**。旧材料を参照しない直接取得で配布材料を再現でき、既存の提供物74資産と全件一致した。ELKの過去生成器の追跡へ戻ることを今後の必須作業にしない。[採否と最新検証の記録](evidence/mermaid-tiny-adoption-assessment.json)を参照。以下は添付指示書のACに対応した整理であり、PoCの方式判断と本体接続・公開承認を分ける。

|受入項目|今回までの証拠|判断・未完|
|---|---|---|
|AC-01 固定・再現|固定npm・lock・署名付き来歴、上流再生成と公開bundleの全bytes一致、クリーン直接取得68件・249ファイル照合|PoC範囲で確認済み。調査tmpを入力にしない取得計画・手順とhashを管理対象にした|
|AC-02 ラベル・親子関係|4fixtureの全ラベル・辺、escaped pointerの選択図、配列要素選択、数値字句、図/ソース・コピー・Markdown保存を確認|今回の対象ケースは確認済み。全データ・全環境への一般化はせず、本体接続後は既存fixtureの回帰を実施|
|AC-03 上限と未検証出力防止|199/200/201ノード、実生成51,199/51,200/51,201 bytesをWorker検証後に表示判定|代表境界を確認。本体の失敗UIと出力制御は接続後に検証|
|AC-04 非同期・取消|旧成功/失敗、Worker起動失敗・不正応答・無応答、選択変更・取消・再試行を確認|PoCの対象ケースは確認済み。Workerを期限内に解放し未検証出力を禁止。本体キューとの接続は未検証|
|AC-05 安全性|CSP下でHTML/命令相当/外部参照文字、SVGのイベント・script・foreignObject・外部style除去を検証|対象ケース確認済み。観測した要求は同一オリジン、Web Storage/IndexedDBは空。全攻撃パターンや本体回帰の保証ではない|
|AC-06 ELK非配布|公開Tinyと再生成物が全bytes一致し、elkjs出力寄与なし。ELK名の元ファイルの30 bytesは空の初期化枠|固定Tinyファイルを確認。本体の旧Worker・copy資産・PWA一覧からの除去は本体移行時に判定|
|AC-07 条件・原文|63組＋workspace原文とソース由来候補、表示、パッチ、生成器参考原文をクリーン材料から生成しオフライン閲覧・hash照合|PoCの提供形態を確認済み。本体へ同じ形態を接続し、製品側の告知・版・到達性を再確認する|
|AC-08 同一オリジン・オフライン|HTML・実行JS・Workerが異なるA/B、更新失敗と旧タブ維持、旧タブ終了後のB有効化、Bオフライン図と原文hashを確認|PoCの異内容二世代を確認。本体SW、容量不足、実配信・インストール済みPWA・実機は別途|

合格した確認を繰り返すことを残件にはしない。PoC採否に残っていた材料管理と提供形態はこの段階で閉じた。その後の本体接続はユーザー指示により実施し、結果を [本体移行報告](mermaid-tiny-product-migration.md)へ分けた。Windows実機はユーザー別途、macOS/iOSは対象外。PoCで未解消の致命・重大な問題は当時の対象試験では確認していないが、実機への一般化はしない。

## 選択・出力・Worker障害・安全性・異内容世代の対象検証

[実行結果とソースhash](evidence/mermaid-tiny-acceptance-validation.json)に、Node 24.22.1、Windows、Chrome headless 156.0.8078.81の対象試験を記録した。`run-acceptance.mjs` でPoCのbuild・資料生成・既存境界試験・UI/安全性試験・異内容世代試験・原文閲覧・更新回復を直列実行し、7工程すべて成功。本体コードと本番lockは変更せず、本体E2E全件は実施していない。

- **選択と出力:** escaped pointer `/a~1b` の全ラベル・辺を図と照合し、`9007199254740993` と `-0` をソースへ保持。図/ソースを実際のボタンで切り替え、コピー先へ渡す本文と実際のMarkdown downloadを確認。配列 `/rows/1` から他の行・ルートのデータが混入しないこと、不正なscalar選択や設定変更で出力が無効になることを確認した。クリップボードAPIは試験用代替で成功と拒否を再現し、OS実クリップボードとの接続は未検証。ダウンロードはブラウザーが生成したファイル本文を照合した。
- **Workerと状態:** 起動時例外、不正な成功応答、無応答を実Workerの置換スクリプトで注入。失敗時のコピー/保存は無効、本文・図は未出力で、Workerは解放された。無応答試験ではテスト用設定で期限を300 msとし、既定値は15秒。取消・選択変更でもWorkerを終了し、正常Workerへ戻した後の再試行が成功。表示用Mermaidの強制中断や全端末での実行時間を保証する試験ではない。
- **安全性:** script/img/event handler、init・click相当の文字列をJSON値として処理し、危険なSVG要素・属性を含まないことを確認。サニタイザーへ合成SVGを直接与えた場合もscript・foreignObject・外部image・javascript URL・外部CSS参照が残らないことを確認。対象試験中のページ・Workerの要求に別オリジンは観測されず、専用contextのlocalStorage/sessionStorage/IndexedDBは空だった。全API経路の監査や全攻撃入力の網羅ではない。
- **異なるPWA世代:** A/BはHTML、実行JS、Workerのbytesとhashが異なり、各世代へ同じ固定原文・表示・パッチも含めた78資産を配置。まず欠落資産を持つ更新の失敗を再現してAの継続を確認し、次にBが待機中の旧タブでAの再読込とWorker hash一致を確認。旧タブを閉じた後、Bが有効化されること、ネットワーク遮断後もBの図を描画し、原文68点と表示・生成器参考・パッチが全件hash一致することを確認した。ライセンス原文自体の内容変更、容量不足や古いキャッシュ削除、本体SWの全ポリシーはこの試験の対象外。

PoCを今回の操作に対応させるため、選択入力・図/ソース・コピー/保存・取消UIと、Worker期限・不正応答拒否・取消時解放を追加した。これまでのPoCにはWorker無応答時の終了保証がなく、明示的な期限・終了条件で改善した。本体で同じ挙動を提供済みとは扱わない。

## 要件見直し案と検証観点

JSONの厳密解析、入力順・数値字句・選択範囲、全ラベル・辺、flowchart TD、図/ソース、コピー/保存、同一オリジン、非送信・非永続化、安全なSVGと状態管理は維持。ELK固有配置、SVGバイト一致、座標一致、全図種は要件としない。提案であり既存の公開条件は変更しない。

最優先は未検証本文の出力と文書間混入。機能は入力・親子辺・構文検証、非機能はCSP・配布・オフライン、データはUnicode・境界・攻撃文字、UIは表示・取消・復帰を対象とする。正常・異常・境界・旧応答の状態遷移を区分し、今回の試行で未実施の観点は下記に残す。

## 調査・検証の経緯（初期の状態を含む）

以下は作業の経緯で、各試行時点の未確認事項を含む。現行の判定と残件は冒頭のAC表と末尾の移行計画を参照。

|項目|結果・限界|
|---|---|
|候補|公式 `@mermaid-js/tiny@12.2.0`、npm integrity は lock に記録。MIT のパッケージ申告。依存欄は空で、単一のブラウザー向け配布物。README はCDN用途とし直接npm組込みを推奨していない|
|実行|Node 24.22.1、npm 11.19.1、Windows上のChrome headless。隔離ディレクトリーで `npm ci --ignore-scripts`、`node build.mjs`、`node check.mjs`。buildにはルートに固定済みのViteが必要|
|描画|既存JSON生成器とサニタイザーを再利用し、後続の4fixtureで全ラベル・辺を照合。選択対象と幅広いデータ・UIの受入不足は冒頭表に記載|
|Worker|同一配布物の `importScripts` とAPIロードは成功。単純な手書き `A["x"] --> B["y"]` はDOMなしで `Es.sanitize is not a function` に失敗したが、既存JSON生成器が出力した一例は解析に成功。両者を区別する必要がある。任意Mermaidへの対応は要求しない|
|配信|CSPを付けたローカルHTTPで描画し、観察された取得先は同一オリジンのHTML、生成JS、tiny.js、worker.js。ネットワーク全般の不在やPWA世代更新・オフラインは未証明|
|ELK|配布JSは SHA-256 `ea0cdf04eb31907eb20d956a34fe300095365c876887b54ffa29f1f847f56d00`。単純な `elkjs` 等の文字列検索は一致なし。ただし圧縮済み単一JS内部とsource mapの対応・依存グラフは未検証。ELK不在と判定しない|
|依存監査|隔離依存について npm audit は0件。ただし同梱されたコードの権利表示・原文と公開ソースの対応は未確定。MIT表記だけで条件充足とはしない|

### 追加切り分け

Tinyの圧縮bundleにはDOMPurify `3.4.12` の初期化処理があり、document/Element不在時にsanitizeを持たない状態を返す。手書き構文はこの関数を呼ぶ経路で失敗した。通常版Mermaid 12.2.0も同条件・手書き構文では同様に失敗したが、製品JSON生成器の出力ではWorkerで成功。現行製品の対象E2E `JC-03` もWindows上のChrome headlessで1件成功。比較Workerは単独の診断用であり製品Workerそのものの完全再現ではない。

PoCをWorkerの検証成功後に描画する順へ変更。生成器由来1 fixtureについてWorker解析とSVG、構文不正の拒否、描画中clear後の旧応答破棄を確認した。従来の「TinyはWorkerで利用不能」という解釈は撤回し、生成構文・境界ごとの追加検証を必要とする。`node build.mjs` と `node check.mjs` を順次実行し成功。これらは機能・異常・状態遷移の代表例であり包括的受入試験ではない。

さらに4件の合成入力（object、array、単一数値、危険文字・改行）を実際の生成器・Worker・描画へ通し、各ノードIDに対する全ラベルの文字列一致と、親ID・子IDの全辺および余分な辺がないことを照合した。各図のSVGにscript、foreignObject、image、onerror属性がないことも確認。JSON生成のみの境界試験では199・200ノードは成功、201ノードは拒否した。200ノードの視認性、全攻撃パターンは未実施。これらの4件についてヘッドレスChromeで成功したことを全受入条件の成功とはしない。

追加検証: 200ノードの日本語合成JSONから51,199・51,200・51,201 bytesのMermaidソースを生成し、3件ともWorker検証を通した。前2件はSVGを描画し、超過1件は検証済みソースの保持と描画拒否を確認した。古い図が残ると誤認を招くため、PoCでは新しい描画要求の開始時に表示を消去する。合成配列200ノードの生成・Worker検証・描画は同環境で669・700 msの例を観測。端末性能やUI応答・視認性、すべての通信経路への一般化はしない。

PoC専用の固定資産のみをキャッシュするService Workerを生成し、Chromeでインストール・制御後にネットワークを遮断して再読込、Worker検証および図表示に成功。キャッシュはHTML・描画コード・Tiny・Workerの4件。描画後、全キャッシュ本文に一意な合成入力値がないことも確認した。最初に固定文字列 `SYNTHETIC` を使った検査は既存資産内の同文字列に一致して誤検知したため、実行ごとに異なる合成値に変えて再実行した。検出原因はテストデータの衝突であり、入力漏れとは断定しない。PoCの一世代の確認であり、本体PWAの更新・旧世代・障害回復や実配信の証明ではない。

更新・回復の追加試験: 初版のPoCは固定キャッシュ名と即時 `skipWaiting` を使っていたため、成功更新時の世代混在リスクを防ぐ設計ではなかった。資産内容から生成する世代別キャッシュ名を採用し、新Service Workerの即時有効化を行わない形へ変更。新規資産の404で更新のinstallが失敗した場合、元のWorkerオブジェクトが制御し続けた。その後、合成した新世代のinstallを成功させ、旧タブが元Workerに制御されたまま新Workerが待機し、オフラインで描画できることを確認した。今回の新旧世代の資産内容自体は同一であり、異なる内容の新旧バージョン間の完全な移行、旧タブ終了後の新世代有効化、キャッシュ削除・容量枯渇・本体PWAは未検証。確認結果を実配信の証拠とはしない。

[公式Tinyのリリース](https://github.com/mermaid-js/mermaid/releases/tag/%40mermaid-js%2Ftiny%4012.2.0)は `1fb7869` を示す。[公式文書](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/docs/config/usage.md)はTinyにELKを含めないと説明するが、更新される説明であり固定npm bundleの内部全体の証明にはしない。

`npm audit signatures --json` は無効・欠落とも0件。公開npmの署名付き来歴は対象 `@mermaid-js/tiny@12.2.0` のtarball SHA-512をlockのintegrityと同一に示し、解決した上流commit `1fb7869866dd619168d840291c9c54b4f129758b` と[公開workflowのrun](https://github.com/mermaid-js/mermaid/actions/runs/38369814286)を記録する。runは成功し、当時の定義はfrozen lockfileでの導入を指定。これはnpm tarballと公開元commitの署名付き対応の根拠であり、実bundleの全依存一覧・ライセンス充足や再ビルド一致を保証しない。

固定commit `1fb7869866dd619168d840291c9c54b4f129758b` の[ビルド定義](https://github.com/mermaid-js/mermaid/blob/1fb7869866dd619168d840291c9c54b4f129758b/.esbuild/build.ts)では `includeLargeFeatures: false` のtiny生成物を `packages/tiny/dist/mermaid.tiny.js` へ移動し、[設定](https://github.com/mermaid-js/mermaid/blob/1fb7869866dd619168d840291c9c54b4f129758b/.esbuild/util.ts)ではその値をビルド時定数へ反映している。公開npmの実bundleとこのビルドの完全対応、実際の依存一覧・原文の網羅は未確認。bundle中にはDOMPurify 3.4.12の識別情報があり、Tiny自身の `dependencies: {}` だけでは内包物がないと判断できない。

上記固定commitの[レイアウト登録元](https://github.com/mermaid-js/mermaid/blob/1fb7869866dd619168d840291c9c54b4f129758b/packages/mermaid/src/rendering-util/render.ts)は、`includeLargeFeatures` がfalseの場合にELKローダー登録を省く。固定source tarの調査記録SHA-256は `cc9efe255ea61aa2e991ea4c9c0c49f286b3f81e590fa58d04750723da758476`。ただしソースにはELK関連の静的importもあるため、分岐を確認しただけで配布bundleから全コードが除かれた証明にはならない。公開Tiny bundle中に `elkjs`・`org.eclipse.elk`・`elk.stress` などの代表文字列は見つからず、これは補助的な証拠にとどまる。

配布JS末尾のBundled license informationはDOMPurify 3.4.12（Apache-2.0 / MPL-2.0）とlodash-es custom build 4.18.1（MIT、Underscore由来表示を含む）を示す。元表示を保存し、選択した条件に応じた原文・著作権表示・NOTICE/変更表示等を個別確認する必要がある。このヘッダーだけで他の内包依存の不在や義務の完了は確定しない。Tiny npm原文MITと合わせた第三者表示・原文の配置は本体移行時の必須作業。

固定npm tarballから原文をローカル照合した結果、DOMPurify 3.4.12のApache原文 SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`、MPL原文 `fab3dd6bdab226f1c08630b1dd917e11fcb4ec5e1e020e2c16f83a0a13863e85`、lodash-es 4.18.1のMIT原文 `f71e8ed126b46346494aad5486874cd8f0aafe95092ed67d2e3cb6110f939abc` を確認。原文の取得は提供・表示義務の履行を意味しない。tarballはローカル調査用で公開・添付しない。

追加の状態遷移検証で、旧世代のWorkerが失敗した場合、その例外が呼び出し元に届くPoC上の欠陥を確認した。原因は世代の比較を描画成功後にしか行わなかった実装上の問題で、通常の成功応答だけを対象にした観点では検出できなかった。隔離PoCの例外処理に世代確認を追加し、テスト用Workerで応答を保留してclear後に成功・失敗を返す両ケースを検証した。いずれも旧応答を破棄し、不正JSONの後に正常入力を再試行して描画できた。本体実装の修正・実機での保証を意味しない。

### Tiny公開bundleの再生成と入力照合

固定commitのソースtarを隔離領域へ取得し、上流指定pnpm 10.30.3、Node 24.22.1、固定lock、`--ignore-scripts` で依存を導入した後、上流の `build:viz` を実行した。上流の入れ子の `pnpm` 呼び出しは環境の11.25.0で動いた点と、ソースtar中のリンク1件を展開しなかった点は公開ビルドとの環境差である。それでもTiny出力は公開npmの実ファイル2,811,424 bytesと**全bytes一致**し、双方SHA-256 `ea0cdf04eb31907eb20d956a34fe300095365c876887b54ffa29f1f847f56d00` だった。署名付き来歴と合わせ、出力の内部対応を調べる強い根拠となるが、公開ビルドが同じ環境で実行された証明ではない。

esbuildの出力metafileには解決した2,505入力のうち1,161の出力寄与があり、`elkjs@0.9.3` は解決入力に存在するが、**Tinyの出力寄与は0件**。Mermaid側の `layout-algorithms/elk/algorithms.ts` は30 bytesと記録されるため、別途外部source map付きで再ビルドし、JSが公開版と再び全bytes一致することを確認した。対応する4区間は元ファイルの先頭行に対応し、出力は空のモジュール初期化 `var ete=w(()=>{"use strict"});` の30 bytesだった。ELKアルゴリズム名や実装を含むとは確認されなかった。このsource mapは再ビルド時に生成したもので、公開npmに同梱されていたものではない。出力内に関数を残さない一方、メタデータ上のELK関連ファイルが完全に消えていると表現しない。

固定版の再生成物については、解決されたELK実装の出力寄与なし・当該30 bytesが空の枠であることを確認した。これにより**公開Tinyファイル単体にELK実装を含まない判断の根拠は大きく改善**した。ただし現行製品Workerや旧資産、PWA取得対象にELKが残らない証明は別途必要であり、PoCだけで製品のELK提供条件を適用外とはしない。

[依存照合記録](evidence/mermaid-tiny-rebuild-attribution.json)は公開ファイルと再生成ファイルのhash、metafile hash、出力に寄与したpnpmパッケージ56組（同名別版を別組）を記録する。`node_modules` 経由の出力寄与はこの記録に分類できた。これは出力の寄与一覧であり、解決しただけの依存やworkspace内で生成されたparser等を全て第三者パッケージに変換したSBOMではない。各原文・権利表示・ライセンス条件の照合は次作業とする。分析は `experiments/mermaid-no-elk/analyze-meta.mjs`、空枠の確認は `analyze-elk-map.py` で再実行可能。大きい元metafile・source map・生成物はローカルの調査領域に保持し、公開・添付しない。

### 生成parserを含めたライセンス候補照合

Tinyはworkspaceの `@mermaid-js/parser@2.0.1` の生成済み32出力を取り込むため、Tiny側metafileだけの56組ではparser内部が分からない。固定ソース・固定lockのparserをメタデータ付きで再生成し、既存の32 JS出力全てとbytes一致を確認した。Tinyが利用するparser出力を遡ると7組が追加され、Tinyからの直接寄与と合わせ**63パッケージ・版**となった。Mermaid 12.2.0とparser 2.0.1自体のMIT原文も別途確認した。[候補台帳](evidence/mermaid-tiny-license-inventory.json)に名前・版・申告・原文候補のhash・寄与段階・パッチの有無を記録する。分析用 `inventory-bundle-licenses.mjs` はTinyとparser出力のhashを照合し、未分類の外部依存を拒否する。同じ入力から2回作成した台帳のbytesは一致した。

63組のmanifest表記はMIT 20、ISC 31、Apache-2.0 5、BSD-3-Clause 5、DOMPurifyの二重ライセンス1、申告なし1。申告なしの `khroma@2.1.0` は同梱 `license` 原文がMITであることを確認。`fastdom@1.0.12` は独立LICENSEファイルがないが、固定パッケージのREADME内にMIT原文と権利表示がある。両方を欠落扱いや申告済みと誤記せず、台帳に根拠ファイルのhashを残した。63組すべてにルート原文または該当READMEの候補があるが、原文の配置・本文内告知・追加条件の確認完了とは区別する。

`fastdom@1.0.12` と `roughjs@4.6.6` は上流パッチ適用済み。前者はES module化した `fastdom.js` と `extensions/fastdom-promised.js` が出力に寄与し、後者のパッチは型定義が対象で当該型定義はJS出力に寄与しない。元権利表示を保持し、変更したファイルの対応・適用条件を個別確認する。parserを含めてもバイナリ同梱物や原文以外の通知が絶対に存在しないという保証ではなく、**製品用の原文・表示の準備と条件審査は未完了**。PoCで確認しただけで製品への同梱や配布承認とはしない。

### 原文・表示の隔離準備とオフライン検証

63パッケージ・版とworkspaceのMermaid/parserを合わせた65組について、台帳に記録された原文候補66ファイルをハッシュ・サイズ照合後に隔離PoCの `dist/licenses/` に配置し、一覧から開けるようにした。DOMPurifyは既存のApache-2.0選択方針を候補に明記し、Apache・MPLの両原文を保持する。fastdomはREADMEにあるMIT原文・権利表示をREADMEごと保持し、2組の上流パッチありを一覧に表示する。既存のtiny.js内のBundled license informationもそのまま保持する。

PoC用Service Workerには一覧・manifest・原文を加えた72資産を指定。ローカルChromeでは初回取得後にネットワークを遮断し、一覧からのリンク66件・各応答のSHA-256をすべて照合し、同一オリジン以外の要求は観測しなかった。原文配置後の更新失敗・新世代待機・旧世代オフライン図表示も順次確認した。これらは一時的なPoC静的資産の確認で、本体PWA・実配信・実機の確認ではない。上流のローカル入力が存在しない場合に配置を中止し、原文ディレクトリーを作成しない異常系も確認した。

**未完了:** 63組の原文・表示をPoCに配置したこと自体では、各依存のNOTICE・ファイル内権利表示・パッチ変更に関する条件を満たすと確定しない。第三者の再頒布条件、workspace内のさらに内包された要素、原文の範囲を個別に確認し、製品版としての案内・到達性・保持方法を判断する。上記66点や生成された一覧は正式な配布物ではなく、外部公開・アーカイブ添付はしていない。

### NOTICE・権利表示・上流パッチの照合

固定bundleとparserの2段階metafileに基づき、63組の寄与ファイル778件を重複排除して走査した。著作権・SPDX・`@license` の手掛かりは9組100ファイルにあり、各ファイルの相対名・hash・一致件数を[走査記録](evidence/mermaid-tiny-notice-audit.json)に保存した。各パッケージ内のNOTICE・COPYRIGHT・LICENSE・third-party相当の名前も再帰検索し、NOTICE/third-party名の独立ファイルは見つからなかった。DOMPurifyの `src/license_header` は別途見つかっている。シンボリックリンク・node_modules・Git内部は探索せず、名称に依存する検索のため、NOTICEが絶対に存在しないことの証明ではない。

9組の手掛かりを確認すると、bundle末尾に保存されているDOMPurify・lodash以外にも、Langium・Chevrotain Allstar・Marked・Microsoft製4組のファイルに権利表示がある。例えばMarkedの寄与ファイルには `Christopher Jeffrey` の2011–2025年表示があり、原文中の年・権利者の表記と同一ではない。bundle末尾だけに依存せず、検出したコメントブロックをファイルhashを確認してパッケージ・版ごとに保持する候補 `source-notices.txt` をPoCに追加した。PoCの一覧から原文66点と表示候補のハッシュを、オフラインで確認した。抽出は検出語を含むコメントが対象であり、検出語のない告知や意味上必要な表示を網羅すると断定しない。

ライセンス条件の整理: MIT・ISCは原文に指定された著作権表示・許諾表示を保持し、BSD-3-Clauseは原文が指定する再頒布時の表示・条件を確認する。Apache-2.0対象のChevrotain関連5組と、Apache-2.0選択案のDOMPurifyは、原文の提供、該当する著作権等の表示、変更ファイルの表示、提供元に存在する場合のNOTICEを個別に確認する。[Apache-2.0原文](https://www.apache.org/licenses/LICENSE-2.0) 4条を参照。条件の適用は実際に提供するファイルと改変の有無に依存するため、機械的に完了とはしない。

上流パッチはfastdomとroughjsの2組。fastdomの `fastdom.js` と `extensions/fastdom-promised.js` はES module形式への変更後、Tiny出力に寄与する。fastdomのMIT原文・権利表示が含まれるREADMEと、変更の根拠を保持する案とする。roughjsの上流パッチは型定義のみで、その型定義のJS出力寄与は確認されていない。改変を見落とさないよう、製品移行時もbundle・パッチ・表示の対応を再確認する。

[依存別条件台帳](evidence/mermaid-tiny-conditions-matrix.json)には63組それぞれの宣言、原文候補、表示の手掛かり、パッチと次に必要な確認を記録し、後続作業で全行の原文準備確認を記録した。製品提供・最終版の条件照合は引き続き保留。workspace側の追加走査は次節に記載する。PoCに置いた候補・走査結果は法的な充足判定ではなく、正式な製品版・配布先の確認は未実施。

### Mermaid・parserのworkspace由来表示

Tiny出力に寄与したMermaid側452入力と、parser出力に寄与した65入力を追加調査した。[照合記録](evidence/mermaid-tiny-workspace-source-proof.json)では、上流source tarに含まれるMermaid 452入力・parser 62入力がローカルの対応ファイルとbytes一致。parser残り3入力はLangiumの生成ファイルで、source tarに存在せず生成後のhashのみ記録した。metafileのクエリー付き入力は変換元の実ファイルとして照合し、変換後の仮想データと元ファイルが同一とは扱わない。

当初は上記517入力を `copyright`・`SPDX-License-Identifier`・`@license` だけで走査し該当なしと記録したが、これは検索観点不足だった。後続の `(c)`・MIT license・由来URL等を含む走査でMermaid側12入力に表示・参照を検出したため、旧結果を訂正し、[走査記録](evidence/mermaid-tiny-workspace-notice-audit.json)を更新した。parser側65入力では拡張後も該当なし。parserパッケージのLICENSEとMermaidのリポジトリールートLICENSEは原文候補として保持済み。名称による確認では独立NOTICEは見つからなかったが、網羅性の証明ではない。

拡張走査で得られたworkspace由来表示はPoCの `source-notices.txt` に追加し、元ファイルhashを照合して保持した。3生成ファイルと生成テンプレートの扱い、ソース内の追加由来は以下を参照。根拠のない「全条件充足」への変更は行わない。

### parser生成物の由来と再現

固定commitの `.build/generateLangium.ts` は `langium-cli` の `generate` に `packages/parser/langium-config.json` を渡す。設定に15言語があり、importされる共通・補助文法を含む18文法ファイルと設定が固定source tarの対応bytesと一致した。[生成元記録](evidence/mermaid-tiny-parser-lineage.json)に各hashを記録する。生成された `ast.ts`・`grammar.ts`・`module.ts` のヘッダーは `langium-cli 4.4.0` を示す。

上流固定lockから導入したLangium CLI 4.4.0（MIT）で同じgenerate処理を隔離環境で再実行し、3ファイルは実行前後のSHA-256が全件一致した。上流のNode指定は24.16.0、今回のWindows実行は24.22.1であり、上流公開時の機械環境そのものの復元ではない。生成時には複数代入に関するLangium警告が出たが処理は成功した。上流公開版Tinyとの全bytes一致、parserの中間出力一致、固定文法・再生成結果を併せた対応根拠であり、全生成コードの権利関係を自動確定したものではない。Langium CLIはビルド用でありTinyへのコード寄与が確認された `langium@4.4.0` と混同しない。生成テンプレートのライセンス原文・権利表示を参考情報として保持し、提供要否は完成物との関係を確認して判断する。

### 上流パッチと権利表示の提供方法案

PoCの第三者ライセンス一覧に、上流commitに含まれた `fastdom.patch` と `roughjs.patch` を個別のテキストとして追加した。上流ファイルの固定SHA-256（それぞれ `10bad52c2ff6c742f43492850f2a5a74e9d70a33f42a442cdbda4e174356aa87`、`3543d47108cb41b68ec6a671c0e1f9d0cfe2ce524fea5b0992511ae84c3c6b64`）を検証し、変更対象とTinyへの寄与の違いを一覧で説明する。これは上流変更を利用者が確認できるようにする準備案で、MITが一般にパッチ自体の配布を要求するという主張ではない。原文・ファイル内表示・パッチ2点を同一オリジンでオフライン取得しhash一致を確認した。

本体移行の具体案は次のとおり。現行UIの `第三者ライセンス` 導線から、固定したTinyと依存版、該当する原文・権利表示・DOMPurifyの選択条件、上流パッチと変更対象へ到達できる一覧を作る。原文・表示・必要に応じたパッチの個別ファイルを生成物の `licenses/` 以下に置き、現行manifest生成が他の静的資産と同様に各hashを記録してPWA取得対象とする。材料は製品のクリーンビルドで版とhashを確認できる形で管理し、今回のGit管理外の `tmp` 領域に依存しない。版の更新時はbundle・内包一覧・原文・表示・パッチを同じ世代として再固定し、不一致や欠落時はビルドを失敗させる。ソース提供が必要と確定した別依存については、版別の提供先と案内を別に検証する。

これは設計・PoCの確認であり、製品コードやライセンスページへの採用、上流パッチ提供が各ライセンスの法的必要条件であるとの判断、配布承認を意味しない。検出語で拾えない権利表示、生成テンプレートと生成コードの関係、NOTICEの適用と実提供先の成立は、最終版の条件照合で確認する。新旧で内容が異なるPWA世代の完全移行・実配信・Windows実機も未完。

### 生成テンプレートとソース由来の追加調査

Langium CLI 4.4.0の `lib/generator/ast-generator.js`、`grammar-serializer.js`、`module-generator.js` はテンプレート文字列から3生成ファイルを作り、`node-util.js` の `generatedHeader` を挿入する。生成器ソースの先頭にはTypeFoxのMIT表示があり、生成ヘッダー自体にはツール名・版と自動生成の注意が入る。したがって生成物ヘッダーだけを見て、生成器に由来する表示が完全に引き継がれるとは判断できない。固定版の[Langium CLI原文](https://raw.githubusercontent.com/TypeFox/langium/v4.4.0/packages/langium-cli/LICENSE)を参考として保持し、テンプレートに由来する実質的な内容・表示を含むかを確認する。生成器全依存のソース提供を一律に要求する案ではなく、生成物との関係を評価し、MIT原文と生成器由来の説明も提供する保守的な準備案とする。この調査時点では未配置だったが、後述の追加作業で生成器参考原文としてPoCに配置した。

workspaceの拡張走査12入力には、複数のJison文法のMermaid MIT表示に加え、次の追加由来が含まれる。

|由来|固定Tinyソース内の根拠|今回の確認・残件|
|---|---|---|
|js-sequence-diagrams|`sequenceDiagram.jison` の先頭にAndrew Brampton 2012–2013とSimplified BSD、元プロジェクトを記載|該当ヘッダーをPoC表示候補に保持。後続調査で2013年固定文法と同commitのBSD原文候補を確認。下節の履歴と比較結果を参照。実取込checkoutと製品提供は未確定|
|Jekyll|`diagram-api/regexes.ts` が元の正規表現の固定commitを参照|[参照commitのMIT原文](https://raw.githubusercontent.com/jekyll/jekyll/6dd3cc21c40b98054851846425af06c64f9fb466/LICENSE)を確認。元表現と変更箇所・保持すべき表示の提供対応を確認する|

これらはnpmの63パッケージとは別のソース由来であり、依存数を増やすだけでは条件が完了しない。[条件台帳](evidence/mermaid-tiny-conditions-matrix.json)にも生成器と上記2由来を追加した。PoCでは12入力の検出済み表示を含め、原文・表示・パッチのオフラインリンクとhashを再確認した。今回の検出漏れはテスト観点不足に分類し、`(c)`・MIT表記・由来URLも走査対象へ追加したが、語句検索の網羅性には限界がある。採否と正式公開は引き続き保留。

### js-sequence-diagramsの履歴とJekyllの変更箇所

[ソース由来の比較記録](evidence/mermaid-tiny-source-origins.json)に固定URL・各ファイルのhash・差分区間を追加した。履歴を旧パスまで辿ると、Mermaidの[2014年の取込commit](https://github.com/mermaid-js/mermaid/commit/2a0a2a2269545a26abf20c92de65f214eea5a425)で `src/parser/js-sequence-diagram.jison` が追加され、その後のディレクトリー移動・名称変更を経て現在のsequence文法へ繋がる。js-sequence-diagramsの[2013年固定文法](https://github.com/bramp/js-sequence-diagrams/blob/27c7a2b4fcb7b3366b9e371fde18911e08b13054/src/grammar.jison)と初期取込文法を比較し、主要な字句・文法部分と元の2012–2013年表示が対応することを確認した。差分は10区間で、Mermaid用の開始命令、actor・signal・noteの処理と列挙値をMermaidのAPIへ結び付ける変更などだった。全体が同じファイルではなく、元文法に変更を加えたものと解釈できるが、取込時の元checkoutを一意に断定するものではない。

同じ固定commitの[当時のLICENCE](https://raw.githubusercontent.com/bramp/js-sequence-diagrams/27c7a2b4fcb7b3366b9e371fde18911e08b13054/LICENCE)はAndrew Bramptonの2012–2013年表示と2条件BSDであり、現在のMermaid文法内の由来表示と整合する。これを版を固定した原文候補とし、現在masterの2012–2017年原文だけで代用する案から改める。製品提供案は元表示に加えて、この原文の条件・免責を利用者が閲覧できる第三者表示に保持すること。実取込checkout未特定と、原文候補を固定できたことは分けて記録する。

Jekyllは[参照commitのDocument](https://github.com/jekyll/jekyll/blob/6dd3cc21c40b98054851846425af06c64f9fb466/lib/jekyll/document.rb)にある `YAML_FRONT_MATTER_REGEXP` と、Tiny固定ソースの `frontMatterRegex` を比較した。Rubyの文字列先頭anchorをJavaScriptの先頭anchorとインデントcaptureへ変更し、閉じる区切りを `---` / `...` から同一インデントの `---` へ変更、改行と本文captureを変更し、Rubyのmultiline指定をJavaScriptのdotAll指定へ移している。単なる同一表現のコピーではない。

さらに公開版とbytes一致する外部source map付き再生成物では、元の正規表現の10行目へのmappingはなく、`matchFrontMatter` の線形走査処理等へのmappingが存在した。ファイルが出力に寄与したことだけで、参照先の式そのものがTinyに残るとは判断できない。代替走査との関係や権利上の適用範囲は別途判断する。保守的な準備案として、[参照commitのMIT原文](https://raw.githubusercontent.com/jekyll/jekyll/6dd3cc21c40b98054851846425af06c64f9fb466/LICENSE)にあるTom Preston-Wernerの2008–2016年表示と許諾原文、由来と変更の説明を保持する。保持を提案することと法的に必要と確定することは区別する。

今回6ファイルを固定URLから取得してローカルの調査領域へ保存し、比較用スクリプト `trace-source-origins.py` を追加した。原文候補2点のPoCへの追加と製品提供案は次節に記載する。生成器参考原文の配置・最終適用判断は残る。製品コード・依存・配信先・PR #38の状態は変更していない。

### 原文候補2点の追加と製品提供案の確認

js-sequence-diagramsの2013年固定BSD原文（1,309 bytes）とJekyll参照commitのMIT原文（1,090 bytes）を、固定URL・サイズ・hashの比較記録と照合してPoCに追加した。これにより原文は従来66点から68点となった。npm依存の版と混同しないよう、一覧とmanifestには両候補を由来ソース・固定commit・適用判断保留として記録する。commitの異なる原文や改変原文は配置前に拒否する。改変したBSD候補を与える異常系では `licenses/` を生成せず停止することを確認した。

[ローカル検証記録](evidence/mermaid-tiny-origin-offline-validation.json): Windows、Node 24.22.1、Chrome headless 156.0.8078.81で、PoC一覧から原文68点、ファイル内表示候補、上流パッチ2点をオフラインで取得・hash照合した。重複リンク・別オリジン要求は観測されず、両由来候補の表示も確認。静的資産は77点となり、追加後の更新失敗・旧世代維持・オフライン図表示も成功した。変更範囲に応じて原文一覧・オフライン・更新回復を対象に試験し、本体E2E全件・実機は実施していない。ここでの新旧世代は同一内容の資産であり、異なる内容への完全移行の証明ではない。

製品版の提供方法案: 既存の第三者ライセンス一覧に、通常のパッケージ原文とは別に「取り込んだソースの出典・原文」を設け、Jekyllの参照commit、js-sequence-diagramsの原文候補commitと未確定事項、保持した権利表示・原文・変更の説明へ利用者の操作で到達できるようにする。実装時は版別の固定パスとmanifestを使用して原文・表示・実行bundleを同じPWA世代に固定する。外部原文URLを開く必要がないよう、本文は同一オリジンでオフライン閲覧可能にし、元URLは出典確認の補助とする。原文候補の存在やリンク成功だけで適用条件の最終充足とは表示しない。

本体移行時は原文スナップショットと照合記録を再現可能な管理対象にし、Git管理外tmpや上流の現在masterに依存しない収集・検査を行う。製品の `licenses/` 以下へ配置すれば現行のPWA manifest生成でhash・サイズを記録する設計に乗せられるが、実製品での追加・世代更新と到達性はまだ未検証。Langium CLIの参考原文は後続作業で配置した。製品版での最終提供形態と適用の判断は別途残る。アーカイブの公開・添付、マージ、デプロイは行っていない。

危険文字の完全検証、全fixture・画面状態遷移、本体PWA・実配信、実機は未実施。上記の簡易描画試行を受入試験の合格としない。Playwright付属Chromiumは環境に存在せず、インストール済みChromeで代用した。macOS/iOSは対象外。

## 配布条件の台帳と残件

|対象・版|実配布との関係／原文|必要な対応・完了証拠|状態・判断者・日付|
|---|---|---|---|
|Tiny 12.2.0|公開bundle再生成一致、クリーン材料から原文・表示のPoC配置を確認|本体接続後の同梱・到達性を検証|PoC採用推奨：Codex、2026-11-06。本体接続・公開判断は保留|
|DOMPurify 3.4.12 / lodash-es 4.18.1|Tiny JS末尾に含有と版・権利表示が明示。DOMPurifyはApache-2.0 / MPL-2.0、lodash-esはMIT|固定版原文を取得済み。採用する条件、変更・NOTICE・既存表示の有無を確認し、利用者が閲覧できる場所を設ける|保留：同梱と表示未確認、判断者未定|
|parser含む63組|固定上流の2段階metafileから寄与を抽出。原文候補は隔離PoCでオフライン閲覧可能|原文・著作権表示、適用条件と変更・NOTICE等を確認し、製品の提供先とオフライン閲覧を検証|保留：条件審査・本体提供未完、判断者未定|
|ELK現行版|現行製品には含まれる。EPL-2.0|対応source・表示の証拠を維持。新方式の本体配布物から不在を確認した場合のみ新規版の適用外を提案|保留：PR #38の公開記録を保持、判断者未定|
|anydoc/PDFium|現行の別依存|既存方針に従い内包物の原文・告知・提供条件を個別確認|保留：本件では再調査せず|

## 生成器参考原文の配置と配布準備の今回の到達点

Langium CLI 4.4.0のMIT原文を、既存の生成元記録にあるSHA-256 `599bf70b4e55f06250571d103dbd8441e0c47cb7f858c0147ca312ce38e9ef2a` と版・宣言を照合してPoCへ配置した。原文68点の一覧とは別の「生成器の参考原文」として説明し、ビルド時の参考資料を実行時の63依存へ数えない。テンプレート由来がある場合の表示保持に備えた準備であり、ツール全体のソース提供義務や適用の有無を断定しない。

[準備資料の再照合記録](evidence/mermaid-tiny-prepared-materials-check.json)では63組の原文のサイズ・hash・許諾/表示/免責条項の検索語を照合し、不一致0件。MIT・ISC・BSD-3-Clause・Apache-2.0（DOMPurifyはApache選択案）の原文候補が対応した。標準条項の語句確認だけで個々の適用を最終承認しないが、対象を説明せず「未確認」のまま繰り返すのではなく、台帳の原文準備状態を「PoC資料準備確認済み、製品提供・最終版照合は保留」へ更新した。source-notices、上流パッチ2点、生成器参考原文のhashも確認した。

今回のPoCは静的78資産（ライセンス関連74資産）。Chrome headless 156.0.8078.81で原文68点、権利表示、パッチ2点、生成器参考原文をネットワーク遮断後に取得・hash照合し、全件成功。更新失敗・旧Worker維持・オフライン描画、clear後の旧成功/旧失敗破棄、実生成50 KiB境界の対象試験も順次成功した。実機・本体E2E全件・実配信は未実施。本体を変更していないため、対象はPoCと資料検査に限定した。

最終版で残る照合は、固定された提供物に原文・権利表示・DOMPurify選択・上流変更が揃うこと、適用するNOTICEがある場合の保持、テンプレート由来の扱いとソース由来2件の説明、更新後も同世代のリンクが開くこと。js-sequence-diagramsの取得checkoutの一意な復元や、Jekyllの式の権利上の閾値判定を一律の必須条件にはせず、固定原文・由来表示を保持する準備案を採る。解決できない具体的論点が残る場合に限って権利者等へ確認する。anydoc/PDFiumの残件は独立して維持する。

## クリーン再取得と最終提供形態の検証

[再取得手順・提供形態](mermaid-tiny-material-procedure.md)を整備し、[固定取得計画](evidence/mermaid-tiny-material-retrieval-plan.json)と [実行証跡](evidence/mermaid-tiny-clean-material-validation.json)を保存した。調査tmpや既存npm/pnpmキャッシュを読まない新規取得を実施し、65 npm tarball、固定上流source tar、由来原文2点の計68取得先から249ファイルを準備した。tarballはSHA-512 integrity、source tarと原文は固定SHA-256で照合し、選択した通常ファイルの内容だけを読み出した。install script・汎用展開・アーカイブの保存/公開は行っていない。出力先はローカルの新規フォルダーだが、入力となる取得計画と検査は管理対象であり、過去の調査フォルダーへの依存はない。

Windows、Python 3.14.2、Node 24.22.1で、取得完了indexの249件を再検査し、新材料のTiny実bundleからPoCを生成した。従来の調査材料を用いた出力と、新材料から生成した原文・表示・パッチ・一覧・manifestの74資産は全件hash一致。改変した材料の別コピーは配置前に拒否され、成功済み出力は変化しなかった。正常・異常・境界・状態遷移を分けた取得処理の10単体テストも成功した。不正ディレクトリーパス、重複、件数/展開量、欠落、特殊ファイル、hash不一致、既存出力の上書き、取得失敗と完了indexの関係を対象にした。初回の通信制限とOS一時領域の後片付け制限は環境問題として切り分け、新規取得とリポジトリー内の試験領域で再実行して成功した。

再取得材料による [PoC受入7工程](evidence/mermaid-tiny-acceptance-validation.json)も逐次成功し、原文68点、権利表示、パッチ2点、生成器参考原文のオフラインhash一致を確認した。最終提供形態は同一生成物の `licenses/` 以下に置く74資産とし、固定Tinyを含むPoC全体で78資産とする。DOMPurifyのApache選択、検出した表示・変更、由来原文候補、生成器の役割を維持する。本体の第三者ライセンス導線へ同じ形態を接続する計画を採用する。本体への配置・製品表示の最終化・公開承認は今回実施していない。

これによりPoC採否を妨げていたクリーン再取得と提供形態の未決を閉じ、Tinyの本体移行を推奨する。今後の残件は、以下の本体接続後に初めて確認できる事項と、anydoc/PDFium・実配信・実機の独立した公開条件へ絞る。

## 本体移行計画とレビューの区切り

以下は計画であり、今回本体への移行は実施していない。

1. **PoC採否のレビュー。** 本報告はTinyの方式採用を推奨する。材料管理・クリーン取得・提供形態と対象機能試験は今回のPoC範囲で完了した。本体接続の指示を受けて次の段階へ進む。今回の成功項目の反復を作業目的にせず、新たな変更時に必要な範囲を回帰する。
2. **材料手順を本体ビルドへ接続する。** 固定取得計画と検査を利用し、製品ビルド用材料の準備・保管・更新責任を決める。原文68点・表示・パッチ2点・生成器参考を生成物に含め、欠落・別版・hash不一致で停止する。隔離PoCで再現済みの手順を用い、旧調査tmpを本体の入力にしない。
3. **描画と構文検証を一緒に接続する。** `src/json/mermaidRenderer.mjs` の通常版読み込みと `src/json/json.worker.ts` の通常版parseを置換する。TinyのIIFEを同一オリジンからロードし、Worker側では `importScripts` の可否に合わせてWorker形式を設計する。共有DOMの逐次render、SVGサニタイズ、世代照合、現在の取消範囲とエラー表示を維持する。
4. **配布物全体から旧資産を除く。** 本体のimport、静的copy、出力chunk・WorkerとPWA全取得対象を照合する。通常版を別機能で使っている場合はその経路も特定し、ELKが残る版では提供条件を適用外にしない。開発・履歴資料のELK名と実配布のELKコードは区別する。
5. **製品の原文とPWAを更新する。** 既存の「第三者ライセンス」導線へ原文・由来・変更説明を接続し、生成物manifestの版/hashとリンクの一致、オフライン到達性、異なる新旧内容での旧タブ維持・新世代有効化・回復を検証する。
6. **回帰と配布候補を固定する。** JSONの生成・選択・出力・取消と、変更の影響を受ける既存形式・混在キュー・CSP・WASMを対象に検証する。commit・環境・ログ・生成物を固定し、レビューへ渡す。Windows実機はユーザー別途。実配信や公開は別途許可と条件充足の後に判断する。

切戻しは前の承認済み実装・依存・原文・manifestを組として復元し、回帰を再確認する。未承認の旧配布物をそのまま公開してよいとはしない。PR #38はELK調査の履歴として状態を変更せず、根拠となる新資料が出るまで同じ候補比較を繰り返さない。今回の変更はローカルのPoC・検証・報告に保持し、push・PR作成/更新・マージ・デプロイ・アーカイブ公開/添付は行っていない。
