# JSON本体接続設計（実装前レビュー）

> 2026-10-30追加承認: 検証ブランチで[第一段階の本体接続](json-product-connection-validation.md)を進める。本書は目標設計であり、全項目を実装済みとしない。第一段階は階層ごと300行のページ閲覧UI、専用Worker、設定版/実行/要求世代、結果/図/出力への接続。展開型仮想ツリー・全UI-26受入・最大保持量/実機/PWA/公開条件は残る。

2026-10-27、2026-10-30更新。標準Mermaid表示を採用し、図層は[最新設計](json-standard-mermaid-design.md)に従う。JSON生成/設定/キュー/出力の契約は維持する。本書は接続仕様であり、本体への登録・実装は行わない。

## 現在の接続先と責務

|既存箇所|統合時に担当させる責務|今回の境界|
|---|---|---|
|`src/App.tsx`|ファイルID、実行世代、状態・結果の所有者。設定確定時の単一更新|現行コードを変更しない|
|`src/conversion/processQueue.ts`|確定済みキューsnapshotの逐次処理、失敗後の継続、取消後の応答不採用|独立試作から既存関数を呼び検証|
|`src/converter/ConverterWorkerClient.ts`|既存形式の変換。JSONは別clientで扱いWASMへ渡さない|既存PDF/Office/CSV契約を維持する設計|
|`experiments/json-gates/worker.mjs`|JSON解析・Pointer解決・生成の参考実装|混在PDF操作は検証専用。製品JSON clientへは移植しない|
|`experiments/json-gates/standard-view.mjs`|検証済みソースの標準表示、50 KiB判定、図層の再試行|製品状態/品質/キューの所有権を持たせない。旧diagram-viewは履歴|
|`src/components/ResultCard.tsx` / `src/utils/files.ts`|品質による出力可否、コピー/ダウンロード、MD専用frontmatter|JSON用結果adapterと共通の出力guardを将来追加|

## 状態と応答照合

ファイルごとに`fileId`（同名でも独立）、`settingsVersion`、`parseGeneration`、確定Pointer/スタイル、結果snapshotを持つ。非同期応答は`operation + workerGeneration + fileId + settingsVersion + parseGeneration + requestId`の該当項目を照合し、変換応答はさらに`runId`、図応答は`diagramGeneration`を照合する。Worker再生成時にはclient側の`workerGeneration`を増やし、該当pendingをrejectする。新WorkerでIDを初期化して旧応答と一致させない。

設定画面には開くたびに新しい`dialogSessionId`、対象/スタイル変更ごとに新しい`draftRevision`を付ける。draft応答はその二つと対象Pointer/スタイル、操作別の最新requestIdまで照合する。スクロール等の別操作のIDでdetail/適合性の待機状態を解除しない。必須属性欠落・型不正・未知のoperationは採用しない。

IDは削除後も再利用しない。解析キャッシュは全体で原則1件、結果本文はそのキャッシュの参照にせず独立した値として保持する。確定済み結果の許可証跡はfileId/設定版/スタイルと本文の組に保持し、現在の解析キャッシュの世代が変わったことだけでは失効させない。古い解析応答の破棄と、既に完了した結果の保持を分ける。

|操作/事象|設定・結果・許可の遷移|
|---|---|
|設定を開く|確定値からdraftを作り新しいdialogSessionIdを採番。設定版・旧結果は変更しない。位置復元で対象を変更しない|
|draftの対象/スタイル変更|draftRevisionを増やしdetail/適合性要求を更新、以前のdraft応答と確定可能フラグを無効化。最新の全検査が成功するまで確定不可|
|取消/閉じる/再解析失敗|draftだけ破棄。確定設定・完了結果を保持。再読込失敗に日本語の理由と明示再読込を提示|
|キャッシュ追出し後の再解析|解析世代だけ更新し確定Pointer/スタイルを再検査。再解析のみでは設定版更新・旧結果破棄を行わない|
|設定確定|最新draftの全検査を再照合。該当fileだけ設定版を増やし、確定値と結果/出力許可の削除を一つのstate更新で適用。旧非同期要求と図世代を失効し図/ソースを除去。他fileの設定・結果は維持|
|変換開始|dialogを開いている/再解析中なら開始不可（draftを暗黙確定しない）。確定済みキューsnapshotを固定し、追加/設定確定を停止。形式でclientを分岐し、並列変換はしない|
|単一fileの変換失敗|該当fileのみ失敗。誤った成功表示をせず、次のfileは継続。完了済み結果は維持|
|全体取消|runId増加→Abort→両clientの変換Worker破棄。処理中/待機のみ取消、完了済みは維持。図表示要求も失効し旧完了は無視。画面側標準renderの強制中断は保証しない|
|削除/全消去|対応する全世代を失効しWorkerを破棄。結果とdraftと図を削除。リロード後に復元しない|
|図表示失敗|既に検証済み本文と変換品質を維持しソース表示。図の再試行だけを新世代で行い、キューを再実行しない|

Mermaidスタイルでは図ソースの検証完了前にプレビュー/コピー/DLを公開しない。構文・ソース/graphの全量一致が検証された後の配置失敗では本文出力を維持する。JSON taskは本文の検証完了までresolveせず、`processSequentially.onSuccess`を生成直後に呼ばない。配置完了の待機は変換キューの成功条件にしない。確定時の検査成功を、変換時の再検査の代用にしない。

## 結果adapterと出力

JSON生成結果を既存WASM品質推測へ流さず、JSON固有の上限・構文・数値・全量一致検査から品質/警告/出力許可を構築する。Mermaid検証前は結果を公開せずprivate pendingに保持し、検証成功後だけ確定結果へ移す。結果にはfileId/設定版と検証済み本文を束ね、別設定の許可フラグを再利用しない。

項目表/一覧表にはそれぞれの生成・件数/列数/本文上限等の証跡を付け、Mermaid検証Workerの成功を要求しない。JSON結果はスタイルを判別できる型とし、`diagram.outputAllowed`を全スタイル共通の出力許可に流用しない。ルートPointerの空文字`""`は有効な選択で、未選択`undefined`と区別する。`~0`/`~1`を含むPointerはJSON Pointerとして照合し、表示用文字列から逆生成しない。

|出力先|内容|guard|
|---|---|---|
|Markdownプレビュー/コピー|生成本文のみ。Mermaidはfenced codeと図/ソース切替|結果の品質許可と、現file/設定版との一致|
|Markdownダウンロード|既存`markdownDownloadContent`でtitle・元ファイル更新日時を付与|同上。実行日時を自動追加しない|
|plain textプレビュー/コピー/DL|既存の決定的導出。Mermaidはソース、表はタブ区切り|同上。frontmatterなし|
|図再試行|検証済み本文と一致するgraphのみ|図世代一致。出力設定・結果・品質を変更しない|

既存`ResultCard`内の`safeToExport`チェックに加え、共通adapterの許可を表示とイベントhandlerの両方で照合する。handlerは描画時のpropsだけを信用せず、操作開始時に現在の結果/設定版/許可を取得し、許可された本文snapshotを一度だけOSへ渡す。非同期コピー完了時には同じ結果が現存する場合だけ通知を反映する。開始済みのOSコピーを取消で撤回できるとは保証しない。コピー拒否・DL失敗から自動再試行しない。

ファイル名は既存`outputFileName`を再利用する。UI-26はこの設計と独立検証だけでは受入完了にしない。[接続設計レビュー](json-product-connection-review.md)に机上追跡と統合後の受入項目を記録する。

## 製品CSP・更新の採用案

2026-10-30変更: 下記は旧独自SVGの共存試作で成立した条件。標準MermaidはSVG内styleを用いるため新試作ではstyle-srcにunsafe-inlineを限定許可する。製品CSPは変更しない。標準描画のPWA・全資産更新・WASMとの共存は新方式で再検証が必要。旧IC/IU成功だけで新方式の成立としない。

製品の現行CSPは`script-src 'self' 'wasm-unsafe-eval'`、`worker-src 'self' blob:`を含む。新しい独立試作では`worker-src 'self'`に狭め、WASM実行の許可だけ維持して同時動作を確認する。Workerファイル自身のHTTP CSPにも同一の許可を付与する。製品の画像・style・PDF処理の既存用途を検証せず一括置換しない。

製品SWの既存キャッシュへ別試作SWを登録しない。統合時は一つのSWとmanifestに固定URLのHTML/JS/CSS/WASM等をまとめ、CSP・全資産hash・SWロジックから世代を作る。install全量成功後のみ新世代を待機し、skipWaitingで既存タブを強制置換しない。旧タブ終了→新世代activate→自分の旧世代Cacheだけ削除する。本文・File・Pointer・結果・frontmatterはCache/Storageへ保存しない。

統合後の受入は、製品PWAのインストール/更新、全既存形式、品質判定、取消/再設定/混在、コピー/DL/権限拒否、世代混在、実容量不足を含める。[検証計画](json-integration-readiness-plan.md)と[結果報告](json-integration-readiness-validation.md)を参照。本体統合の開始は別途判断する。
