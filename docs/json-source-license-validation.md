# ELK生成元・WASM依存とライセンス原文の追加調査結果

2026-10-27。基点はPR #17の`173b0d3247b00114f87a364c9872209733f16054`。[計画](json-source-license-plan.md)に従い、本体統合・実機確認・macOS/iOS・マージ・デプロイを行わず調査した。

## 結論と残る境界

anydocは固定ソースのWASM向け依存解決を実施し、registry依存96件を特定、全件の原文/NOTICE等を収集した。Cargoをホストへインストールする必要はなくなった。ELKは0.9.1に#955を加えた直接の実装ソース相当まで絞り込み、公開JSの特徴と照合した。PDFiumは固定ソース/DEPSの候補から原文を追加収集した。

今回の原文は合計226ファイル（anydoc関連195、PDFium候補29、ELK関連2）。[レビュー用原文](third-party-source-licenses/)へbytesを保持して収録し、取得元・版・hashと対応付けた。これは最終配布承認ではない。実バイナリの完全な内包物証明、ELKの一意なビルド時checkout/生成依存、実配布告知と提供先の整合は残る。

## anydoc: 候補からWASM targetの依存解決へ

固定ソースは`firecrawl/anydoc@4a45addbd607e8b59f0c263bca26aab228e10370`。アーカイブを展開し、Cargo.lockのSHA-256を既存記録へ照合した。既存Docker上の公式Rustをdigest固定で用い、次を逐次実行した。上流のコンパイル・build.rsは実行していない。

```text
cargo tree --locked -p anydoc-wasm --target wasm32-unknown-unknown --edges normal,build --prefix none --format '{p}|{f}'
cargo metadata --locked --format-version 1 --filter-platform wasm32-unknown-unknown
```

Rust/Cargo 1.99.1、イメージ`rust@sha256:1a939748a7cbab172de91a014e3804a97af1394a8c844faa67fce9401c4e40fb`。共有先は調査用`evidence/source-audit`だけで、ポート公開・製品へのマウント・ホストのRust/PATH変更は行わない。元lock不変を再確認した。

|区分|件数|意味|
|---|---|---|
|workspace lock全体|192 package / registry候補188|前回の広い候補。今回も履歴として保持|
|WASM targetのregistry依存|96|`anydoc-wasm`のnormal/build依存。dev依存を除外し、`napi`/`pyo3`なし|
|registry依存の原文/NOTICE等|193ファイル|96件すべてを原文ありとして記録。取得crateアーカイブのSHA-256は固定lock checksumと一致|
|workspace本体の原文|2ファイル|anydoc本体とwasm/LICENSE|

原文未同梱だった`include_dir`/`include_dir_macros` 0.7.4は、crate内`.cargo_vcs_info.json`の`d742c6fffce99ee89da91b934e7ce6fb2a82680c`とworkspace継承宣言を照合。同commitのworkspace Cargo.tomlがversion 0.7.4/MITであることを確認し、同じLICENSEを取得した。アーカイブ内原文とこの補完を記録上で分けた。[固定workspace manifest](https://raw.githubusercontent.com/Michael-F-Bryan/include_dir/d742c6fffce99ee89da91b934e7ce6fb2a82680c/Cargo.toml)、[固定原文](https://raw.githubusercontent.com/Michael-F-Bryan/include_dir/d742c6fffce99ee89da91b934e7ce6fb2a82680c/LICENSE)

[対象依存・原文の全記録](evidence/json-anydoc-target-licenses.json)にはfeatures、checksum、原文の元パス・保存先・hash、補完元、toolchainを保存する。Cargo treeは実ビルドに近い解決結果だが、コンパイルとの完全な同一性や、公開WASMに残るコードの全量を証明しない。metadataはworkspace全体も含むため、公開記録はtreeで選んだ96件だけへ絞った。[Cargo公式tree説明](https://doc.rust-lang.org/cargo/commands/cargo-tree.html)、[metadata説明](https://doc.rust-lang.org/cargo/commands/cargo-metadata.html)

## ELK: 生成元の絞り込み

|直接確認した事実|証拠・判断|
|---|---|
|elkjs 0.9.3の固定commit|`a8304cf79fde75bc2ab1a89d28320f53f8637436`。公開worker JSはインストール済み版とhash一致|
|ELK 0.9.1のtag|`62d5909f96fad541bc101ad52dabaece6b7eab7e`|
|リリース説明にある#955|merge commit `7ca51784e42a24201f29bc13e458728b6fc61cdc`。生成対象source roots内の差分はNodeContext.javaとNodeSizeCalculator.javaの2ファイル|
|公開worker JSの特徴|topdownLayoutの取得、width/heightで既存サイズと最小サイズのmaxを取る3点を確認。#955の修正と整合|
|elkjs commit時刻直前のELK側候補|`9bc93474e1dc649450e8c97abb45d16b7c88e35b`。#955からの差分3commitはmetacompiler側で、build.gradleの直接source roots内の差分は0。2つのJavaファイルもhash一致|

したがって「0.9.1＋#955相当の直接実装ソース」という特定は進んだが、7caと9bc等のどれを実際にcheckoutしたかは断定しない。生成日時がcommit日時と同じとも仮定しない。CIのmaster参照、外部metacompilerのSNAPSHOT、GWT等の取得依存があるため、完全な編集用ソース/生成チェーンの一意な対応は未証明。

一次資料: [elkjsリリース](https://github.com/kieler/elkjs/releases/tag/0.9.3)、[#955](https://github.com/eclipse-elk/elk/pull/955)、[0.9.1→#955比較](https://github.com/eclipse-elk/elk/compare/62d5909f96fad541bc101ad52dabaece6b7eab7e...7ca51784e42a24201f29bc13e458728b6fc61cdc)、[#955→直前候補比較](https://github.com/eclipse-elk/elk/compare/7ca51784e42a24201f29bc13e458728b6fc61cdc...9bc93474e1dc649450e8c97abb45d16b7c88e35b)。[追跡記録](evidence/json-elk-source-trace.json)には固定URL/hash/特徴検査と未確定判定を収録した。EPL原文はelkjsとELKソース候補の2点を収集。

## PDFium: 原文候補の追加収集

固定submoduleは`embedpdf/pdfium@cb29e78f2ba00c9298714d5f4a8bf7765f1e802f`。そのGit treeは5366項目、truncated=falseを確認。LICENSE/AUTHORS・同梱third_partyの原文とREADME.pdfiumの宣言を追い、DEPSで固定されたabseil/brotli/fast_float/freetype/harfbuzz/ICU/libpng/zlib/jpeg-turboの9系統も調査した。合計29原文を保存した。[固定DEPS](https://raw.githubusercontent.com/embedpdf/pdfium/cb29e78f2ba00c9298714d5f4a8bf7765f1e802f/DEPS)、[全取得元・hash](evidence/json-pdfium-source-licenses.json)

WindowsのNodeからAPI取得が失敗し、raw.githubusercontent.comではENOTFOUNDも観測した。同一固定データをPowerShellで取得し、原文取得は公式Nodeコンテナーへ統一して成功した。`node@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205`（Node 24.22.1）。スクリプトは読取専用、書込先はレビュー証拠と原文フォルダーのみ。TLSや保護設定を弱めていない。名前解決差異の根本原因は未確定。

この一覧は保守的なソース/DEPS候補で、GNが実際にリンクした全コンポーネント一覧ではない。前回のviewer tagと配布WASMのhash一致も、DEPSのすべてがWASMへ入った証拠にはしない。完全なGN/リンクgraph、patch/生成物と公開WASMの対応は残件。

## 取得・保存と検証

archive parserはchecksum、切詰め、重複、展開上限、PAX/GNU長名を検査。絶対/親パス、URL解釈を変える文字、Windowsの末尾dot/space・予約名、リンクentryを拒否する。原文bytesを変更せず、読みやすい`.txt`名へ保存し、元パスとの対応をJSONへ記録する。サブディレクトリーの`.gitattributes`で原文`.txt`だけの改行正規化と空白検査を止める。元のCRLF/末尾空白/末尾空行を整形してhashを変えないための限定設定で、製品コードの検査には適用しない。

SL-01～09は9件成功。合成archiveの異常系と、原文226件のbyte数/hash・固定target scope・ELKの事実/候補区分・PDFiumの非SBOM区分をオフライン検査した。元候補188のDS検査とは別系統で、どちらも通常CIではネットワーク調査を呼ばない。ローカルE2Eは未実施。製品/共存試作ランタイム・依存lockは変更しないため調査ユニット/記録/文書検査を選択し、実機の成功へ一般化しない。

|今回の検査|結果|
|---|---|
|SLソース/原文検査|9/9成功|
|既存DS調査ガード|8/8成功|
|既存試作単体|28/28成功|
|文書/ローカルリンク|47文書・160リンク、問題0件|

Git index内の原文226件もmanifestのSHA-256へ照合し、不一致0件を確認した。原文の改行・空白を維持したままコミットする。

失敗の切り分け: crate原文未同梱の2件はデータ問題として検出し、固定VCS/workspace原文で補完した。NodeのPDFium取得失敗は環境問題として分離し、同じ出典をコンテナーで取得した。ELK一意版やPDFiumリンクgraphが不明な部分は、検査不足を成功に置き換えず未証明として残した。

再調査の実行順序とコンテナーの固定方法は[原文収集の再現手順](json-source-license-reproduction.md)を参照する。

## 残件

1. ELK: 実ビルドのcheckout、metacompiler/GWT等の固定版・生成証跡。今回特定した実装相当と一意なビルド元を区別する。
2. anydoc: このtarget解決条件と実公開WASMの対応、全内包物/生成資産の網羅性、配布条件の選択と必要なNOTICE/告知。原文収集そのものは対象96件で完了。
3. PDFium: 実GN/リンクgraphとWASM生成の対応、候補外の追加原文の要否。
4. 実配布時: バンドルと原文/対応ソース/告知の版を一致させ、提供先から到達可能なことを確認。今回は配布・デプロイしない。

Windows実機は引き続きユーザーが別途確認する。本体統合保留、macOS/iOS対象外を継続する。
