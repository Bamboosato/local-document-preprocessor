# ELK ソース候補と WASM 原文の照合

2026-11-05、PR #32 マージ後の main `982069de2db02b6a234a651909d43f82050dd98c` を基点とする。採用済みの[配布準備方針](distribution-adopted-policy.md)に沿い、ELK ソース候補の範囲と WASM 候補原文を現行の npm 原文一覧と照合した。これは公開承認・ライセンス条件の充足判定ではない。アーカイブの公開・添付とデプロイは行わず、実機はユーザー別途、macOS/iOS は対象外。

## 観点と前提

まず防ぐべき問題は、実リンク不明の候補を対象外と断定すること、同じ本文の別ライブラリの権利表示を省略すること、部分的な ELK ソースを完全に対応するソースとして提供すること。機能は各候補から原文・証跡への対応、非機能は保管 bytes と hash、データは対象版・権利表示・候補/除外、UI/報告は判定待ちの明示を確認する。正常（bytes一致）、異常（欠落/改変）、境界（同一本文・複数条件）、状態遷移（候補から追加/対象外/保留の判断）を区別する。実リンクや適用条件の判断は、hash一致の先で個別に行う。

## ELK: 候補の範囲

既存[追跡](evidence/json-elk-source-trace.json)では elkjs `a8304cf79fde75bc2ab1a89d28320f53f8637436` の生成済み worker と npm 側の一致、ELK 候補 `7ca51784e42a24201f29bc13e458728b6fc61cdc` 等を記録している。[固定 build.gradle](https://raw.githubusercontent.com/kieler/elkjs/a8304cf79fde75bc2ab1a89d28320f53f8637436/build.gradle) は ELK の11ソース領域を指定する。

今回、[ELK 候補 tree](https://api.github.com/repos/eclipse-elk/elk/git/trees/7ca51784e42a24201f29bc13e458728b6fc61cdc?recursive=1) の応答は `truncated: false` で、上記11領域に計658 blob があった。一方、ローカル `elkjs-0.9.3.zip` の `elk-source-candidate/` には `NodeContext.java` と `NodeSizeCalculator.java` の2ファイルだけだった。数は候補 tree の指定ディレクトリーと ZIP の部分収録の比較で、658件すべてが必須ソースであることや、候補 commit が実 checkout と一致することを示さない。**現行 ZIP を対応ソースの完全版として公開しない。**

次は上流の固定版・build 設定・利用可能なソース候補・実行資産の対応根拠と、必要な source/権利表示/生成設定の範囲を記録し、必要な不足を補う。実 checkout は未証明のまま、十分な別の根拠の有無を判断する。再ビルド bytes の完全一致は一律要件としない。[EPL-2.0 原文](https://www.eclipse.org/legal/epl/epl-v20.html)3.1–3.3 の適用と具体的な提供方法は別途確認する。

## WASM: 原文ごとの照合と保留

[照合台帳](evidence/wasm-license-triage-982069d.json)は anydoc の registry 96依存と workspace を合わせた原文195件、PDFium 候補原文29件について、既存の原文・hash・byte数を再確認し、同一 hash の現行 npm 原文があれば package・版・パスを記録した。各項目の disposition は **undecided** である。対象版の `pwa-manifest.json` の SHA-256 は `32341d2457e1e387f9260670fb57af10b892cdf21b529cb1fd8fb01064f6bcac`、npm 原文 inventory は `c58ccb1b7430f5050bad4102d4c1f309435e60dcf83ec83a8b89699236c51901`。

|候補|原文・欠落|npm 原文と同一 hash|次に必要な判断|
|---|---|---|---|
|anydoc|195件、欠落/不一致0|5件。うち3件は汎用 Apache 原文、2件は workspace と wrapper の MIT 原文|残り190件を単純に追加必須とはしない。ライセンス式、権利表示・NOTICE、対象版の実装との関係を確認し、追加・対象外・保留と根拠を各候補に記録|
|PDFium|29件、欠落/不一致0|0件|29件がすべて必要な追加原文という意味ではない。固定 DEPS や README の内容と公開 WASM の対応を確認し、追加・対象外・保留と根拠を記録|

同一 hash は原文 bytes が同じことだけを示し、別 package の著作権表示、NOTICE、ライセンス適用、実リンクや追加提供義務が満たされることを示さない。たとえば anydoc の `encoding_rs` と `unicode-ident` は既存記録の AND 条件も確認が必要で、OR の選択だけで残りを省略しない。PDFium metadata の `shipped` は公開 WASM の実リンクの証拠として扱わない。

優先して確認する2候補については、取得済み原文を読んだ結果を次に記録する。いずれも保守的な提供候補であり、対象 WASM への実リンクや法的適用を確定したものではない。

|候補|原文にある情報と保守的な準備案|未完|
|---|---|---|
|`encoding_rs 0.8.35`|[COPYRIGHT](third-party-source-licenses/anydoc/encoding_rs@0.8.35/000-COPYRIGHT.txt) は WHATWG Encoding Standard 由来データと BSD 3-Clause を説明し、[LICENSE-WHATWG](third-party-source-licenses/anydoc/encoding_rs@0.8.35/003-LICENSE-WHATWG.txt) に権利表示・条件・免責がある。2文書と選択される MIT/Apache 原文を提供候補として維持|該当データの配布物への関係、ライセンス選択、表示場所・変更有無、対象外とする場合の根拠|
|`unicode-ident 1.0.24`|[Unicode 原文](third-party-source-licenses/anydoc/unicode-ident@1.0.24/002-LICENSE-UNICODE.txt) は Unicode の著作権・許諾を含む。選択される MIT/Apache 原文とともに提供候補として維持|対象データ・コードと配布物の関係、条件・権利表示・告知場所、対象外とする場合の根拠|

これらを候補に維持することは、そのまま PWA に追加・公開したことを意味しない。追加する場合は容量・生成世代・オフライン閲覧と条件を確認する。

## 今回の検証・次の作業

`npm run build` と `npm run check:dist` 成功。現行 npm inventory 全原文の hash、anydoc 195件・PDFium 29件の保管原文の hash/byte数を検証した。比較はローカル bytes に限り、権利表示の意味や条件の適用を機械判定していない。ELK の候補 tree とローカル ZIP の範囲を比較したが、外部の対応ソース提供や ZIP の公開・添付は行っていない。文書・照合証跡のみのためローカル E2E は未実施。実配信・実機の成功とは区別する。

次に、各候補の原文・NOTICE・追加提供の要否と対象外の根拠を個別に確認し、undecided を理由・証拠付きで解消する。ELK では必要なソース範囲と提供可能性を確定し、版別 GitHub Releases の提供物・案内を整える。検証用配信に必要な条件を満たし承認されるまでは公開せず、正式公開は[4条件](distribution-adopted-policy.md)の充足後に判断する。
