# 配布準備の一括整理と内部作業の終了

2026-11-11。ユーザー承認により、調査を増やし続ける運用を終了し、[現行完了台帳](distribution-closeout-register.md)を正にする。PR #46を更新し、新PRの乱立・マージ・公開・添付・デプロイは行わない。macOS/iOSは対象外、実機はユーザー別途。

## 今回閉じた範囲

既存の収集・出典照合・内容版比較・ローカル機能確認はC-01〜08として閉じた。未記録の借用tag、完全なWASMリンクgraph、完全再ビルドの一意性だけを独立した停止条件として追跡しない。具体的な適用条件に必要な証拠が不足する場合はE-01/U-03の判断資料に記録する。

原文・NOTICEの提供不足は内部作業W-01、通常条件・特殊条件の告知案をまとめる作業はW-02として一括で実施した。工程を閉じることと、全ライセンス条件の充足や公開承認を明確に分ける。

## 固定集合と条件別の処理

[一括評価台帳](evidence/distribution-closeout-assessment.json)に、anydocの96 registry候補とworkspace1単位、PDFium22グループの計119単位を列挙した。原文はanydoc193＋workspace2＋PDFium29＋追加4＝228点、1,111,370 bytes。過去原文を上書きせず、既存固定hashを全件再照合してコピーする。独自の貢献表示案1点も追加する。

|条件準備|対象/扱い|
|---|---|
|MIT|anydoc89組。元の条件式と全代替原文を保持し、該当する権利・許諾・免責を削らない|
|Apache-2.0|anydoc ryu/zopfliの2組。原文、供給されたNOTICE、変更表示の扱いを記録。sourceとobjectの条件を混同しない|
|MIT/Apache両条件の準備|fnv/rangemapの2組。原文のslash式をAND/ORへ書き換えず、両原文・条件の準備を保持|
|複合条件|encoding_rsはMIT＋BSD系、unicode-identはMIT＋Unicode、zlib-rsはZlib。複数条件を標準MIT一つに丸めない|
|workspace|anydocとwasm bindingのMIT原文2点を別資料として保持|
|PDFium通常条件|root、abseil、brotli、fast-float、harfbuzz、libpng、zlib、agg23、bigint、fp16、highway、lcms、OpenJPEG、LibTIFFを各原文の許諾・権利・免責に対応。bigintのpublic-domain表明をMITへ再分類せず、LibTIFF等の固有条件も保持|
|PDFium特殊条件|FreeTypeのFTL準備選択とbinary貢献表示、IJG/TurboJPEG/SIMDの条件、ICUの複合原文、NotoのOFL、Android BSD、LLVM例外を個別に保持。GPL/Boost等の代替原文の保持を自動的な選択や累積適用とはしない|

条件判断の参照は既存の固定原文・条件表と、[Apache原文4節](https://www.apache.org/licenses/LICENSE-2.0)、[MIT原文](https://opensource.org/license/mit)、[OFL原文](https://openfontlicense.org/open-font-license-official-text/)。app自身は公開2 WASMのbytesを変えていない。これは供給元が入力を無改変だったという主張ではなく、上流の変更を未確認のまま無変更扱いにしない。既存JSの加工表示やTinyの原文は維持する。

## 実際の提供と境界

第三者ライセンスに119単位ごとの元の条件式（存在する場合）、準備条件、個別の確認事項と228原文を掲載し、FreeType Team/IJGの貢献表示案にも到達できるようにした。原文と供給NOTICEを一括してオフライン収録する。各単位の出典集合・サイズ・hashと宣言式/準備選択をビルド時に照合し、欠落・改変・WASM版違い・単位の取り落とし・条件式の書換えを拒否する。

大量に収録したから条件を満たすとは判断しない。対象集合はsource/DEPS候補であり完全SBOMではない。台帳/画面とも配布承認ではないと明示する。W-02は条件レビューと告知案の準備まで完了し、正式な適用・採用判断はU-03へ渡す。確認済みの部分を再度の自主調査へ戻すには、新しい具体的証拠が必要。

## 残す案件と停止条件

- E-01はMM2フォントの輪郭由来、findfont原本、コメント保持条件の一案件。従来の3論点のhash/質問をそのまま判断資料として使い、同じ原典や履歴を再調査しない。新しい一次資料・提供元の回答・別許諾が得られたときだけ再開する。外部への送信はしていない。
- U-01はユーザーのWindows実機、U-02は許可後の実配信検証、U-03は責任者の最終適用・公開判断。これらを内部作業の未完数に混ぜない。macOS/iOSは対象外。
- 内部の準備作業は今回の固定集合について終了。新しい具体的不備が検出された場合だけ、対象版・影響・担当・完了条件を伴う項目として扱う。公開可否を保留したまま、調査PRやCI件数だけを増やし続けない。

## 検証範囲

事前観点は[台帳の観点表](distribution-closeout-register.md)に定義した。新しい原文ゲートは全119単位・228原文/告知案の正常提供、欠落/改変、誤った宣言式、取り落とし、WASM変更、復元後の成功を一つの逐次fixtureで検証する。法的適合を自動判定するテストではない。

ローカルE2Eは原文導線とPWA変更に対応する1件を選択。全件/他ブラウザー/実配信/実機はローカル未実施。検証の最終値は[記録](evidence/distribution-closeout-validation.json)を参照。実行資産7件のhashは引き続き不変で、文書変換の処理や依存版を変更していない。


実施結果: 原文ゲート6ケース、型/build/配布物検査に成功。PWA対象1件はChrome 157.0.8103.50、逐次、失敗/skip/再試行0で228原文と告知案の全hashを確認。HTTP474資産の不一致0、新PWA世代045e2b8de3ab54b323e424e4。通常本番/全npmとTiny67対象監査は全重大度0。固定原文228点はGit内のbytesとも一致し、Windows/Linuxで原文bytesを維持する属性を追加した。実行資産7件のhashは不変。ローカル全件/他ブラウザー/実配信/実機は未実施。最終CIはPRの固定head/runへ記録する。
