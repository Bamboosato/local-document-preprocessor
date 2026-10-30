# JSON要件・コード・証拠・残件の対応表

> 2026-10-30残件整理: 現行の残件は[現行台帳](json-current-backlog.md)を正とする。旧方式固有OLD-01～06は「方式変更により対象外」でクローズ。本書の以降の表は当時の証拠対応と当時の残件の履歴であり、現行の未完了一覧ではない。旧欄の方式採用/Safari/独自図/旧PWA等を再び必須作業へ取り込まない。

> 2026-10-30追加: [本体接続の第一段階](json-product-connection-validation.md)のJC-01/02は専用adapter/client、JC-03/04は本体設定/キュー/標準表示/出力/取消の対象証拠。G-01全受入・展開型ツリー・全UI-26・G-02実メモリ・PWA二世代更新/実機/配布承認の完了にはしない。

> 2026-10-30: [標準Mermaid報告](json-standard-mermaid-validation.md)が新しい表示基準の証拠。以下の旧SVG/iframe証拠は当時の履歴として保持。SM-01～08は新G-04/UI-24の表示・安全・上限・旧応答・回復の証拠に限定し、本体UI-26・実機/PWA・配布承認は未確認。

> 2026-10-27追加: [接続前設計・共存検証結果](json-integration-readiness-validation.md)のIC-01/05/07はG-04のWASM/CSP共存、IC-02/03は混在逐次処理・取消、IC-04はJ-AC-11の出力純粋関数、IU-01～04はWASM込み更新/失敗維持、IC-L01は配布出典の独立証拠。製品UI-26、実PWA、配布条件全体の受入完了にはしない。

> 2026-10-26更新: [採用決定と対象範囲](json-adoption-decision.md)により独自SVG＋静的URL Workerを採用。macOS/iOSの残件はユーザーによる後日確認へ移し、今回のWindows向け停止条件から外す。以下の既存証拠・残件一覧は確認履歴として保持する。

> 後続の図操作・更新/回復・最大入力・配布ライセンス原文の対応は[追加検証結果](json-adoption-followup-validation.md)を参照。AD-01～06はJ-AC-12/14/21・UI-13/23/24の図層、UP-01～04はG-04更新、AD-07は配布原文、G02-M02はG-02追加負荷に対応する。実読み上げ・実PWA・製品キュー全体を完了扱いにはしない。

作成日: 2026-10-26 / 基準: `48f975a`。コードはすべて `experiments/json-gates/` の試作。production接続済みとは扱わない。

旧証拠は[初回](json-gates-validation.md)・[代替初版](json-g04-alternative-validation.md)・[追加結果](json-g04-followup-validation.md)。今回の実行条件・成否は[今回の報告](json-product-readiness-validation.md)。表の試験IDは対応先を示し、全受入条件を今回完了した主張ではない。

## 履歴: ゲートと当時の残件

|要件ID|関連コード|既存証拠|今回の検証|残件|
|---|---|---|---|---|
|G-01|core.mjs、core.test.mjs、worker.mjs|初回21件、字句・全セル・全ラベル比較|core/deadline再実行、G01-browser、PR-01/02/04|製品契約への適合、配布ライセンス|
|G-02|core.mjs ParseCache、app.mjs、worker.mjs|PC保持・PDF取消・CDP診断|G02-00～03の対象再現、G02-M01の最大入力・完了結果・図を含む追加CDP診断|実機の最大受付・図/WASM込み負荷、OS総量、DEV-01～03/11|
|G-03|app.mjs、index.html、style.css|PCの行数・位置復元・適合復帰|G03-01～03の対象再現|実Safari・読み上げ・実ズーム・タッチ、DEV-04～07|
|G-04|diagram-worker-host.mjs、validation-worker.mjs、layout-worker.mjs|旧iframe未達、後続ALT48件は過去結果|ALT回帰、PR-01～08、SW-01～05、PR-B01|方式採用、製品CSP、実PWA更新・Safari、DEV-08～11|

## 履歴: J-AC受入条件と当時の残件

|ID|関連コード|既存証拠／今回対応試験|残件|
|---|---|---|---|
|J-AC-01|core.mjs parseBytes|G01-N01/E01/E02|製品受付|
|J-AC-02|core.mjs valueText/generate|G01-D01/D05、PR-01/02|製品出力|
|J-AC-03|core.mjs parseBytes|G01-E03|製品の文書全体検査|
|J-AC-04|core.mjs resolve/walk/generate|G01-N02/D02|製品選択と照合|
|J-AC-05|app.mjs tree/reveal、worker.mjs|G03-01/02|実機到達性|
|J-AC-06|app.mjs open/close/confirm|G03-01|Escape・背景クリック等の製品ダイアログ全経路|
|J-AC-07|core.mjs generate、app.mjs select|G01-D04/E05、G03-01|製品一覧表の全UI|
|J-AC-08|core.mjs、diagram-worker-host.mjs|G01-D03/D05、ALT-01、PR-01|製品プレビュー回帰|
|J-AC-09|core.mjs limits、worker.mjs|G01-B01～07、G02-03、PR-02|実機負荷と製品境界|
|J-AC-10|app.mjs epoch/request/fileQueue|G02-01/02、ALT-03/12|製品混在キュー通し、全ID組合せ照合|
|J-AC-11|core.mjs generate|生成物の既存単体検査|製品のコピー・DL・frontmatterは未実装/未検証|
|J-AC-12|diagram-worker-host.mjs|ALT-06/08/10、PR-04/06/07|製品カードの図/ソース・回復導線|
|J-AC-13|SW各候補、図コントローラー|ALT-07、PR-08、SW-04|製品全通信・保存検査|
|J-AC-14|app.mjs、style.css|G03-02/03はPCレイアウトのみ|DEV-06/07、実読み上げ/実200%|
|J-AC-15|productionの既存経路|今回productionソース変更なし|本体統合時PDF/Office/CSV/PWA全回帰|
|J-AC-16|app.mjs createWorker/request、ParseCache|G02-01/02、G02-S01|製品の解析/業務状態分離、DEV-03|
|J-AC-17|ParseCache、worker.mjs details|G02-S01、G02-02/03|20最大ファイル・完了結果保持の実機測定|
|J-AC-18|core.mjs literal/encodeSegment|G01-D02/D03|製品画面/コピー/DL|
|J-AC-19|core.mjs cpLength/generate|G01-B04/B06/B07|製品設定と生成で同じ関数を利用|
|J-AC-20|app.mjs reveal/treeRequest|G03-02/03|実機・支援技術、DEV-04/06|
|J-AC-21|deadline.mjs、図コントローラー、SW|ALT-01～12、PR-01～08|実Safari/PWA、製品資産更新|
|J-AC-22|app.mjs select/selectionRequest|G03-01の適合復帰、G03-R01で旧応答遅着・重複と現取得待ちを検査|製品・実機の受入、DEV-05。逐次キューなので詳細要求同士の逆転を作った証明ではない|
|J-AC-23|図コントローラーのshow/retry/clear|ALT-06/08/10、PR-04/06/07|製品の再確定→キュー再実行、他ファイル結果保持を含むUI-26全体|

## UI受入条件

|ID|関連コード|既存証拠／今回対応試験|残件|
|---|---|---|---|
|UI-01|app.mjs、index.html|G03-01|製品の初期受付|
|UI-02|app.mjs tree|G03-01|製品UI|
|UI-03|app.mjs select|G03-01|製品全ペインの一致|
|UI-04|app.mjs reveal|G03-02|実機のscroll/focus|
|UI-05|app.mjs close/open|G03-01/02|Escape・背景クリックを含む製品操作|
|UI-06|app.mjs confirm|G03-01|同一設定での製品再確定と待機キュー|
|UI-07|app.mjs select|G03-01|製品不適合理由|
|UI-08|core.mjs、worker.mjs|G01-N01/E05|製品の空表示|
|UI-09|core.mjs Pointer、app.mjs|G01-D02|製品の同名対象操作|
|UI-10|worker.mjs window、app.mjs|G03-02|実機到達性|
|UI-11|core.mjs generate|G01-B07は全量生成のみ|製品表100行ページ・コピー/DL全量|
|UI-12|app.mjs selectionRequest|G03-R01の実Worker応答保留・再送|製品の要求方式で逆転が可能なら別途検査|
|UI-13|core.mjs、図コントローラー|G01-B04、ALT-02/04、PR-02/03|製品回復文言|
|UI-14|app.mjs business/fileQueue|G02-01|productionのファイル別設定|
|UI-15|app.mjs dialog|G03-02のTab確認のみ|実キーボード全操作・フォーカストラップ、DEV-06|
|UI-16|style.css|G03-03はviewport/文字サイズ模擬|実200%・実長いファイル名、DEV-07|
|UI-17|app.mjs request/epoch|G02-01/02|製品混在通し・実機取消|
|UI-18|ParseCache、app.mjs|G02-S01、G02-02|最大受付の実機測定|
|UI-19|core.mjs literal|G01-D02/D03|製品画面との対応|
|UI-20|core.mjs generate|G01-B04/B06/B07|製品設定可否との一致|
|UI-21|app.mjs tree、style.css|G03-02/03|実機の全到達性|
|UI-22|app.mjs reveal/open|G03-02|実機ラジオ・Tab|
|UI-23|図コントローラー、SW|ALT-05/06/08/10/11、PR-05/06|製品の2回復導線、実オフライン|
|UI-24|deadline.mjs、図コントローラー|ALT-02/03/09/12、PR-03/07|実Safari、復帰時の期限判定|
|UI-25|app.mjs select|G03-01適合復帰、G03-R01で現詳細・生成待ちと旧応答非採用|製品・実機でDEV-05|
|UI-26|図コントローラー、app.mjs|ALT-06/08/10、PR-04/06/07は図層のみ|別ファイル完了結果を含む製品キュー回復全体|

製品回復を現試作の図API検査だけで完成としない。UI応答試験は実Workerの故障注入条件を明記し、製品のキュー構成が変わった場合は再評価する。設計と実機手順を残し、ゲート解除前に追加実装・実測が必要。
