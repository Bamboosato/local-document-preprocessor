# LDP ローカルMCP（Windows）

同じPCのエージェントが原本を読み、LDPの文書・JSON WorkerでMarkdownに変換します。MKBを保存先にする場合は、現行のMKBを開き、普段使うブラウザプロファイルでLocal MCPを接続してください。

## 初回登録

Node.js 24とCodex CLIを用意し、LDPリポジトリのルートでPowerShellから実行します。ビルド済み資産をローカルに置いたまま使います。

```powershell
npm ci
npm ci --prefix tools/local-mcp
npx playwright install chromium
npm run build:mcp
$ldpServer = (Resolve-Path tools/local-mcp/server.mjs).Path
$nodeExe = (Get-Command node).Source
codex mcp add local_document_preprocessor -- $nodeExe $ldpServer
codex mcp get local_document_preprocessor
```

ユーザー単位の登録は一度です。サーバーを一覧に反映した新しいチャットで使えます。登録先フォルダーを移動した場合はコマンドのパスを更新します。LDPだけのMCP利用はMKBへの接続を必要としません。

## エージェントへの依頼例

- 「このプロジェクトの `docs/仕様書.pdf` の2～3ページをLDPで変換してMKBに保存して」
- 「このチャットに添付したPDFをLDPでMarkdownにして」

登録されたサーバーは `inspect_document`、`convert_document`、`read_result` を提供します。プロジェクト入力はMCPクライアントが提示する単一のローカルworkspace root配下の相対パスを使います。チャットをまたいで一つの接続を共有するホストは、下記の依頼単位アダプターを使います。rootを提示しないホストでは `WORKSPACE_UNAVAILABLE` を返し、カレントフォルダーから推測しません。

添付には、そのチャットで利用者が指定した元ファイルまたはバイト列が必要です。抽出テキストや画像プレビューのみの場合は原本を再添付してください。添付IDは接続を作ったホストが発行する一時参照です。添付とプロジェクト内の同名候補があれば、依頼された方を使います。

## ホスト側の連携コマンド

Codexなど、選択されたファイルを元パスで受け取るホストは、`run.mjs` に1件の依頼を標準入力で渡せます。これは実際のLDP MCPクライアントです。プロジェクト入力では**依頼元のプロジェクトルートを作業ディレクトリ**にして起動します。添付入力ではホストが認めたその1件だけを読んで、依頼専用のパイプで子のMCPへ引き渡します。共有ディレクトリやデータのコピーは不要です。ホストが元バイト列を持つ場合は `withLdp({attachment:{id,name,bytes}}, …)` を利用できます。

PowerShellでの例（UTF-8、例のパスは実際の配置に合わせる）。

```powershell
$OutputEncoding = [Text.UTF8Encoding]::new($false)
$runner = 'C:/work_codex/local-document-preprocessor/tools/local-mcp/run.mjs'
$request = '{"source":{"kind":"project_file","path":"tests/fixtures/pdf/three-page-range.pdf"},"options":{"selection":{"mode":"range","start":2,"end":3}},"title":"会議資料（2～3ページ）"}'
$request | node $runner
```

添付の場合は `source` を `{"kind":"attachment","host_file":"C:/…/選択した原本.pdf"}` にします。この絶対パスはホストの入力専用で、MCPツールの引数には使えません。プログラムはメモリ内で出力を連結して総バイト数とSHA-256を照合します。上のコマンドはMarkdown本文と品質情報を標準出力に返します。`--prepare-note` を付けると、MKBの容量を検査し、保存用の引数を作成します。実文書の出力はログに記録しないでください。

**保存を依頼された場合**は、登録済みのMKBサーバー入口と期待するPWAのOriginを指定します。このモードはMKBの接続先を確認してから変換し、保存確定後はノートIDと品質情報を返します。

```powershell
$mkbServer = 'D:/work_codex/markdown-knowledge-board/tools/local-mcp/server.mjs'
$request | node $runner --mkb-server $mkbServer --mkb-origin 'https://mkb.bamboosato.com'
```

1件50 MiBまで。MKBの新規ノートは注記込み128 KiBまでです。失敗した変換は保存されず、部分結果は警告付きで保存されます。保存後の応答を確認できない場合は `MKB_OUTCOME_UNKNOWN` と元の `request_id` を返します。同じプロファイルを確認するまでは新しいIDで作成し直さないでください。同じ保存依頼の再送には、原本・選択・タイトル・タグ・本文が同じことを確認し、依頼JSONの `request_id` に元の値を指定します。

## 検証

```powershell
npm run build:mcp
node --test --test-concurrency=1 tools/local-mcp/verify.test.mjs
```

合成データで範囲・品質・入力の境界・チャンク・競合・取消を確認します。実MKBに書き込む場合は、テスト用の原本・タイトルを指定し、戻ったノートIDで本文を照合します。

現行MKBとの連携を別のブラウザプロファイルで試すには、依存関係とWebビルド（`dist/index.html`）を準備したMKBのチェックアウトを指定します。次のコマンドは一時ブラウザでMKBを手動接続する操作を再現し、同一要求の再送と再読み込み後の本文を確認します。

```powershell
node tools/local-mcp/verify-mkb.mjs D:/work_codex/markdown-knowledge-board
```
