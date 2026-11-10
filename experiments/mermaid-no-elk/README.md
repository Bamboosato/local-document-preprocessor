# 隔離PoC（本体移行の方式として採用推奨）

> 2026-11-10 現行状況: [本体12.3.0切替報告](../../docs/mermaid-tiny-12.3-product-cutover.md)の範囲でローカル本体切替・既定監査・PWA回帰を完了した。以下の本体12.2.0・未切替・不合格は当時の履歴。隔離fixtureを本体配布物へ混入させず、公開/実配信/実機の判定は別途行う。

12.3.0の最新調査は [候補照合報告](../../docs/mermaid-tiny-12.3-review.md)を参照。候補は内部監査0と追加MIT原文を含む8工程を確認し、置換先として採用推奨。本体はまだ12.2.0。`prepare-candidate-poc.mjs` で本体のTiny資産を混ぜない隔離fixtureを作り、追加原文が必要な候補では `POC_HELPER_ORIGINAL`・`POC_HELPER_EVIDENCE`・`POC_EXPECTED_ORIGINALS=69` を明示して受入を実行する。元の7工程は既定の12.2.0調査用に保持する。

最新の本体接続・回帰は [本体移行報告](../../docs/mermaid-tiny-product-migration.md)を参照。接続試験は成功したが、内包DOMPurify/js-yamlの監査により固定12.2.0の配布採用は保留。このPoCの方式推奨を公開承認や監査合格と読まない。

現在の標準手順は [クリーン再取得と提供形態](../../docs/mermaid-tiny-material-procedure.md)。`fetch-materials.py PLAN NEW_DIRECTORY` で新規取得し、`node run-acceptance.mjs MATERIAL_ROOT OUTPUT_JSON` で取得済み材料から逐次検証する。MATERIAL_ROOTはこのディレクトリーからの相対パス。公開・本体採用の承認を意味しない。以下のUPSTREAM_ROOT指定は過去の調査用手順であり、通常の再取得・受入には不要。

今回の対象試験は `node run-acceptance.mjs UPSTREAM_ROOT OUTPUT_JSON` でbuildから逐次実行する。OUTPUTはこのディレクトリーからの新規パスを指定する。`ui-safety-check.mjs` は選択・図/ソース・コピー代替と拒否・実download・Worker故障・安全性を、`different-generation-check.mjs` はHTML/実行コード/Workerの異なるA/Bと原文を使った世代移行を確認する。後者は準備済みの `dist/licenses/` が必要で、`dist-a/` と `dist-b/` はGit管理外のローカル生成物。クリップボードのOS接続は別途実機確認。

追加検証の観点（ケース実装前）: 機能はpointer選択と全出力、図/ソース切替・コピー・保存。非機能はWorkerの期限・解放、同一オリジンCSP、実内容が異なるPWA世代。データはescaped pointer・非選択データ・大整数/負零・危険文字。UIは入力変更・clear・取消・再試行。正常は検証済み出力のみの操作、異常はWorker初期化失敗・無応答・構文失敗・不正応答、境界は表示上限と期限、状態遷移は旧応答破棄・障害から再試行・旧タブ保持→閉じる→新世代有効化。合成入力を使い、ブラウザー操作と世代試験は逐次実行し、タイムアウト延長で失敗を隠さない。

ルートの `npm ci` でViteとPlaywrightを準備し、このディレクトリーで `npm ci --ignore-scripts`、`node build.mjs`、`node check.mjs`、`node offline-check.mjs` を順に実行する。Chromeが必要。テストは同一マシンで並列実行しない。`check.mjs` は複数fixtureの全ラベル・親子辺、生成ノード数境界、Worker、異常系、clearの確認であり、受入条件全体の合格試験ではない。`offline-check.mjs` は隔離した資産キャッシュ、更新失敗、旧世代待機とオフラインを確認する。新旧資産は同一であり、実際に内容が異なる世代の更新完了試験ではない。`compare-worker.mjs` は通常版の診断対照であり配布物には含めない。詳細と制約は `docs/mermaid-no-elk-reassessment.md` を参照。

原文候補の検証には上流の固定commitを再生成し依存を準備したローカルディレクトリーが別途必要。`node build.mjs` の後に `node prepare-license-candidates.mjs <上流ルート>` でハッシュ検証後にPoCの `dist/licenses/` を生成し、`node licenses-check.mjs` で一覧と全原文のオフライン到達性・ハッシュを検証する。`dist` は生成物であり、原文候補の存在を法的な充足や正式公開の承認としない。

`audit-bundle-notices.mjs` は固定metafileの寄与ファイル・依存ディレクトリーを走査し、権利表示の手掛かりとNOTICE等の候補を記録する。`build-license-matrix.mjs` はその結果と原文候補をパッケージ別の保留台帳へまとめる。準備処理はファイルのhashを再照合し、検出した権利表示コメントを `source-notices.txt` に保持する。語句・ファイル名による走査なので網羅性や法的な条件充足を保証しない。

`verify-workspace-sources.py` は固定source tarとMermaid/parserの寄与ソースをbytes照合し、parserの生成ファイルは別に記録する。`audit-workspace-notices.mjs` はその寄与範囲の表示語句とパッケージ直下のNOTICE等を調査する。再生成したparser入力と、上流tarに含まれるソースの範囲は同一ではない。

`verify-parser-lineage.py` は15言語の設定とimport先を含む18文法の上流一致、Langium CLIの版・原文、生成3ファイルの既存hashを検査する。ライセンス候補一覧は固定hashに一致する上流パッチ2件も個別ファイルとして含み、`licenses-check.mjs` でオフラインのリンク・hashを確認する。

`trace-source-origins.py` はjs-sequence-diagramsの固定文法・当時のBSD原文、Mermaid初期取込文法、Jekyllの参照commit・MIT原文をネットワークから取得し、固定ソースの比較記録を生成する。元checkoutを一意に証明したり、権利上の適用を確定したりするものではない。

`prepare-license-candidates.mjs UPSTREAM_ROOT [ORIGIN_INPUT_DIR]` は由来原文候補2点も固定hashで検証して配置する。省略時は上流調査領域の `source-origins/` を参照する。`licenses-check.mjs` は原文68点・表示候補・パッチ2点と由来候補の保留表示をオフラインで検査する。各追加後は `node build.mjs` から再生成する。

生成器参考原文はLangium CLI 4.4.0の固定hashを検証して、通常原文とは別に配置する。`licenses-check.mjs` はこの参考原文もオフラインでhash照合する。`check-prepared-materials.mjs OUTPUT` は63組の準備済み原文・参照資料のhashと条項の検索語を記録し、法的な充足とは区別する。現在の総合採否は報告書冒頭のAC表を正とする。
