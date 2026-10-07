# ADR-0004: PWA の静的アプリ資産だけをキャッシュする

- 状態: Accepted（既存実装の文書化）
- 記録日: 2026-10-06
- 実装根拠: `69d48bb` / PR #3、`public/sw.js`、`src/main.tsx`

## Context

初期文書は Cache API / Service Worker 自体を禁止していたが、PR #3 で PWA の静的資産キャッシュを導入済みである。文書・結果・履歴・設定を保存しない製品境界と、アプリ資産の保存を明確に分ける必要がある。この ADR は現行コードを記録し、新たな保存機能を追加するものではない。

## Decision

- production の load 後だけ `/sw.js` を登録する。manifest は `standalone`、ルートの `start_url` / scope と 192px / 512px アイコンを持つ。
- Cache API の `ldp-static-v1` は、同一オリジン・クエリなし GET の `/`、`/index.html`、`/manifest.webmanifest`、`/assets/` 直下、`/ldp_icon*.png` のコード上の許可パターンだけを扱う。
- install では HTML / manifest / アイコンを事前保存する。JS / CSS / Worker / WASM は取得時に保存する。HTML / manifest はネットワーク優先、その他はキャッシュ優先とする。
- activate で現在のキャッシュ以外の `ldp-static-*` を削除し、他用途のキャッシュは削除しない。
- 文書、結果、履歴、設定、POST 等の本文、クエリ付き URL、外部オリジンをキャッシュしない。localStorage / sessionStorage / IndexedDB は使用しない。
- SW 登録失敗はオンラインのアプリ起動を妨げない。利用者のコピー／ダウンロードは明示的な出力操作として扱う。

## Consequences

- 「保存なし」は文書と結果の非保存を指す。アプリの静的資産はブラウザに残り、UI の「すべてクリア」では消去しない。
- 初回起動だけでは遅延取得 WASM が揃わず、オフライン変換を保証できない。キャッシュ消去、更新、端末の容量制限も影響する。
- 現行の URL は `/` 固定である。サブパス配信には Vite `base`、SW 登録・許可パターン・事前保存 URL、manifest とアイコン参照の修正・検証が必要である。
- 自動検証は成果物検査と Chromium の manifest / active SW / キャッシュ URL / クエリ除外まで。オフライン変換、更新競合、端末インストール、Safari 実機は別ゲートである。

## Alternatives

- 文書のキャッシュや履歴復元は、非保存要件に反するため対象外とする。
- Cache API / Service Worker の全面禁止は、導入済み PWA の実態を表さないため現行要件から改める。
