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
