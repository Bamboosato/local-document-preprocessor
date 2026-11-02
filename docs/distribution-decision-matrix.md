# 配布条件の不足証拠と判断事項（ローカル検討）

2026-11-02。対象はPR #23の確認済みhead `56207ebcd00b4fa752c211b2f109501b2cbad2c2` と、その配布候補。既存の[照合報告](distribution-license-review.md)の一致済みhash・原文・CIを根拠として再利用し、これらを再調査することを受入条件にしない。本書は配布を承認するものではない。実配信・実機の変更、マージ、デプロイは行わない。macOS/iOSは対象外。

## 判断を誤らないための観点

機能: 配布先から利用者が原文と対応ソースへ到達できること。非機能: 外部取得先の継続性、オフライン、CDN変換、MIME、容量。データ: 対象版と公開bytes・告知の取り違え、未証明の内包物。UI: 画面上の案内が提供場所と一致すること。正常時に加え、取得先の移動/消失・改変・旧版混在・複数タブ/キャッシュ更新を分ける。最優先は、未確認の原文・ソース対応を配布可能と誤認しないこと。

## 不足証拠と選択の対応

|項目|既存の確認・今確認できること|今の証拠で確認できない理由・必要な証拠|利用者に決めてもらうこと・受入条件|
|---|---|---|---|
|実リンク構成 / ELK|Mermaidの既定設定とブラウザーでELK chunkの取得を確認。elkjs 0.9.3の原文・公開リリースとELK 0.9.1＋#955相当のソース候補は[既存記録](json-source-license-validation.md)にある|公開release説明とソース特徴だけでは生成時の一意なcheckout、固定生成依存、配布chunkへの完全な対応は特定できない。ビルドmanifest・ログまたは固定条件の再生成とbytes照合などが必要|今回の対象をPR #23の固定headとするか、後続依存更新を含む別版とするか。受入時に、未証明のcheckout/生成graphを何の根拠で許容または保留するかを明示する|
|実リンク構成 / anydoc|現行配布WASM・インストール済みnpm・保存済み公開tarball内WASMのhash一致、署名付き公開工程と固定source参照を[既存記録](json-published-wasm-validation.md)で確認。固定sourceのtarget候補96件と原文は[収集記録](evidence/json-anydoc-target-licenses.json)にある|Cargo解決graphは実コンパイルに使われた全入力や実WASMのリンクgraphではない。公開run APIの状態だけでは成功ログやtoolchain/lockを確定できない。実ビルドの固定入力・ログ/リンク情報または再生成照合が必要|対象anydoc版を0.1.7のまま評価するか。候補graphと実リンク未証明の扱いを決め、必要と判断した告知・原文の範囲に根拠を残す|
|実リンク構成 / PDFium|現行配布WASM・インストール済みnpm・保存済み公開tarballとviewer tag内bytesの一致、wrapperとPDFiumの原文、source/DEPS候補は[既存記録](json-published-wasm-validation.md)にある|viewer release成功とDEPS候補だけではWASM生成時のsubmodule、GN引数、実リンク対象を確定できない。保存された調査ではjob logが410、artifactが0件。実ビルド記録/リンク情報または再生成照合が必要|対象wrapper/WASMを2.14.4のまま評価するか。候補原文29件と実リンク未証明の扱いを決め、告知の対象範囲と根拠を残す|
|原文・NOTICE|画面の一覧は固定本番npm依存の収集原文へ到達可能で、236原文の記録hash一致。es-toolkit NOTICEとDOMPurify両原文を含む。保存した調査原文226件も記録hash一致|調査原文は `dist/licenses/dependencies/` に同じパスで一括収録されず、npm一覧はWASM内包物の全一覧ではない。同一hashの重複数から法的に必要な件数は決定できない。実対象と各原文/NOTICEの関係を判断する証拠が必要|一覧だけで足りると判断できる対象と、追加同梱/追加告知が必要な対象を、固定版・原文・表示/提供場所ごとに決める。DOMPurifyの選択肢を含め、適用条件の判断を記録する|
|対応ソースの提供場所|公開tarball、固定source候補、収集証跡へのリンクが報告書にあり、ELKのEPL原文も参照できる。PDFiumの固定DEPS rawは調査時に取得できた|公開リポジトリの参照が実配布物の完全な対応ソースと確定したわけではない。旧PDFium commit APIは移動応答で移動後の同等性は未確認。将来のアクセス継続性も保証できない|自ら固定版アーカイブを提供するか、確認済み第三者の固定URLを案内するか、その組合せを選ぶ。受入には提供物と対象実行資産の対応根拠、版固定、利用者が辿れる案内、取得不能時の扱いが必要|
|実配信先のhash/MIME/到達性|ローカルVite previewでPWAと原文本文を確認。SW埋込みmanifestは公開manifestを含む443静的資産のhashとサイズを記録し、SW本体はブラウザーの更新機構で扱う。既存PR CIのUbuntu `npm ci`、Chromium回帰は成功|未公開候補のCDN/ホスティング設定、HTTP変換・MIME・キャッシュ・公開URLでは未検証。SWはJS/CSS/WASM/HTMLのMIMEを検査するが、他形式のMIMEまで全検査するわけではない。ローカル成功やCI成功は実配信先の証明にならない。Windowsのクリーンインストール再現も未実施|実際の配布先・origin直下か・検証対象の固定commit/ビルド・一時公開の範囲を決める。受入はその環境で対象静的資産のbytes/hashと形式別に定めたMIME、SW本体、原文・案内・ソース取得先、更新/オフラインの状態を記録すること。公開が必要なら、具体的な公開先と対象を示して別途承認を受けるまで実行しない|
|実機・容量|ローカルのChrome/Edge自動検証と故障注入の結果は既存報告にある|実インストール済みPWA、OS休止・復帰、実容量制限、読み上げ/200%倍率/タッチは別の環境差を持ち、自動故障注入から断定できない|ユーザーが対象Windows端末・ブラウザー版と確認時期を決め、[実機手順](pwa-generation-validation.md)に沿って記録する。macOS/iOSは今回対象外|

## 現在の判断境界

### 今回のコード・配布物からの追加確認

- 現行 `package-lock.json` は `elkjs@0.9.3`、`@firecrawl/anydoc-wasm@0.1.7`、`@embedpdf/pdfium@2.14.4` にそれぞれ固定npm tarball URLとintegrityを持つ。tarballは取得候補であり、編集用ソース全体や実リンクgraphの証明ではない。各WASMの公開tarballと配布bytesの既存照合は[公開WASM対応記録](evidence/json-published-wasm-correspondence.json)を受入根拠にでき、同じ比較をやり直す必要はない。
- `scripts/copy-third-party-licenses.mjs` はnpm依存直下から原文を収集し、機械可読inventoryにtarball URL/integrityを記録する。画面から開く一覧は原文とinventoryを案内するが、確定済み対応ソースとしてELK/anydoc/PDFiumのソースを直接提供・案内する実装ではない。source監査用原文のリポジトリ保存と実配布先での提供は区別する。
- 現行のローカル `dist` には拡張子 `.map` のファイルは見つからなかった。これはsource mapの不在という観測であり、JS内に含まれるモジュールやWASMの実リンク構成を確定する証拠ではない。PRの配布物検査は出力bytesとmanifestを照合するが、コンパイル時の依存graphを復元しない。
- 現行SWは取得資産のサイズ・SHA-256を検証し、JS/CSS/WASM/HTMLはMIMEも検査する。静的許可URLだけを保存する。実配信先のMIME、レスポンス変換、原文/ソース取得先が同じ条件で利用可能かは、その配信先の設定とレスポンスの証拠を別途必要とする。

既存の一致済み原文/バイト比較やCIの `npm ci` を重ねて実行しても、ELK checkoutやWASMの実リンクgraph、実CDNの挙動は確定しない。公開一次資料の候補、取得元の存在、実行資産との同一性、利用者への提供、適用条件の判断はそれぞれ別の証拠とする。未証明の許容範囲を判断することは、適用されるライセンス条件を免除することを意味しない。具体的な公開先と版を決める前に、現行候補を公開して試さない。

承認されたローカル準備として、PR #23の固定版を対象に[版別アーカイブ](distribution-local-archive-validation.md)を作成した。PDFium候補は個別評価後も1ファイルを安全上除外した部分収録である。外部の固定URLを併用するか、自らアーカイブを維持するかは未決定。ELK/WASMの対応ソースが完全と確認できるまでは、この候補を配布条件の達成と扱わない。リポジトリの設定はmainと調査ブランチのGit自動デプロイを無効化しているが、それだけから実配信先やその設定を推定しない。現行アプリはHTTPSまたはlocalhostのorigin直下を前提とする。
