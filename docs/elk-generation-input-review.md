# ELK 生成入力の候補間照合と残る条件

2026-11-05、PR #36 マージ後 main `b431665171a7b6649e71ea7d9c23dc5fb1181641` を基点とする。上流 ELK 候補 `7ca51784e42a24201f29bc13e458728b6fc61cdc` と `9bc93474e1dc649450e8c97abb45d16b7c88e35b` の直接ソースと、ローカル候補 ZIP の対応を比較した。配布可能との判定や上流ビルドの再実行ではない。アーカイブの公開・添付とデプロイは行わず、実機はユーザー別途、macOS/iOS 対象外。

## 観点と前提

最優先で防ぐ問題は、直接ソースの一致だけで生成チェーン全体を完全と判断することと、別版・欠落したファイルを対応物として案内すること。機能は各 build 入力の所在、非機能は再取得可能性と保管の再現性、データは commit/tree/blob・権利表示・候補の区分、UI/報告は確認済み・未証明の区別を確認する。正常は同一パス/bytes、異常は欠落・追加・改変、境界は生成対象外・生成器依存、状態遷移は候補比較→範囲の判断→実提供を分離する。対象ファイルを実行・展開しない。

## 確認結果

|対象|今回の確認|解釈と残件|
|---|---|---|
|ELK の11直接ソース領域|両候補の上流 API の非省略 tree をパスと Git blob SHA-1 で比較。両方658ファイルで追加・欠落・変更0。各 hash は[比較記録](evidence/elk-generation-input-comparison.json)|双方の対象ディレクトリー内の bytes が同じという結果。実際の checkout がどちらか、生成結果が同じかは確定しない|
|ローカル候補 ZIP|上記658ファイル全件を ZIP 内と Git blob hash で照合。elkjs 固定 commit `a8304cf79fde75bc2ab1a89d28320f53f8637436` の tar 内58ファイルも ZIP の `source/` 58件と bytes 一致|候補は限定された検討用。ローカル ZIP を完全な対応ソースとして公開しない|
|領域外の変更|全 tree 比較では3ファイル差があり、すべて `core.meta` または `core.meta.ui` 配下。2ファイル変更、1ファイル追加|11領域に差がなくても生成器関連領域に差がある。[比較記録](evidence/elk-generation-input-comparison.json)の差分は実際に使われた生成器の特定ではない|
|上流の生成設定|[固定 build.gradle](https://raw.githubusercontent.com/kieler/elkjs/a8304cf79fde75bc2ab1a89d28320f53f8637436/build.gradle) は11領域から Java/Xtend/melk を選択・一部除外して前処理し、melk 生成と GWT を経由。`org.eclipse.elk.core.meta:0.10.0-SNAPSHOT` や外部依存を参照|658件をコンパイル済み/リンク済みとは扱わない。snapshot の取得 bytes・実際の生成物・依存版は未固定|
|elkjs の JS build|固定 source の `package.json` は Gradle 後に Babel・Browserify 等を使い、開発依存には範囲指定がある。固定 source tar 内に npm lockfile は見つからなかった|上流の全実行時ツール版がこの source 候補だけで確定したわけではない。実環境・取得元と必要な記録を別途確認する|
|上流 workflow|[固定 CI 定義](https://raw.githubusercontent.com/kieler/elkjs/a8304cf79fde75bc2ab1a89d28320f53f8637436/.github/workflows/ci.yml) は ELK を `master` で取得し、`npm install` と build を実行する定義|実行時点の ELK checkout や依存解決を固定する情報ではない。CI 定義の存在を、この配布物のビルド実行ログと同一視しない|

tree API の commit 指定と commit が参照する tree SHA 指定で同じ一覧が返ることも両候補で確認した。比較は API とローカル bytes に基づく整合で、API の署名検証や実ビルドの証明ではない。ZIP の SHA-256 は `ee19af9f3d3be729584fcfdf4d08a4c860a5d48fcfb1ce840e4849802d83fbc8`。ZIP は Git 管理外のローカル資料であり、本 PR に含めていない。

## 次に必要な判断

1. 11直接領域に加えて、生成器・外部依存・設定のうち、EPL 対象 Program の対応ソースや必要な権利表示に含める範囲を根拠付きで判断する。すべてのツールのソース提供が必須とも、不要とも先に断定しない。
2. 実行資産とソース候補の対応について、公開 release・既存 worker hash・生成条件・未固定入力をまとめ、必要な証拠が不足すれば保留または追加調査する。実 checkout を推測で埋めない。
3. 版別の GitHub Releases に置く対象と案内文を、必要範囲が確定した後に準備する。検証用配信を含め、許可と必要条件を満たすまで公開・添付しない。

## 検証範囲

非省略 tree 2件の対象658ファイルと ZIP の blob、elkjs 58ファイルの tar/ZIP bytes、領域外の差分3件を照合した。文書と静的証拠のみのためローカル E2E は未実施。上流ビルド・生成器の実行、実配信・実機・公開判断は行っていない。WASM 内包物の条件と原文・NOTICE の追加要否も引き続き未完。
