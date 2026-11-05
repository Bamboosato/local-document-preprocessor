# 配布候補の版固定と提供物の判断資料

> 後続の[配布準備方針](distribution-adopted-policy.md)で `57ad1ab` を評価基準とし、DOMPurify の Apache-2.0 選択等を採用した。以下の選択・提供方法に関する未決定記述は本資料作成時点の履歴であり、公開可否は未確定のまま。

2026-11-05、PR #30 マージ後の main `57ad1abe9d557626a77eeeded9fb114ea710ff29` を**ローカル検討用の候補**としてビルドし、[機械可読台帳](evidence/distribution-candidate-57ad1ab.json)に固定した。採用・配布・法的充足を承認したものではない。製品または依存が変わる場合は別の候補として再生成・再照合する。実機はユーザー別途、macOS/iOS 対象外。

## 観点と前提

最優先で防ぐ問題は、別版・部分収録のソースや原文を実際の配布物に対応する完全版として扱うこと。機能は版・取得先の対応、非機能は hash・byte 数と配信可能性、データは原文・NOTICE・除外の区分、UI/報告は確認済みと候補の明示を確認する。正常・欠落/改変・空や複数原文・版切替を分ける。今回はローカル bytes の照合であり、配信・実機・法的な充足は対象外。

## 固定候補の証跡

|対象|確認結果|範囲|
|---|---|---|
|入力|commit `57ad1abe9d557626a77eeeded9fb114ea710ff29`、lock SHA-256 `ca28ec7d0ade3ff0a349dad2f91f661f7b05d841c420a0bba3d30681002d771c`|既存 Windows 環境のインストール済み依存を使用。今回クリーン再導入はしていない|
|manifest / SW|manifest SHA-256 `255ad9a0570b21f1dd8d183c3a34a73bfcb843bec23019086dc74efd26ff7b85`、世代 `c86c92d953f97dd762782d79`、SW SHA-256 `ee05a73bad634fdf4a8465d9a253ffcec7eaf7ff7f742fb968488ad7a306dc9e`|公開 manifest は442資産。SW 埋込側は manifest を加えて443資産、SW 本体は別。過去の[クリーン再生成](windows-clean-rebuild-validation.md)と同じ hash だが、別 commit の証拠を本候補の実配信証明にしない|
|npm 原文・NOTICE|233パッケージ・236原文。inventory SHA-256 `c58ccb1b7430f5050bad4102d4c1f309435e60dcf83ec83a8b89699236c51901`|各原文の対象 package・版・URL・byte 数・hash を台帳に記録し、inventory、実ファイル、manifest の一致を確認。WASM の完全な内包物一覧ではない|
|実行資産|anydoc WASM、PDFium WASM、ELK chunk 2件の URL・byte 数・hash を台帳に記録|WASM は[既存の公開 npm bytes 照合](evidence/json-published-wasm-correspondence.json)と hash が一致。ELK の実 checkout や WASM の実リンク graph の証明ではない|
|source 候補|ローカル ZIP 4件の名称・hash・サイズ・manifest hash・除外件数を台帳に記録し、それぞれの外部 inventory と一致|ZIP は Git 管理外であり、本台帳にも ZIP 自体は含めていない。ELK の ZIP は source 全体が対応済みと証明されておらず、PDFium はテスト用PDF 1件除外の部分収録。[詳細](distribution-local-archive-validation.md)|

## 判断・提供物の対応

|対象|この候補で示せる関係|判断前の不足と必要な成果物|
|---|---|---|
|ELK / EPL-2.0|`elkjs 0.9.3` の npm 原文と、既存記録の固定 elkjs commit・ELK source 候補を紐付けられる。[追跡](evidence/json-elk-source-trace.json)|実 checkout・生成依存と実行 chunk の完全対応は未証明。対象配布物に必要な source・告知・取得方法を[判断表](distribution-decision-register.md)に従い確認し、根拠・判断者・日付を記録する|
|anydoc WASM|配布 bytes は公開 npm bytes と一致。固定 source 参照と target 候補原文を既存記録に紐付けられる|実リンク内容・必要な追加原文/告知は未判定。候補一覧を実リンク一覧にせず、必要な対象と判断根拠を記録する|
|PDFium WASM|配布 bytes は公開 npm bytes と一致。固定 source 候補と原文の既存記録を参照できる|実リンク graph とテスト用PDF `testing/resources/feature_linearized_loading.pdf` の除外が提供範囲に与える影響は未判定。現行候補 ZIP を完全版と案内しない|
|DOMPurify / es-toolkit|両ライセンス原文、NOTICE の各パス・hash が台帳にある|選択条件、告知の適用範囲と表示方法は未決定。Apache-2.0 は推奨候補であり採用済みではない|
|提供先・版別索引|別 origin の版別索引と利用者操作によるリンクは[設計案](distribution-delivery-plan.md)として整理済み|実ホスト・維持担当・保持期間・取得不能時の扱いと、対応物として提供可能な範囲を決定する。実 URL・公開済みファイルとして扱わない|

## 実行結果と次の判断

`npm run build` と `npm run check:dist` は成功。台帳の236原文について実ファイルの hash・byte 数、inventory の hash、manifest の対応を照合し、ローカル候補 ZIP 4件の bytes/hash を既存 inventory と照合した。台帳はこの実施結果を記録したもので、将来の版や別環境を自動検証する仕組みではない。`check:dist` や CI はこの台帳自体と生成物を直接照合しない。この形式を継続利用する場合は、固定版・台帳・生成物を比較する手順またはコマンドを整備する。文書と証跡のみの変更のためローカル E2E は未実施。実配信・実機・アーカイブの公開/添付・デプロイは行っていない。

責任者がこの候補を判断対象とするかを確認し、各対象の必要なソース・告知と提供先の根拠を決める。必要に応じ専門家が確認する。判断表の完了条件は定義済みだが、各条件の充足判定・判断者・判断日は未確定であり、この候補の作成によって完了とはしない。
