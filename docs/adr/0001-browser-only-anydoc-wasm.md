# ADR-0001: ブラウザ内 anydoc WASM 変換と Worker 隔離

- 状態: Accepted
- 日付: 2026-08-07

## Context

機密文書を外部へ送らず、静的 Web アプリとして Markdown / plain text に変換する必要がある。OCR と PII 処理は本製品の責務ではない。anydoc の WASM API は同期呼び出しであるため、メインスレッドで実行すると UI を停止させる。また、anydoc の更新が UI 全体へ伝播しない依存境界が必要である。

## Decision

- `@firecrawl/anydoc-wasm` を完全にブラウザ内で使用する。
- `AnyDocConverter` だけが anydoc を import し、アプリ固有の `Converter` 契約へ変換する。
- Converter は Web Worker 内でのみ生成する。
- Worker は最初の変換時に動的 import と `init()` を行い、以後再利用する。
- 上記初期化時点は anydoc のもの。PDFium は後続の範囲選択実装により PDF 構造確認から使用する。両エンジンとも Worker 内でのみ初期化する。
- 複数ファイルは UI 側オーケストレータが逐次 `convert` する。
- キャンセルは cooperative cancel ではなく Worker の `terminate()` と即時再生成で保証する。
- plain text は anydoc へ再入力せず、Markdown AST から決定的に生成する。
- 原本との意味的完全一致は自動証明できないため、成功状態にも品質警告を持たせる。

## Consequences

### 利点

- 入力バイトと変換本文をアプリから外部サービスへ送信しない。コピー／ダウンロードは利用者の明示操作で行う。静的資産キャッシュの範囲は ADR-0004 に従う。
- UI 応答性とキャンセルの確実性を保ちやすい。
- anydoc API 変更の影響範囲が Converter に限定される。
- Markdown と plain text の対応が再現可能になる。

### 制約

- Worker ごとに WASM 初期化コストとメモリを要する。
- キャンセル直後の新 Worker は次回変換時に再初期化される。
- OCR がないため画像のみ PDF は変換できない。
- Type0 / ToUnicode 欠落等による意味的欠落は ADR-0002 の独立抽出比較と原本照合で管理する。

## Rejected alternatives

- サーバー変換: 製品のデータ最小化要件に反する。
- メインスレッド上の WASM: 同期 API により UI が停止する。
- 複数 Worker の並列変換: メモリピークと端末差、実行順不定を増やす。
- OCR の追加: 責務外であり、サイズ・精度・プライバシー検証範囲を拡大する。
- anydoc 成功を完全性判定に使う: 文字欠落を見逃すため採用しない。
