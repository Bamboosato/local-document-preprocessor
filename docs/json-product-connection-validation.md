# JSON本体接続・第一段階の結果と残件

2026-10-30。[検証計画](json-product-connection-plan.md)の観点から実施。ユーザーはPR #18のマージと検証ブランチでの本体接続を許可した。新しい接続変更のmainマージ・デプロイは未承認。macOS/iOS対象外、実機確認はユーザーが別途実施する。

## 基点と公開抑止

PR #18へmain/検証ブランチのGit自動デプロイ無効化を追加した。head `66c8754cff7462cb875d3a0783041c65d3d5eca2`の[CI](https://github.com/Bamboosato/local-document-preprocessor/actions/runs/40999212398)は旧更新検査中に一度cancelledとなったが、失敗ログはoperation canceledのみで原因を特定できなかった。成功済みjobは再実行せず、キャンセルされたjobだけ再実行しsuccessを確認。旧試作の問題が解消したと一般化せず、再発時の調査対象として保持する。

PR #18を固定headでsquash mergeし、mainは`be78c295efce0bdc24ae69fca591cc4b8a996708`へfast-forwardした。接続作業は`codex/json-product-connection`へ分離し、その基点をマージ後mainへそろえた。mainと当該ブランチのGit自動デプロイは無効のまま。デプロイ操作は行っていない。

## 第一段階で接続したもの

|箇所|今回の実装|
|---|---|
|生成core/標準renderer|レビュー済み実装をsrc/jsonへ共通化。旧独立試作は再export経由で同じ実装を利用|
|JsonWorkerClient/json.worker|JSONだけを専用Workerで厳格検査・1解析セット保持・必要時再解析・生成。WASMへ渡さない。Mermaid生成時にだけ構文検証libraryを遅延取得|
|JSON対象設定|ルート/単一object/array、項目表/一覧表/Mermaid。階層ごと最大300行のページ閲覧、名前/値/長いPointerは抜粋と明示。内部Pointerは完全なRFC 6901を保持|
|既存App/逐次キュー|形式でclientを分岐し、JSON/CSV/PDF等を同じ逐次処理へ。設定版/runId/要求ID/Worker世代を照合し、同期的な多重開始も抑止|
|確定/取消/結果|draft取消は旧結果を保持、確定だけ該当設定版を増加して旧結果を失効。完了結果は全体取消で失わず、処理中/待機だけ取消。再選択/全消去でJSON Workerを終了|
|ResultCard/標準図|検証済みMermaidのみ標準SVG表示。50 KiB超過/表示失敗でもコピー/DLは維持。ソース/plain text切替、旧描画と旧コピー完了通知を不採用|
|既存出力関数|MDダウンロードだけtitle/originalUpdatedAt付与。plain textには付与しない。コピーはClipboard APIのメモリstubで導線を検査し、実OSクリップボードは操作していない|
|配布物検査|従来5原文を維持し、root production npm 233 package・235原文を追加収集。同版/lock SRI/原文hashを照合するinventoryを生成|

JSONは50 MiB/深さ128/10万ノード等の既存core上限を維持する。生成の50,000コードポイントと自動描画の51,200 UTF-8 bytesを分け、構文検証前の出力を成功扱いにしない。workerの通信payloadは必要な属性/operation/型を検査し、不完全な成功payloadも出力可能な結果にしない。

製品CSPは元からstyle-src unsafe-inlineを含むため、CSPをさらに緩めずに標準描画を確認できた。script/workerの新しい外部許可やeval許可は追加していない。製品Service Workerは今回変更していない。既存SWの静的Cache検査の成功を、新しい全資産の二世代更新成立とは扱わない。

## 実施した検証

|検査|結果と選定理由|
|---|---|
|root単体|71件成功（既存63＋JSON adapter/client 8）。数値字句・Pointer・不正全体・検証失敗・旧Worker/未知要求/取消/遅延読込/payload欠落を検査|
|本体E2E Chromium|既存14＋JSON6＝20件成功。本体キュー/結果/依存変更のため既存全件を逐次回帰。既存の狭幅ChromiumケースはiPhone実機の検証ではない|
|本体JSON対象E2E|Chrome/Edge headlessで各6件・計12件成功。設定・3スタイル・出力・混在・過大表示・取消を対象検証。実機/OS操作の代替にしない|
|共通化後の独立試作|Chrome/EdgeでSM-01～08各8件、計16件成功。全ラベル/全親子辺・CSS保持・50 KiB境界・危険SVG・旧応答・実chunk失敗/回復を確認|
|既存core/出典guard|試作単体28、DS8、SL11件成功。共通化で数値や文字契約を変えず、固定出典の未証明区分を保持|
|型/build/配布物|成功。JSON Worker/WASM資産と原文inventoryの版/SRI/hashを確認。公開は行わない|
|方針/文書/監査|方針12件、53文書・195リンク、差分検査成功。root production/全依存監査は検出0件|

合成データだけを使い、新しいcontextから単独/通しの順に実行。同一実機でテストscriptを並行実行しない。本体JSONだけの経路でWASM要求0・外部HTTP要求0を確認。新方式の実機・読み上げ・実ブラウザー200%ズーム・タッチ・インストール済みPWA更新・実容量不足/メモリ圧は未実施。JSON UIのbrowser context再読込は空状態だが、すべてのStorage/Cache・全復帰条件の網羅を証明しない。

## 失敗の切り分け・レビュー

取消試験の初回は遅延注入をpage routeで行ったが、Service Workerにより意図した前提が成立せずBも完了して失敗した。分類は環境/前提条件の観点不足。faultケースだけSWをblockした専用contextへ分離し、注入回数>0をassertした後で実行。対象1件の再現確認後、通し20件で成功した。製品SWを弱めて試験を通したわけではない。取消のタイムアウトを延長していない。

Reactスキルの観点で、重い描画libraryの遅延取得、effect解除時の世代失効、描画共有状態の逐次化、dialogのnative modal/focus、設定確認proofとページ表示proofの一致、出力のlive result照合を確認。同期renderの強制停止/常時UI応答は保証しない。既存WorkerとJSON Workerの生命周期を混同しない。

root依存へ試作と同じjsonc-parser 3.3.1/Mermaid 12.2.0を固定追加。新規production依存の@antfu/install-pkgがtinyexec ^1.3.1を要求するため、既存tinyexecも1.3.0→1.3.1へ解決された。他の既存package版は変更していない。原文同梱と出典整合は、EPL/各WASM内包物の配布条件全体の承認ではない。

## CI結果

[CI #37](https://github.com/Bamboosato/local-document-preprocessor/actions/runs/41003609995)はhead `80374a44393be20e69eebdbae202a1d0080a9bb5`でVerify / JSON prototype checksともsuccess。Linuxでroot/prototypeのクリーンnpm ci、root単体71・製品E2E20・方針12、型/build/原文inventory、旧試作の単体/配布物/表示/更新/共存とSM8件、文書/依存監査が成功した。Windowsでの成功だけをLinuxへ流用せず、CI実行を確認した。実機/PWA二世代更新/全要件達成の証明ではない。

## 次段階の詳細

1. 展開型の仮想ツリー/表示位置復元/詳細抜粋/適合表示など、画面設計全体の完成。現状は階層ごとのページ閲覧で、長い同接頭辞キーの照合UIも含め全J-SC/UI受入とはしない。
2. 最大入力・完了結果・図・両WASMを含む保持量、OS負荷、ファイル切替の長時間反復、全UI-26故障注入。第一段階の混在/取消成功でG-02や全接続設計を通過扱いにしない。
3. 製品SWの世代固定・旧タブ保持・新資産全量・容量不足/保存拒否・インストール済みPWA二世代更新。現在のSWにはskipWaiting/clients.claim等があり、新仕様への更新設計は未実装。main取り込み/公開前の重大残件として保持する。
4. 原文/NOTICE/対応ソース/告知への製品画面からの到達性、実バンドルへの対応。ELK実checkout・anydoc再現ビルド・PDFium実リンクgraph等の[出典残件](json-published-wasm-validation.md)も未解消。
5. ユーザーのWindows実機確認。macOS/iOSは引き続き対象外。main自動デプロイの再有効化と公開は、別途の明示許可後に判断する。

このPRは第一段階の縦接続をレビューするためのもの。全JSON機能完成・全ゲート通過・公開可能という結論ではない。接続変更はmainへマージせず、報告書とレビュー用PRまでで止める。
