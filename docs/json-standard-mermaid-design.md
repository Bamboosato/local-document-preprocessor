# 標準Mermaid表示の採用方針・設計

2026-10-30のユーザー承認を反映する。基準はローカルknowledge-board `2df91ca`のMermaidBlock.tsx / mermaidRenderer.ts / sanitizeSvg.ts。参照のみで別プロジェクトは変更しない。こちらの固定Mermaid 12.2.0を維持し、knowledge-boardの11系へダウングレードしない。

## 新しい採用基準

JSON→生成Mermaidコード→Markdownのmermaidフェンスとして保持→コード部分を標準`mermaid.render()`でSVG化する。Markdown全体をrenderへ渡さない。生成本文の検証と表示の成否を別の状態にする。

|項目|採用する基準|
|---|---|
|表示|ローカルMermaid遅延import、300ms debounce、共有状態の競合を防ぐ逐次render|
|サイズ|フェンス内コードのUTF-8が51,200 bytes以下は描画。超過は案内とソースへ。生成200ノード/ラベル200/50,000コードポイントとは別判定|
|安全性|strict、HTMLラベル無効、SVGサニタイズ。script/foreignObject/イベント属性/危険URL/外部参照を除去。SVG rootの属性も検査|
|表示操作|図/読取専用ソース、スクロール、空/検証中/描画中/成功/上限超過/失敗を表示。図内ズーム・全体表示は必須外|
|競合|入力変更・clear・disposeで要求世代を失効。古い成功/失敗/構文検証を採用しない。描画前に入力snapshotを固定|
|取消|debounceと構文検証Workerは取消可能。画面側の同期renderの強制停止・5秒以内中断・常時UI応答は保証しない|
|出力|未検証本文は不可。検証後の図取得/描画失敗や50 KiB超過では本文・品質・キューを変えない|

JSON厳密解析、数値字句、Pointer、文字の可逆表記、設定版、1解析セット、混入防止、非送信/非永続化の契約は変更しない。Mermaid構文は従来の静的URL Workerで検証し、生成graphとソースと本文フェンスを照合する。既存ResultCardへは接続しない。

## 独立試作の構成

`experiments/json-gates/standard.html`を専用入口とし、JSON入力→既存core生成→検証Worker→標準SVGを確認する。既存の独自SVG/共存試作は履歴・回帰用として残す。root src/public/依存lockと製品SWは変更しない。

standard-renderer.mjsは遅延importと逐次描画、standard-view.mjsは検証・上限・表示状態・世代、standard.mjsは独立UI、standard-build.mjsは固定CSPのローカルbuild/previewを担当する。生成されたSVG文字列のみをサニタイズ後にDOMへ挿入する。Mermaidが使う一時DOMはfinallyで破棄し、bindFunctionsは呼ばない。

SVGサニタイズはknowledge-boardの処理を基準に、今回はSVG要素allowlist、root属性、外部hrefとCSS参照も検査する。ソース文字列をHTMLへ直接補間しない。サニタイズはSVG出力を対象とするため、Mermaid自身の脆弱性すべてを防ぐ隔離境界とは主張しない。

## 回復とCSPの境界

ライブラリーimportの失敗はpromiseをリセットして明示再試行可能にする。ただし失敗したdynamic importはブラウザーに記憶される場合があり、再試行でも失敗するなら、必要な入力/ソースを手元に保存してページ再読込・再生成を案内する。自動リロード・入力永続化・自動再変換は行わない。

標準SVGはstyle要素/属性を使う。独立試作だけ`style-src 'self' 'unsafe-inline'`を使用し、script/worker/connectはself、eval/iframe/外部資産を許可しない。旧試作のstyle-src selfだけのCSP成立を新方式へ流用しない。製品CSPへの採用は、style nonce/hash等の可否と既存形式を統合許可後に検証する。製品CSPを今回変更しない。

新試作はService Workerやインストールmanifestを持たず、オンラインlocalhost検証のみ。旧二世代更新/オフラインの成功を新方式の証拠へ流用しない。配布資産は汎用Mermaidと従来の検証Workerを含み、最小化達成とは称しない。ELK依存やWASM出典の未証明事項も残る。

## 実行と受入範囲

```powershell
npm run build:standard
npm run browser:standard -- chrome edge
```

cwdは`experiments/json-gates`。previewは127.0.0.1:4194のみで公開デプロイしない。チェックscriptがサーバーを起動/終了し、同一実機ではブラウザーを逐次実行する。[検証観点](json-standard-mermaid-plan.md)を先に読み、結果は[報告書](json-standard-mermaid-validation.md)へ記録する。

本体統合保留、macOS/iOS対象外、実機はユーザーが別途確認する。実機確認時も旧ズームUIの手順をそのまま新方式へ適用しない。Windowsの読み上げ・実200%ブラウザー倍率・タッチ・復帰、インストール済みPWAと実負荷は未確認のまま。
