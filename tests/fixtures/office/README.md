# Office range fixtures

個人情報を含まない、範囲選択回帰用の最小 Office fixture。

- `three-slides.pptx`: `SLIDE_ONE_ONLY` / `SLIDE_TWO_ONLY` / `SLIDE_THREE_ONLY` を各スライドに配置。
- `three-sheets.xlsx`: `SHEET_ONE_ONLY` / `SHEET_TWO_ONLY` / `SHEET_THREE_ONLY` を各シートに配置。2番目は非表示シート。

テストでは選択範囲内の文字列が Markdown / plain text に存在し、選択範囲外の文字列が存在しないことを検証する。fixture は Microsoft Office 互換 OOXML として生成し、外部参照・マクロ・実データを含まない。
