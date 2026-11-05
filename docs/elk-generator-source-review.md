# ELK 生成器ソース候補の比較とローカル準備

2026-11-05、PR #37 マージ後の main `37ec3d3b09624a7efe53e8faa3ba4fa2560bac27` を基点とする。直接ソースが一致した ELK 候補 `7ca5178` と `9bc9347` の生成器関連ソースを比較し、候補ごとに分けてローカル検討用資料を準備する。実ビルド時 checkout、実際の SNAPSHOT artifact や対応ソースの法的な範囲を確定するものではない。アーカイブの公開・添付、デプロイは行わず、実機はユーザー別途、macOS/iOS 対象外。

## 先に定める検証観点

最優先は、異なる候補の生成器を混在させて実際の入力と誤認すること、欠落や不正な入力を正常と扱うこと。機能は commit・tree・生成器候補の対応、非機能はローカル再生成と出力境界、データは版・hash・差分・権利表示・個人情報らしい形式、UI/報告は確認済みと未証明を区別する。正常は固定 tree と全 blob 一致、異常は改変・欠落・別 root・上書き、境界は2候補で異なるファイルと生成器本体/UI、状態遷移は候補取得→照合→提供範囲判断を分ける。上流コードの実行・アーカイブ公開はしない。

## 差分と対応の限界

以前の[直接ソース比較](elk-generation-input-review.md)では、11領域658ファイルは2候補で一致し、その他には生成器関連の3ファイル差があった。今回、固定 source を照合した結果、`9bc` 側は `MelkUniqueClassNameValidator` の追加と、それを runtime/UI モジュールへ結び付ける変更だった。これにより生成器の検証処理が異なり得るが、生成結果が実際に変化するかはビルドしておらず未確認。

両候補の `org.eclipse.elk.core.meta/pom.xml` は同一 SHA-256 `5b7c0acd3504c7d72f060e451af63f526229ceba88715234e7146451e6eaf7b` で、いずれも `org.eclipse.elk.core.meta:0.10.0-SNAPSHOT` を記載する。elkjs build.gradle の参照と名称・版が整合する一方、**同じ SNAPSHOT 表記でも実際に取得された artifact bytes と source commit の対応は証明できない**。UI 領域を含めたのは比較用であり、実際の headless ビルドで使われたと主張しない。

## ローカル検討用の候補

|候補|追加した生成器関連|全エントリー|ローカル ZIP SHA-256|
|---|---|---|---|
|`7ca`|core.meta 64件・core.meta.ui 32件|819|`3601462dae22c47207e0e3af80cb5dd07c967409f686707cf2edec0ca90463b2`|
|`9bc`|core.meta 65件・core.meta.ui 32件|820|`59752fec2cd75554f312a67cca05c41ad56a32116c9179858b173f7c3b114051`|

それぞれの候補に既存の11直接領域など共通722件をそのまま保持し、生成器関連は候補 commit ごとに分けた。各 variant を同一入力・同じ Windows Python/zlib 環境で別名に2回生成し、各組の SHA-256 が一致。独立した読取りで manifest・CRC・全ファイル hash、対象 variant の全 blob、共通722件の bytes 不変と候補数を確認した。`7ca` と `9bc` の ZIP は別の候補であり、選択済みの対応ソースや実行可能なビルド環境を意味しない。

`7ca` の取得 tar は上流 tree の2,111ファイル・32,302,500 bytes、`9bc` は2,112ファイル・32,304,762 bytes と全 blob が一致。`9bc` tar の SHA-256 は `0407f76021af5b72dd002cb914a2b892beb8e8a1963afcb9abda38a80513cba3`。両生成器領域には、既存の秘密情報/ローカルパス形式パターンで一致はなかったが、安全性・権利表示の完全な検査ではない。

`python scripts/build_elk_generator_candidate.py <7ca|9bc> elkjs-generator-review-<同じvariant>-<新しい名前>.zip` は固定入力 hash、上流 tree、出力先・上書き・パス・既知パターンを検査して `tmp/elk-generator-review-9bc/` だけに新規出力する。両 tar・各 commit/tree JSON と以前の11領域 ZIP が必要。アーカイブは展開せず、公開も行わない。

## 検証と残件

候補 root をコミットごとに切り替えられるよう既存 tree 検証を拡張し、別 root・未知 variant・variant と出力名の不一致・出力先・上書き・入力 hash 不一致などの異常系を追加。既存テストを含む合成15件が成功した。両元 tar と上記2候補 ZIP はローカルの Git 管理外であり、PR に含めない。文書・ローカル準備スクリプト・CI 設定のみのため、ローカル E2E は未実施。

実際の SNAPSHOT artifact の由来・ビルド時 checkout・生成結果との対応、必要な source と権利表示の範囲は未確定。次は公開工程の固定資料や artifact による対応根拠の有無を調べ、得られない場合も未証明を明示して必要な提供範囲を判断する。WASM 候補の条件確認、提供先と案内、実配信・Windows 実機、正式公開は別途残る。

## 2026-11-06 公開証跡の追加確認と提供範囲の判断

|論点|確認した根拠|判断・不足|
|---|---|---|
|elkjs の版|[0.9.3 リリース](https://github.com/kieler/elkjs/releases/tag/0.9.3)は `a8304cf`、ELK 0.9.1 基準と未リリースの修正 #955 を記載。[release API](https://api.github.com/repos/kieler/elkjs/releases/tags/0.9.3) の追加 assets は0件|elkjs のタグを特定できるが、実行された ELK checkout や生成器 artifact の特定にはならない。自動生成ソースアーカイブは実行ログではない|
|生成器|[固定 build.gradle](https://raw.githubusercontent.com/kieler/elkjs/a8304cf79fde75bc2ab1a89d28320f53f8637436/build.gradle) は Sonatype snapshots と `org.eclipse.elk.core.meta:0.10.0-SNAPSHOT` を参照。両 source 候補の同じ版表記は前節の通り|要求された依存の座標は特定できるが、実際に解決された timestamp・hash・source commit は特定できない。2026-11-06 の調査手段では該当 snapshot metadata にアクセスできず、欠如を断定しない|
|当時の実行記録|[commit 指定の workflow run API](https://api.github.com/repos/kieler/elkjs/actions/runs?head_sha=a8304cf79fde75bc2ab1a89d28320f53f8637436&per_page=100) は取得時点で0件|検索対象は同 commit を head とする GitHub Actions run のみ。手元ビルド、別 commit や別 CI の不存在は示さない。公開 npm の実生成ログや生成器 bytes は確認できていない|
|ELK source の提供対象|[EPL-2.0 原文](https://www.eclipse.org/legal/epl/epl-v20.html) 1条は Source Code を変更に適した形式とし、3.1〜3.3は source 提供・案内、原文同梱、既存表示の維持を規定|配布する EPL 対象 Program の対応する変更可能な source・設定と、原文および既存の権利表示を維持して提供する。11領域や片方の候補 ZIP を完全な対応物と確定できない|
|生成器と外部依存|build.gradle は生成器をビルド時に使用し、GWT・Guava・EMF・Xtext 等も参照|参照だけから、各ツール自体のソース提供義務や配布物への組込みを断定できない。生成済みコード・同梱物と各原文・表示を個別照合し、対応範囲を決定する。両候補を参考として保持することは義務充足の証明ではない|

**結論**: 実ビルドに使われた生成器の実体と、配布物に対応するソース・権利表示の最終範囲は、取得できた公開証跡だけでは確定できない。確定のため、上流管理者が保持する公開 npm 0.9.3 のビルドログ、ELK checkout、解決された snapshot artifact の timestamp/hash・取得元と元 source、同梱物のライセンス情報を入手し照合する。取得できない場合は、必要な範囲を権利者または専門家に確認し、証拠不足のまま公開可としない。外部への問い合わせ送信は行っていない。
