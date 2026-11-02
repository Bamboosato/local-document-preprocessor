# 版別ソース・原文アーカイブ（ローカル検証）

2026-11-02。PR #23のhead `56207ebcd00b4fa752c211b2f109501b2cbad2c2` と[配布条件の根拠表](distribution-decision-matrix.md)を基点に、利用者の承認したローカル準備を実施した。現行成果物はGit管理外の `tmp/cur04-local/run-i/` にあり、公開・配布・PR添付の成果物ではない。版ごとのZIP内 `MANIFEST.json` は同梱ファイルの相対パス・byte数・SHA-256・出典・固定版/commit・確認範囲と除外を記録し、各ZIP隣の `.inventory.json` はZIP自身とmanifestを含む全エントリのSHA-256を記録する。manifestの自己hashは循環を避けて外部inventoryに記録する。

## テスト観点・前提

機能: 指定した版・原文・NOTICEを収録し取得先を記録。非機能: 入力が同じ場合の内容/manifest/ZIPの再現、実アプリのPWA資産と分離。データ: 確認済み・候補・未証明、個人パス/秘密、原文とNOTICEの欠落・余分を分離。UI/運用: ローカルパス・提供範囲・不足物を誤認しない。正常系は固定入力と各hash一致、異常系は不正path・symlink・機密らしい値・不一致、中間境界は省略対象と自己hash、状態遷移は独立した2回生成と後日の公開判断を検査する。最優先は、未証明のソース対応を完成品と誤認することと、不要な機密/パスを混入させることの防止。

## 完成したローカル成果物

|ZIP|内容と限界|SHA-256|
|---|---|---|
|`anydoc-wasm-0.1.7.zip`|固定commit `4a45addbd607e8b59f0c263bca26aab228e10370` のソース275ファイル、target候補195原文、npm原文、証跡。公開工程のsource参照と固定source取得物hashは一致。WASM再ビルド・実リンクgraphは未証明|`6eebf106f0f9172c23dc7f6c14105fbc065ec4f2db952278151033ec441b2a50`|
|`elkjs-0.9.3.zip`|固定commit `a8304cf79fde75bc2ab1a89d28320f53f8637436` のソース58ファイル、ELK側候補commit `7ca51784e42a24201f29bc13e458728b6fc61cdc` の2ソース、EPL原文、npm原文、証跡。workerの既存記録hashは一致。ELK側実checkoutと完全生成チェーンは未証明|`1fbd83748e92e19aab1b5ba248590878f9a0a6a28fab91766e4b0f4b0600fe69`|
|`pdfium-2.14.4.zip`|固定commit候補 `cb29e78f2ba00c9298714d5f4a8bf7765f1e802f` のソース5214件のうち5213件、候補原文29件、npm原文、証跡。DEPSとsource内の11原文hashは既存記録と一致。1件を下記理由で除外した部分収録であり、実checkout/GN引数/リンクgraph・WASM再ビルドは未証明|`a4c93c8c9b5159ce96606a819677e4568649b1359beeb637c2d1602dcc0918c4`|
|`npm-production-originals.zip`|固定本番npm依存233パッケージの原文236件とinventory。es-toolkit NOTICE、DOMPurifyのApache/MPL両原文を含む。編集用ソースやWASM完全SBOMではない|`f58b4f6c9f55131ef08e97053fe37b1cbb65cb66d82fdcbc841018b96ea028da`|

取得したsource入力のSHA-256はanydoc `ff221f41802276c857ab7095f9357992865174ed056dc11be9e76baf89216831`、elkjs `850418c89dd35dbd94ea0100a7becbc09d320c153fda4c4ea4a88c67e12121a9`、PDFium `bf288115109f696ec59e39aa3b6c22e55642d5b76916c36b0fd9e362e23021c2`。上流URL・内部ファイルpathと個別hashは各manifestにある。PDFiumのtar hashは今回取得したbytesの識別子であり、WASMをそのsourceだけで作った証明ではない。

## PDFiumの除外と確認範囲

旧 `run-e` は個人ディレクトリ形式のパターンに一致した5ファイルを除外していた。固定commitの取得元tarと旧manifestの各SHA-256を照合したうえで、内容そのものやパス文字列を外部へ出さず、文脈を個別に確認した。元ファイルの出典は表の固定commit raw URLであり、取得元tarも `inputs/` に無改変で保持する。個別raw URLは固定commit・相対pathから記録したもので、今回の個別HTTP到達確認は行っていない。

|固定commit元ファイル|元SHA-256|評価と現行ZIPの扱い|
|---|---|---|
|[.vpython3](https://raw.githubusercontent.com/embedpdf/pdfium/cb29e78f2ba00c9298714d5f4a8bf7765f1e802f/.vpython3)|`446634b5c55220659919f7101eb65c40d638ab92dd65c8910bf17fecc26779dc`|一致は公開文書URLの一部で、個人パスの誤検出。無改変で収録|
|[cpdf_filespec_unittest.cpp](https://raw.githubusercontent.com/embedpdf/pdfium/cb29e78f2ba00c9298714d5f4a8bf7765f1e802f/core/fpdfdoc/cpdf_filespec_unittest.cpp)|`3689ed64a9419213025763640fb3ca85a050f8202d463ceee194bb326c253db5`|2一致は単体テスト内の引用されたファイルパス変換用文字列。無改変で収録|
|[feature_linearized_loading.pdf](https://raw.githubusercontent.com/embedpdf/pdfium/cb29e78f2ba00c9298714d5f4a8bf7765f1e802f/testing/resources/feature_linearized_loading.pdf)|`cac0e426dda4b4cc710b41ef7ec8a50974b3016d52e273745ca5e57ac5de62a0`|XMP内のローカルパス形式で、実在情報かサンプルか不明。除外を維持し、元path/hash/理由だけをmanifestに記録|
|[weblinks.in](https://raw.githubusercontent.com/embedpdf/pdfium/cb29e78f2ba00c9298714d5f4a8bf7765f1e802f/testing/resources/weblinks.in)|`604dcfc004ce67c16db9586255404207e8d6841c592f8403e6b851b1bad894ef`|`example.txt` を含むfile URIの合成fixture。無改変で収録|
|[weblinks.pdf](https://raw.githubusercontent.com/embedpdf/pdfium/cb29e78f2ba00c9298714d5f4a8bf7765f1e802f/testing/resources/weblinks.pdf)|`158f3335cb1f0b56b0b0873168267c89bf55c2b9a4f7ff1b6f1229b9859dc402`|同じ合成file URIのfixture。無改変で収録|

新旧ともローカル成果物。例外はPDFium固定commit・正確な相対path・上記SHA-256の一致に限定し、他の個人パス形式や変更されたbytesには適用しない。秘密情報パターン検査も維持する。旧 `run-e/pdfium-2.14.4.zip` のhashは `9b29ff5d53b051adc9dd77a47f89851d8cd6555c8650257551e067181c85d814`。新 `run-i` は4ファイルを追加し、残り1件を除外、既存の全ファイルbytesは不変（manifestとZIP hashは更新）である。他の3 ZIPのhashは旧版と同一。いずれもWASMに対応する完全なソースや配布条件の充足は証明しない。

## 再現・安全性・配布境界

- Windows、Python 3.14.2、zlib 1.3.1.zlib-ng。旧 `run-e`/`run-f` の再現を保持し、今回の再評価後は `run-i`/`run-j` を同一入力から直列生成して4 ZIP・4 inventoryが完全一致した。ZIPは固定時刻・順序・権限・圧縮条件を使用する。別Python/zlib環境でのZIP byte一致は未検証。これはアーカイブ化の再現であり、WASMやELKの再ビルドではない。
- `python tmp/cur04-local/verify.py --first run-i --second run-j --profile reviewed` はZIPのCRC・全ファイルhash・manifest/外部inventory、source入力と収録/除外の対応、収集済み原文、NOTICE・MPL原文、npm lock/公開WASM、パス/シンボリックリンク/大文字小文字の衝突/秘密らしい値の合成異常系、GitとPWAの除外を検査し成功した。例外対象のcommit、pathまたはbytesを変更すると適用されない異常系と旧ZIPとの差分も確認。旧 `run-e`/`run-f` は `--profile legacy` で別途検査した。
- 受け付けるパスは相対・正規化済みとし、`..`、絶対/ドライブ/逆slash、制御文字、Windows予約名、重複（大文字小文字を無視）、symlink、`.env`、秘密鍵らしいファイル名を拒否する。取得sourceと収集原文は公開固定入力に限定し、既知の秘密鍵/token形式と個人ディレクトリ形式を走査した。パターン検査は未知の秘密を完全に検出する保証ではない。
- ZIPは `tmp/` 下で `.gitignore` 対象。`dist` 外にあり、公開manifestとSW埋込みmanifestのいずれにも含まれないことを検査した。上流のbuild script、PWA更新、本番配信、実機やブラウザー自動化は今回実行していない。

## 未完・判断

ELKの完全生成元、anydoc/PDFiumのWASM実リンク内容、PDFiumの除外1件を含む完全な対応ソース、外部配布条件の充足は未証明。配布形態・対象版・原文/NOTICE/対応ソースの提供先、実配信の到達性と公開承認は[判断表](distribution-decision-matrix.md)に従い別途決める。ローカルZIPをそのまま配布してよいと判断しない。macOS/iOS対象外、Windows実機はユーザー別途。
