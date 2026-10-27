# JSON本体接続設計（実装前レビュー）

2026-10-27。採用済みの独自SVG＋同一オリジン静的URL Workerを前提とする。本書は接続仕様であり、本体への登録・実装は行わない。

## 現在の接続先と責務

|既存箇所|統合時に担当させる責務|今回の境界|
|---|---|---|
|`src/App.tsx`|ファイルID、実行世代、状態・結果の所有者。設定確定時の単一更新|現行コードを変更しない|
|`src/conversion/processQueue.ts`|確定済みキューsnapshotの逐次処理、失敗後の継続、取消後の応答不採用|独立試作から既存関数を呼び検証|
|`src/converter/ConverterWorkerClient.ts`|既存形式の変換。JSONは別clientで扱いWASMへ渡さない|既存PDF/Office/CSV契約を維持する設計|
|`experiments/json-gates/worker.mjs`|JSON解析・Pointer解決・生成の参考実装|混在PDF操作は検証専用。製品JSON clientへは移植しない|
|`experiments/json-gates/diagram-view.mjs`|検証済みソースの図表示、図層だけの再試行|製品状態/品質/キューの所有権を持たせない|
|`src/components/ResultCard.tsx` / `src/utils/files.ts`|品質による出力可否、コピー/ダウンロード、MD専用frontmatter|JSON用結果adapterと共通の出力guardを将来追加|

## 状態と応答照合

ファイルごとに`fileId`（同名でも独立）、`settingsVersion`、`parseGeneration`、確定Pointer/スタイル、結果snapshotを持つ。応答には`fileId + settingsVersion + parseGeneration + requestId`を付け、変換応答はさらに`runId`、図応答は`diagramGeneration`を照合する。IDは削除後も再利用しない。解析キャッシュは全体で原則1件、結果本文はそのキャッシュの参照にせず独立した値として保持する。

|操作/事象|設定・結果・許可の遷移|
|---|---|
|設定を開く|確定値からdraftを作る。設定版・旧結果は変更しない。位置復元で対象を変更しない|
|draftの対象/スタイル変更|detail/適合性要求を更新し、以前のdraft応答と確定可能フラグを無効化。最新の全検査が成功するまで確定不可|
|取消/閉じる/再解析失敗|draftだけ破棄。確定設定・完了結果を保持。再読込失敗に日本語の理由と明示再読込を提示|
|キャッシュ追出し後の再解析|解析世代だけ更新し確定Pointer/スタイルを再検査。再解析のみでは設定版更新・旧結果破棄を行わない|
|設定確定|該当fileだけ設定版を増やし、確定値と結果削除を一つのstate更新で適用。旧非同期要求と図世代を失効。他fileの設定・結果は維持|
|変換開始|設定ダイアログを閉じ、ファイル追加/設定確定を停止してキューsnapshotを固定。形式でclientを分岐し、並列変換はしない|
|単一fileの変換失敗|該当fileのみ失敗。誤った成功表示をせず、次のfileは継続。完了済み結果は維持|
|全体取消|runId増加→Abort→両clientの実行中Worker破棄。処理中/待機のみ取消、完了済みは維持。遅延応答を無視|
|削除/全消去|対応する全世代を失効しWorkerを破棄。結果とdraftと図を削除。リロード後に復元しない|
|図表示失敗|既に検証済み本文と変換品質を維持しソース表示。図の再試行だけを新世代で行い、キューを再実行しない|

図の検証完了前にはプレビュー/コピー/DLを公開しない。図の構文・ソース/graphの全量一致が検証された後の配置失敗では本文出力を維持する。確定時の検査成功を、変換時の再検査の代用にしない。

## 結果adapterと出力

JSON生成結果を既存WASM品質推測へ流さず、JSON固有の上限・構文・数値・全量一致検査から品質/警告/出力許可を構築する。Mermaid検証前は結果を公開せずprivate pendingに保持し、検証成功後だけ確定結果へ移す。結果にはfileId/設定版と検証済み本文を束ね、別設定の許可フラグを再利用しない。

|出力先|内容|guard|
|---|---|---|
|Markdownプレビュー/コピー|生成本文のみ。Mermaidはfenced codeと図/ソース切替|結果の品質許可と、現file/設定版との一致|
|Markdownダウンロード|既存`markdownDownloadContent`でtitle・元ファイル更新日時を付与|同上。実行日時を自動追加しない|
|plain textプレビュー/コピー/DL|既存の決定的導出。Mermaidはソース、表はタブ区切り|同上。frontmatterなし|
|図再試行|検証済み本文と一致するgraphのみ|図世代一致。出力設定・結果・品質を変更しない|

既存`ResultCard`内の`safeToExport`チェックに加え、共通adapterの許可を表示とイベントhandlerの両方で照合する。ファイル名は既存`outputFileName`を再利用する。UI-26はこの設計と独立検証だけでは受入完了にしない。

## 製品CSP・更新の採用案

製品の現行CSPは`script-src 'self' 'wasm-unsafe-eval'`、`worker-src 'self' blob:`を含む。新しい独立試作では`worker-src 'self'`に狭め、WASM実行の許可だけ維持して同時動作を確認する。Workerファイル自身のHTTP CSPにも同一の許可を付与する。製品の画像・style・PDF処理の既存用途を検証せず一括置換しない。

製品SWの既存キャッシュへ別試作SWを登録しない。統合時は一つのSWとmanifestに固定URLのHTML/JS/CSS/WASM等をまとめ、CSP・全資産hash・SWロジックから世代を作る。install全量成功後のみ新世代を待機し、skipWaitingで既存タブを強制置換しない。旧タブ終了→新世代activate→自分の旧世代Cacheだけ削除する。本文・File・Pointer・結果・frontmatterはCache/Storageへ保存しない。

統合後の受入は、製品PWAのインストール/更新、全既存形式、品質判定、取消/再設定/混在、コピー/DL/権限拒否、世代混在、実容量不足を含める。[検証計画](json-integration-readiness-plan.md)と[結果報告](json-integration-readiness-validation.md)を参照。本体統合の開始は別途判断する。
