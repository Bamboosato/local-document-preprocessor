# JSON図表示の採用決定と今回の対象範囲

決定日: 2026-10-26。ユーザー指示により確定。既存の報告は各実施時点の履歴として保持し、今回の方式・対象判定では本書を優先する。

## 採用する方式

- アプリ内の図はJSON木専用の独自SVGで表示する。全ラベル・値・親子関係の一致を必須とし、標準Mermaidとの配置・折返し・外観の差を許容する。
- 構文検証と配置は同一オリジンの静的URL Workerで処理する。Blob/data起動への自動切替は採用しない。
- Markdown／plain textの出力は、固定版Mermaidで検証したソースを維持する。表示方式の変更を理由にソースの検証や全量照合を省かない。
- 図の全体表示・拡大縮小・リセット、図／ソース切替、検証済み本文を維持した図再試行を製品化する。未検証時の出力は停止する。

## 今回の対象と後日確認

今回の製品化・統合判定の対象はWindowsのChrome／Edge。Windows FirefoxとPlaywright WebKitの結果は補助検証として扱う。

**macOS・iOS関連は一旦対象外。** 実macOS Safari、iPhone Safari、iOSのインストール済みPWA、VoiceOver、iPhoneのタッチ・縦横切替・メモリ圧等はユーザーが後日適切なタイミングで確認する。これらは今回のWindows向け作業・統合判定の停止条件にしない。未実施という事実は保持し、対応確認済み・ゲート通過とは表示しない。

Windows上のPWA更新・容量不足・複数タブ・回復、読み上げ、実ズーム、メモリ負荷、製品CSP・配布ライセンス、JSONの状態・キュー・出力契約は今回の残件として保持する。

## 本体統合の扱い

方式採用の未決定状態は解消した。本体統合は引き続き保留し、今回対象のG-01～04条件を証拠付きで満たしてから判断する。macOS/iOSの後日確認を待つ必要はないが、対象外化をWindowsの未確認条件の解消に流用しない。

次の作業は、[追加計画](json-adoption-followup-plan.md)に沿った独立試作の修正・検証と、製品CSP・資産・回復・更新・配布ライセンスの具体化とする。マージ・デプロイは実施しない。PR更新時の自動Preview生成を避けるため、`vercel.json`でこの作業ブランチだけGit自動デプロイを無効化する。他ブランチはこの設定の対象にしない。

関連資料: [要件](local-document-preprocessor-json-requirements-v0.2.md)、[画面設計](local-document-preprocessor-json-screen-design-v0.2.md)、[方式比較](json-product-adoption-proposal.md)、[既存結果](json-product-readiness-validation.md)、[要件対応表](json-requirement-evidence-matrix.md)、[後日実機手順](json-device-validation-runbook.md)。

今回の実装と検証結果は[採用方式のWindows追加検証](json-adoption-followup-validation.md)を参照する。
