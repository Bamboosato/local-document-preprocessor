# 標準Mermaid表示の独立試作・検証結果

2026-10-30。基点main `4ad89476a4adf3401416b80a97ed57bb0830203a`、[計画](json-standard-mermaid-plan.md)の観点から実施。[採用設計](json-standard-mermaid-design.md)へknowledge-board同等の基準を反映した。本体統合保留、macOS/iOS対象外、実機ユーザー別途、マージ・デプロイなし。

## 結論

標準`mermaid.render()`による独立表示を実装し、Windows Chrome/Edge headlessでSM-01～08、各8件・計16件が成功した。5秒強制中断と図内ズームは表示採用条件から外した。JSON生成の精度、全ラベル/親子辺、未検証出力の禁止、非送信/非永続化の条件は維持する。

要件§6.5/§11/G-04/J-AC-21、画面§9.3/UI-24、採用決定、接続設計、作業指示書、証拠対応表を更新。旧独自SVGの比較・試験結果は履歴と明記し、新方式のCSP/PWA/配布証明へ転用しない。

## 実装と受入の区別

- Mermaid 12.2.0、strict・HTMLラベル無効・遅延import・300ms debounce・逐次render、図/読取専用ソース、スクロール、失敗/過大案内を実装した。既存依存版/lockは変更していない。
- 表示50 KiBはUTF-8 bytesで判定し、51,200まで描画、51,201以上はrenderを呼ばない。生成の50,000コードポイントとは別で、適正に生成・構文検証された本文の出力を失効させない。
- 構文検証は同一オリジンの静的URL Worker。入力snapshotとgraph/source/本文フェンスの対応を固定し、旧検証/描画成功/失敗は世代照合で不採用。clear/disposeは検証Workerとdebounceを取消する。標準renderの実行中強制停止は保証しない。
- SVGはサニタイズ後だけDOMへ挿入。SVG要素allowlist、rootを含むイベント属性、外部href/CSS参照を検査し、script/foreignObject/外部画像等を除去する。Mermaidの一時DOMはfinallyで破棄、bindFunctionsは実行しない。
- 独立画面のJSON入力は合成fixture用で、既存coreを画面側から呼ぶ検証補助。製品の解析Worker/設定/逐次キュー/出力adapterへ接続していない。変換全体の性能や製品UI-26を成功扱いにしない。

## 実測と検査範囲

Node 24.22.1、npm 11.19.1、Vite 8.3.4、試作Playwright 1.64.0。knowledge-boardはローカルhead `2df91ca`の実装を参照し、変更していない。

|環境/検査|結果|
|---|---|
|Windows Chrome 156.0.8078.74 headless|SM-01～08、8/8成功|
|Windows Edge 156.0.4314.42 headless|SM-01～08、8/8成功|
|標準試作build|成功、100ファイル・10,292,854 bytes（無圧縮合計）|
|外部HTTP要求/想定外pageerror|両ブラウザーとも0件。localhostの意図した資産拒否はSM-08で別扱い|
|既存JSON単体/出典ガード|単体28件・DS8件・SL11件成功|
|文書・リンク|51文書・182ローカルリンク、問題0件。追加5 scriptの構文・差分空白検査も成功|

SM-01は実UI入力/生成/図/ソース、SM-02は51,199/51,200/51,201 bytesとCJK/絵文字の計数、SM-03は危険SVG、SM-04は旧成功/失敗/検証とclear/dispose、SM-05は検証失敗と描画例外/明示再試行、SM-06は200ノードの全ラベルと実生成による表示上限超過、SM-07は再読込の空状態とStorage/Cache非保存、SM-08は実Mermaid chunk取得拒否と再読込回復を確認した。

初期状態は新しいbrowser context・保存データなし。SM-01から順に実行し、最大図→再読込→独立contextの資産失敗も通して確認する。SM-04/05の非同期逆転・例外は注入、SM-01/06/08の描画/取得は実ブラウザーで分けて検査する。全テストは同一実機で逐次実行した。

証跡はGit管理外`experiments/json-gates/evidence/standard-chrome.json`と`standard-edge.json`、CIはstandard-mermaid-viewer-evidence artifact。fixture ID/成否/ブラウザー版だけを記録し、本文/Pointer/個人パスを出さない。失敗時の画像は入力・図/ソース領域をマスクする。[固定結果記録](evidence/json-standard-mermaid-checks.json)をレビュー用に保存する。

E2E選定は新しい表示経路の対象ケースをChrome/Edgeでクロスブラウザー実行。製品ローカルE2E全件は未実施（src/public/依存を変更していないため）。CIの製品E2Eは既存selectorへ委ねる。実機・読み上げ・実ブラウザー200%ズーム・タッチ・Apple・インストール済みPWA/実負荷は未実施。headless成功を実機受入へ一般化しない。

## 判明した制約と残件

## CI結果

[CI #32](https://github.com/Bamboosato/local-document-preprocessor/actions/runs/40995546870)はhead `221176c909dc106d67a49e873810692aba37f688`でVerify / JSON prototype checksともsuccess。新方式Chromium SM-01～08、製品単体63件・E2E14件、旧試作単体28・DS8・SL11・配布物各2、既存表示/共存/更新検査も成功した。root/prototypeのproduction・全依存監査は検出0件。製品E2E全件は既存selectorの共通/未分類変更判定によるもので、今後の全件既定化を意味しない。CIのUbuntu/Chromium成功をユーザー実機の成功には読み替えない。

## 制約の詳細

検出・修正した問題: 初期サニタイズはCSSの@規則をすべて除去し、標準テーマに含まれるkeyframesまで失っていた。文字/辺数だけの検査では見た目の欠落を検出できず、SM-01にstyle存在とcomputed fillの検査を加えて両ブラウザーで再現した。分類は実装問題とテスト観点不足。keyframes/mediaだけを許可し、import/font-face/エスケープCSS/外部URLの拒否を維持した。SM-03にも安全なkeyframesの保持を追加し、修正後の通し16件が成功した。

全親子辺の検査も追加した。初期テストはSVG idのrender世代prefixを見落として失敗したため、生成されたdata-idの連番端点を照合するよう修正した（テストのデータ形式理解不足）。ノード/辺数だけを一致証明とせず、すべての親子接続を確認する。

1. 標準Mermaid SVGはstyle要素/属性を使う。独立試作だけstyle-src unsafe-inlineを許可した。旧独自SVGのstyle-src selfのみの成立を流用しない。製品へのnonce/hash等の適用と既存形式との共存は統合許可後に確認する。
2. library import失敗はpromiseをリセットするが、ブラウザーがmodule取得失敗を保持する場合はページ再読込が必要。入力を保存せず再読込するため、必要な入力/ソースを手元に保存する案内を追加した。実資産拒否→解除→再読込→明示再生成で回復を確認。
3. 主スレッド同期描画の中断・常時UI応答は保証しない。サイズ上限とdebounceを抑制策とし、JSON変換キューの取消要件は維持する。
4. 新方式はSW/インストールmanifestなし。PWA/オフライン/二世代更新/実容量不足、WASMとの共存と製品UI接続は未実施。汎用描画資産＋約5.18 MBの既存検証Workerを含み、配布最小化の達成とはしない。
5. ELK実checkout、anydoc再現ビルド、PDFium実リンクgraph等の[出典残件](json-published-wasm-validation.md)は今回解消していない。新方式の最終バンドル/原文/告知の整合も配布前に必要。

buildは大きなchunkと既存worker設定の非推奨警告を出すが失敗ではない。方式変更を安全性・性能・配布条件全体の完了と誤判定しないため、上記を残条件として保持する。製品コード・製品CSP/SW・依存lockは不変。
