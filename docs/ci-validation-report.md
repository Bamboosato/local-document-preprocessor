# CI導入検証

実施日: 2026-10-07（Asia/Tokyo）

## 変更と前提

依存脆弱性の検出5件を、Vitest / mocker 4.1.10→4.1.11、nanoid 3.3.17→3.3.20、source-map-js 1.2.1→1.2.2、undici 7.29.0→7.30.0で解消。関連するVitest依存を含む計14パッケージを更新し、すべて開発依存であることをlockfile差分で確認した。anydoc / PDFiumと製品依存のバージョンは維持する。

監査・監査ポリシーテスト・E2E対象選定とそのテスト、GitHub Actionsの `Verify` を追加。本番・全依存の脆弱性1件以上、取得失敗・timeout・不正応答・件数不一致を失敗扱いにし、例外は設けない。CI設定とテスト観点は [導入仕様](ci-configuration-proposal.md) を参照。

## 検証結果

| 検証 | 結果 | 実施範囲 |
| --- | --- | --- |
| ローカル監査・対象選定テスト | 成功 | 12ケース、正常・異常・境界・状態遷移 |
| 本番・全依存監査 | 成功 | 両方0件、例外なし |
| ローカルUnit / Component | 成功 | 14 files / 63 tests |
| TypeScript / build / check:dist | 成功 | 両WASM、Worker、PWA、5ライセンス |
| ローカルChromium E2E | 成功 | 全14件、1 worker、production previewポート4191、新規context |
| GitHub Actions / Linux | 確認待ち | PR更新後に実行結果を記録 |
| main必須チェック登録 | 確認待ち | Verify成功後に設定 |

ローカルはWindows / Node.js 24.13.0。サンドボックスではNodeテストランナーの子プロセス起動が `spawn EPERM` で制限されるため、検証は許可された制限外実行で行った。製品不具合とは分類しない。

## E2E範囲の選定

今回のみChromium全14件を選ぶ。lockfileとVitest系間接依存、初のLinux CI経路、CI対象選定を変更するため、WASM・PDF品質・範囲選択・PWA・UIを横断して確認する。全件を毎回の既定にはせず、通常のPRは変更ファイルから選定する。テストは合成fixture、新規ブラウザcontext、production preview、`workers: 1`、再試行0で直列実行する。

週次監査は監査とポリシーテストだけで、変換E2Eは実施しない。文書のみのPRでも監査とUnit / build / 成果物検査を実行し、E2Eは未実施と記録する。

## 未実施範囲と残存リスク

- Edge / macOS Safari / iPhone Safari実機、実機インストール、オフライン、SW更新競合、大容量・低メモリは対象外。
- npm auditは既知のnpm勧告を検証する。同梱WASMを含むすべての安全性や全文完全一致を証明しない。
- Linuxでの成功はWindowsやSafariのすべての動作保証ではない。原本照合と実機ゲートを維持する。
