# JSON図表示・製品化の採用案（未決定）

作成日: 2026-10-26 / 基準: `48f975a`。採用決定・本体統合・実Safari対応完了を意味しない。
[要件の変更案](local-document-preprocessor-json-requirements-v0.2.md)と[画面設計の変更案](local-document-preprocessor-json-screen-design-v0.2.md)を同時にレビューする。

## 方式の比較と提案

|比較軸|標準Mermaidをsandbox iframeで描画|独立配置Worker＋独自SVG（既存候補）|静的URL Worker＋独自SVG（追加候補）|
|---|---|---|---|
|意味・ソース|JSONの構造、固定版Mermaidソース|同じソースを構文検証し全ラベル・辺を照合|同じ検証・配置・SVGを再利用|
|外観・互換性|標準レンダラーのレイアウト|独自の縦配置、20コードポイント折返し。外部表示と異なる|同左。外観互換の改善は今回なし|
|操作|製品の拡大縮小・読み上げは未完成|同左。200ノードで高さ54,000のため表示操作が重要|同左。検証ページは操作UIを完成させるものではない|
|安全性|生成SVGの許可検査が必要|固定要素・textContent、構文検証とモデル照合|同左＋selfの静的スクリプトのみ|
|中断|初回Firefox等で5秒中断未達|独立Workerをterminate。既存Windows報告あり|同じ期限・破棄経路を追試|
|CSP・起動|iframe文脈の制限・DOM依存|Blob能力probeとdata代替、コードの一時URL化|`worker-src 'self'`、Blob/data代替なし|
|オフライン|初回候補は未達|Cacheから静的コードを読み出して起動|URL Worker要求のSW適用をブラウザーで実測。失敗なら保留|
|配布|比較用の多くのMermaid描画資産|従来の比較用ビルドを共用|検証・配置Workerと表示ページだけを独立ビルド|

提案は、構造の意味とソース互換性を維持し、画面内の外観差を明記する独自SVG方式。静的URL起動はCSPを単純にできるが、取得済みオフラインの成立を必須とし、不成立なら採用しない。実際の配布量と成否は[今回の検証報告](json-product-readiness-validation.md)に記録する。採用判断が出るまで両仕様書の本文と本体接続は変更しない。

## CSPと必要資産

追加ページは独立したポート4188で、HTTPヘッダーに `default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'` を付与する。画像許可は明示したローカルの静的favicon用であり、図のimage要素や入力由来画像は生成しない。製品には既存WASMのための `wasm-unsafe-eval` 等が必要であり、このページのCSPをそのまま製品へ適用しない。frame-ancestorsは製品配信ヘッダー側で定める。

同一オリジン専用previewはCORSを無効にする。`Vary: Origin`付きの応答を一つの要求条件で先行Cacheへ保存しても、別のOriginヘッダー条件のmodule要求に一致するとは限らない。今回Chromeで配信設定だけを変えて対照確認した。製品ホストの実ヘッダーでもCache照合を再確認し、`ignoreVary`で無条件に回避しない。比較再現のため `READINESS_CORS=1` の起動を残す。

ビルドが出力した正確なURL一覧だけをキャッシュする。文書、設定、結果、クエリ付きURL、非GET、他オリジン、APIは対象外。Workerは自己完結したclassic script、入力はpostMessageのみ。anydoc/PDFiumやiframe比較用描画資産を追加ページへ含めない。検証用Mermaidバンドルはまだ汎用構文・依存を含むため、専用パーサーの最小サイズを達成した主張はしない。

## 更新・保存拒否・回復

1. HTML・JS・Worker・SWテンプレートとCSPポリシーから世代を生成し、世代固有Cacheへ全資産を取得する。途中失敗ではその世代だけ削除してinstall失敗とする。旧世代は保持する。製品配信ではCSP以外の応答ヘッダーの変更も配信ポリシー版として世代へ反映し、旧ヘッダーを持つCacheが残る条件を検査する。
2. `skipWaiting`を使用せず、旧タブの作業終了を待つ。全タブ終了後のactivateで、自分のprefixの旧Cacheだけを削除する。他用途のCacheは削除しない。既存タブに新旧Workerを混在させない。
3. `clients.claim`は全静的資産の取得後だけ。Cache拒否時はSW導入失敗としてUIへ通知し、オンライン要求は継続する。容量不足に応じて無関係Cacheや完了結果を黙って消さない。
4. 未検証ソースでは出力停止。オンライン復帰だけでは再実行しない。検証済み本文があれば図だけを新世代・新要求で再試行し、本文・品質・他ファイルを保持する。
5. ブラウザーがCacheを消去する可能性を前提とし、オフライン常時保証と表示しない。OS停止後は絶対期限を再確認し、古い結果を採用しない。

今回の単体SWイベント模擬は、install失敗・削除境界・保存拒否の設計検査。実ブラウザーの更新待機、複数タブ、OS強制終了やインストール済みPWAの更新成功を証明しない。これらは[実機手順](json-device-validation-runbook.md)で別途確認する。

## ライセンス・監査と製品に進める条件

直接依存は既存固定版jsonc-parser 3.3.1、Mermaid 12.2.0（MIT）を継承し、追加依存は導入しない。Mermaidの推移依存には複数ライセンスがあり、EPL-2.0のelkjs等をMermaidのMIT表示だけで済ませない。製品採用時には出力バンドル由来の依存一覧とライセンス原文、必要なNOTICE、改変・再配布条件を配布物へ含める。今回の検証ページは配布・デプロイしない。

解除条件は、G-02最大入力・完了結果・図・WASMを含む実機負荷、G-03支援技術・実ズーム・タッチ、G-04安全性・中断・取得済み／未取得オフライン・更新・実Safari/PWA、方式差分の採用決定、依存・配布ライセンス・製品CSPの確認がすべて揃うこと。Windowsでの対象試験成功だけで解除しない。
