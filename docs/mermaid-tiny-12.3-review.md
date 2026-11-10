# Tiny 12.3.0 修正版候補の照合

> 2026-11-10 現行状況: [本体切替と回帰](mermaid-tiny-12.3-product-cutover.md)をローカルで完了した。本体12.3.0・69原文/75資産・既定67対象監査0件を確認。以下は11月6日の隔離候補調査の履歴であり、本体未切替の記述もその時点の状態。公開承認・実機受入は別途。

2026-11-06。既存Tiny 12.2.0候補と分離して調査する。対象候補の内部依存が修正済みかを先に確かめ、版名だけで採用しない。マージ・デプロイ・アーカイブの公開/添付は行わない。macOS/iOSは対象外、実機確認はユーザー別途。

**Tiny 12.3.0を12.2.0の置換先として採用推奨と判断する。** 公開bundleと固定ソースからの再生成が全bytes一致し、前回指摘された2依存は修正版になっている。追加のMIT表示も補完し、候補の原文・監査・隔離PoCは今回の範囲で合格した。**ローカル本体候補は12.2.0のまま。本体切替・本体回帰・正式公開の受入は未実施**であり、今回の判断と分ける。

## 照合・検証観点

最優先で防ぐのは、npm宣言上の監査0件を内包物の安全性と誤認すること、別の生成元・原文を対応済みとすること。

|観点|正常系|異常系|境界値|状態遷移|
|---|---|---|---|---|
|機能|公開bundleと固定ソース/生成物の対応を確認|版・署名・hash不一致を採用しない|parser生成物の寄与範囲も展開|候補取得→由来照合→採否|
|非機能|隔離取得、install scriptなし、既存候補を保持|取得失敗や不完全な再構築を成功扱いしない|件数・サイズと処理時間を記録|本体依存の更新は採否と区別|
|データ|依存の版・原文・NOTICE・表示・パッチを対応付ける|同名複数版や生成器由来の取りこぼしを防ぐ|候補依存と実出力寄与を区別|監査結果は調査時点を固定|
|UI|採用候補の図とライセンス案内を確認|未確認原文を提供済みと表示しない|既存表示上限と危険文字|対象検証の範囲を選び、実機へ一般化しない|

正常・異常・境界・状態遷移を区別する。証拠は取得元、integrity、bundle/source hash、実行環境とログへの参照を保持する。ブラウザー検証は必要な対象ケースのみ逐次実行し、全件を既定にしない。

## 調査結果と採否

主な証拠は [総合記録](evidence/mermaid-tiny-12.3-review.json)、[内部寄与と原文](evidence/mermaid-tiny-12.3-license-inventory.json)、[差分・原文比較](evidence/mermaid-tiny-12.3-license-comparison.json)、[補足込み監査](evidence/mermaid-tiny-12.3-extended-audit.json)、[PoC受入](evidence/mermaid-tiny-12.3-acceptance-validation.json)。記録したコードhashは調査時点の識別子であり、新しいcommitを作成したものではない。

### 版と生成元

|項目|確認結果|
|---|---|
|公開候補|公式 `@mermaid-js/tiny@12.3.0`。固定tarballとSHA-512 integrityを保持|
|公開JS|2,852,578 bytes、SHA-256 `c41f5236091b83f524c4940f97a16b2b14a76f21ff84aea4fd6b66421d8a2a9a`|
|生成元|署名付きnpm来歴のsource commit `2086904e76c692331e34a45d7cc3bc30860d040e`。subject digestとtarball integrityが一致|
|公開工程|[Release run 41641880995](https://github.com/mermaid-js/mermaid/actions/runs/41641880995)は同commitで完了・成功。[取得記録](evidence/mermaid-tiny-12.3-release-run.json)|
|署名・来歴検査|隔離packageの `npm audit signatures` は終了コード0、invalid 0・missing 0|
|再生成|固定ソースtar、固定lock、pnpm 10.30.3、install scriptを実行しない導入から `build:viz` を実行。公開JSと全bytes一致|
|環境差|Windows/Node 24.22.1/npm 11.19.1。上流指定はNode 24.16.0、公開workflowはUbuntu。入れ子のpnpmもローカルshimで10.30.3に固定した。同じ公開ビルド環境を再現したという主張ではない|

固定ソースtarはSHA-256 `04077bb929196318ead77bb37db35455044705f426d6ca9d527b611000cbf914`。取得の再実行でも一致した。通常ファイル4,363件を検査して配置し、CHANGELOGへのsymlink 1件は展開しなかった。これは文書の差異で、寄与ソースは別途tarと照合した。源流の古いELK生成器を調べ直すことを今回の必須作業にはしない。

### 内部依存とELK

[metafile照合](evidence/mermaid-tiny-12.3-attribution.json)の直接寄与56組だけで止めず、事前生成parserの32出力を再検査して、内部の63 package/version組を特定した。parser再検査の出力不一致は0。Mermaid寄与ソース468、parser寄与ソース65のうち、計530ファイルが固定tarと一致し、生成3ファイルは [Langium CLI 4.4.0・15設定・18文法](evidence/mermaid-tiny-12.3-parser-lineage.json)と対応した。生成3ファイルのhashは前候補と同じ。

|対象|12.2.0候補|12.3.0候補|
|---|---|---|
|DOMPurify|3.4.12|**3.4.17**|
|js-yaml|4.3.0|**4.3.2**|
|その他の第三者寄与|61組|61組とも版・tarball integrity・原文が同じ|
|自プロジェクトのworkspace|Mermaid 12.2.0 / parser 2.0.1|Mermaid 12.3.0 / parser 2.0.1。Mermaid自身の変更もあるため、第三者依存の差分2組だけが全コード差分ではない|

elkjsは解析時の解決候補に1入力あったが、**出力寄与0**。ELK名を含む自プロジェクトのファイルに対応する30 bytesは、公開JSと一致するsource map付き再生成で `var Xre=A(()=>{"use strict"});` という空の初期化枠と確認した。文字列検索だけでELK不在と判断していない。旧版・既公開版の証跡と義務を遡って消すものでもない。

### 原文・権利表示・パッチ

固定lockのintegrityを使って65 npm tarballと固定source/由来原文をクリーン再取得し、基礎材料249ファイルを照合した。[取得計画](evidence/mermaid-tiny-12.3-material-retrieval-plan.json)には対象版・出典とファイルhashを固定した。更新されたDOMPurify/js-yamlも新しいtarballから取得したうえで、従来の**原文68点は全bytesが同じ**と確認。古い版の原文を無検査で流用した結果ではない。

MIT・ISC・BSD-3-Clause・Apache-2.0等の条件式は前候補と同じ。DOMPurifyはApache-2.0を選ぶ準備方針を維持し、MPL原文も保持する。khromaはmanifestのlicense未記載を原文MITで補足する。fastdom/roughjsの上流パッチ2点と、Langium CLIの参考MIT原文も前候補と同じbytes。Jekyll・js-sequence-diagramsに関係する現在の寄与ファイルも前候補と同じbytesなので、[既存の由来原文候補と権利表示](evidence/mermaid-tiny-12.3-source-origins.json)を保持する。歴史的取込checkoutを一意に復元したという意味ではない。

ただし、原文のhash一致だけでは閉じなかった。[表示走査](evidence/mermaid-tiny-12.3-notice-audit.json)で、DOMPurifyの出力に **regenerator-runtime / Facebook / MIT** とする新しい表示を見つけた。これを独立npm `regenerator-runtime` の組込みと決めつけず、[DOMPurify固定commitの配布ファイルとlock](evidence/mermaid-tiny-12.3-dom-helper.json)へ遡った。

- npmのDOMPurify 3.4.17配布ファイルは、Git head `a77a3e78b59f72fa4d1c83f22e121ad9cc7d3575` の `dist/purify.es.mjs` と全bytes一致。
- 同commitのlockは **@babel/helpers 7.29.10** を固定。配布ファイルに `_slicedToArray` 等の生成helperを観測した。
- 固定helper tarballのintegrityを検査し、Sebastian McKenzieおよびFacebookの表示を含む **MIT原文1,189 bytes** を追加。原文hashは `4be9d87b56a306293223b490c0d0b245e9e94f39884147bf051a6c7b825aeb30`。
- DOMPurify内にある元の表示も `source-notices.txt` と公開JS内に保持する。Babelの実行バイナリや歴史的な生成処理を一意に証明したとはしない。版対応の根拠は固定release lockと一致する配布ファイルである。

最終候補は**69原文、ライセンス関連75資産**。[候補一覧](third-party-source-licenses/mermaid-tiny/12.3.0-candidate/index.html)と原文はローカルのレビュー資料として保存した。本体の第三者ライセンスへの接続は次段階。候補一覧は配布条件の最終承認を示さない。

### 脆弱性監査

第三者寄与の63組は同名複数版をnpm aliasで保持して照合し、**指摘0**。さらに、Mermaid/parser/Tiny自身の名義と、追加のBabel helper対応版を加えた [67対象の監査](evidence/mermaid-tiny-12.3-extended-audit.json)でも、info/low/moderate/high/criticalはすべて0だった。[監査対象](evidence/mermaid-tiny-12.3-audit-scope.json)と [監査用metadata](evidence/mermaid-tiny-12.3-extended-audit-plan.json)を保存した。

旧12.2.0を同じ処理で照合すると、前回の2依存の指摘が残る。新候補の0件は例外追加・指摘除外・自動 `audit fix` によるものではない。調査時点の公開advisoryとの版一致検査であり、未知の脆弱性や本アプリでの全攻撃経路がない証明ではない。Babel/parser等の名義を照合したことは、それらのnpm package全体が同梱されたという主張でもない。

再確認コマンド（リポジトリー直下）:

```powershell
npm run audit:tiny -- docs/evidence/mermaid-tiny-12.3-audit-scope.json docs/evidence/mermaid-tiny-12.3-extended-audit-plan.json .security-audit/tiny-12.3-review.json
```

**本体候補がまだ12.2.0なので、引数なしの既定監査・CIゲートは引き続き不合格になる。** この候補調査で本体やGitHub CIが合格したとは表示しない。GitHubへの投稿・push・CI実行はしていない。

### 対象検証と未実施範囲

|範囲|結果|
|---|---|
|再生成・由来|公開JS全bytes一致、parser 32出力一致、530ソース一致、生成3ファイルの由来を照合|
|材料|基礎249ファイルの再取得と照合、追加helper MIT原文を固定tarballから取得|
|異常系・境界|取得処理の10テスト成功。追加helperの改変原文は配置前に拒否し、成功済み75資産が変化しないことを確認|
|隔離PoC|build→原文準備→helper補完→境界/描画→UI/Worker/安全性→異内容世代→原文→更新回復の **8工程すべて成功**|
|オフライン|69原文、権利表示、生成器参考、パッチ2点のリンク・hash一致。別オリジン要求なし。79静的資産で更新失敗・旧タブ維持・新世代のオフライン描画を確認|

E2Eの選択は**隔離PoCの対象ケースのみ**。原文だけでなくMermaid自身にも変更があるため、ラベル/親子辺、選択・図/ソース・コピー代替/保存、200ノードと実生成50 KiB境界、Worker故障・取消・再試行、安全性と異内容PWA世代を実行した。実ブラウザーはWindows上のChrome headless 156.0.8078.81。実OSクリップボード、別ブラウザー、実配信・実機受入は行っていない。本体E2E 33件は前段階の12.2.0の記録であり、12.3.0の本体受入へ流用しない。

最初の隔離fixture準備はディレクトリー接続の権限制限で未完となった。未完領域を使わず、新規領域を権限を確保して準備してから成功を記録した。これを候補ライブラリーの不具合としない。原文補完前の7工程成功は先行記録として保持し、最新の受入記録は追加MIT原文を含む8工程を正とする。

## 採否と次段階

候補調査の範囲では**12.3.0の採用を推奨**する。必要な追加MIT原文を補完し、前候補の監査指摘を修正版で解消できたため、旧12.2.0を使い続ける案より妥当と判断した。次は以下を一組として進める。

1. ローカル本体のTiny固定版・lock・bundle hashを12.3.0へ更新する。
2. 原文69点と表示・パッチ・参考資料の75資産を製品用スナップショットへ移し、helperとMermaid/parser名義を含む監査を既定ゲートへ接続する。
3. 原文導線とPWA manifestを同時更新し、本体JSON/混在キュー/実WASMの影響箇所、開発Worker、旧公開版相当→新候補の世代移行を対象に回帰する。
4. 最終candidate commit/生成物を固定してレビューする。Windows実機・許可された実配信先の受入、anydoc/PDFiumの別条件は引き続き必要。

今回は本体切替・マージ・デプロイ・アーカイブの公開/添付を実施していない。公開可否は [配布準備方針](distribution-adopted-policy.md)の条件と分けて判断する。
