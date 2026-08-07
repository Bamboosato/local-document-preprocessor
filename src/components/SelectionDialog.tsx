import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DocumentInspection,
  DocumentSelection,
} from '../converter/contracts';

interface SelectionDialogProps {
  fileName: string;
  inspection: DocumentInspection;
  selection: DocumentSelection;
  onCancel: () => void;
  onConfirm: (selection: DocumentSelection) => void;
}

function selectionIsValid(
  selection: DocumentSelection,
  inspection: DocumentInspection,
): boolean {
  if (selection.mode === 'all') return true;
  if (selection.mode === 'range') {
    return (
      inspection.supportsSelection &&
      inspection.totalUnits !== undefined &&
      Number.isInteger(selection.start) &&
      Number.isInteger(selection.end) &&
      selection.start >= 1 &&
      selection.end >= selection.start &&
      selection.end <= inspection.totalUnits
    );
  }
  const available = new Set(inspection.sheets.map((sheet) => sheet.name));
  return (
    inspection.selectionKind === 'sheets' &&
    selection.sheetNames.length > 0 &&
    selection.sheetNames.every((name) => available.has(name))
  );
}

function allLabel(inspection: DocumentInspection): string {
  if (inspection.selectionKind === 'slides') {
    return `すべてのスライド（${inspection.totalUnits ?? 0}枚）`;
  }
  if (inspection.selectionKind === 'sheets') return 'すべてのシート';
  return `すべてのページ（${inspection.totalUnits ?? 0}ページ）`;
}

export function SelectionDialog({
  fileName,
  inspection,
  selection,
  onCancel,
  onConfirm,
}: SelectionDialogProps) {
  const [draft, setDraft] = useState<DocumentSelection>(selection);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const valid = useMemo(() => selectionIsValid(draft, inspection), [draft, inspection]);

  useEffect(() => {
    headingRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const selectSpecific = () => {
    if (inspection.selectionKind === 'sheets') {
      setDraft({
        mode: 'sheets',
        sheetNames:
          selection.mode === 'sheets'
            ? selection.sheetNames
            : inspection.sheets.map((sheet) => sheet.name),
      });
      return;
    }
    setDraft({
      mode: 'range',
      start: selection.mode === 'range' ? selection.start : 1,
      end: selection.mode === 'range' ? selection.end : (inspection.totalUnits ?? 1),
    });
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="selection-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="selection-dialog-title"
      >
        <p className="eyebrow">CONVERSION SCOPE</p>
        <h2 id="selection-dialog-title" ref={headingRef} tabIndex={-1}>
          変換範囲を選択
        </h2>
        <p className="dialog-file">{fileName}</p>

        {inspection.selectionKind === 'document' ? (
          <div className="document-scope-notice">
            <strong>文書全体を変換します</strong>
            <p>安定したページ境界を取得できないため、ページ指定には対応していません。</p>
          </div>
        ) : (
          <div className="scope-options">
            <label>
              <input
                type="radio"
                name="scope"
                checked={draft.mode === 'all'}
                onChange={() => setDraft({ mode: 'all' })}
              />
              {allLabel(inspection)}
            </label>
            <label>
              <input
                type="radio"
                name="scope"
                checked={draft.mode !== 'all'}
                onChange={selectSpecific}
              />
              {inspection.selectionKind === 'sheets' ? '対象シートを選択' : '範囲を指定'}
            </label>
          </div>
        )}

        {draft.mode === 'range' && inspection.supportsSelection && (
          <div className="range-fields">
            <label>
              開始
              <input
                aria-label="開始"
                type="number"
                min="1"
                max={inspection.totalUnits ?? 1}
                value={draft.start}
                onChange={(event) =>
                  setDraft({ ...draft, start: Number(event.target.value) })
                }
              />
            </label>
            <span>〜</span>
            <label>
              終了
              <input
                aria-label="終了"
                type="number"
                min="1"
                max={inspection.totalUnits ?? 1}
                value={draft.end}
                onChange={(event) =>
                  setDraft({ ...draft, end: Number(event.target.value) })
                }
              />
            </label>
          </div>
        )}

        {draft.mode === 'sheets' && (
          <div className="sheet-list">
            <div className="sheet-actions">
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    mode: 'sheets',
                    sheetNames: inspection.sheets.map((sheet) => sheet.name),
                  })
                }
              >
                全選択
              </button>
              <button
                type="button"
                onClick={() => setDraft({ mode: 'sheets', sheetNames: [] })}
              >
                全解除
              </button>
            </div>
            {inspection.sheets.map((sheet) => (
              <label key={sheet.name}>
                <input
                  type="checkbox"
                  checked={draft.sheetNames.includes(sheet.name)}
                  onChange={(event) =>
                    setDraft({
                      mode: 'sheets',
                      sheetNames: event.target.checked
                        ? [...draft.sheetNames, sheet.name]
                        : draft.sheetNames.filter((name) => name !== sheet.name),
                    })
                  }
                />
                <span>
                  {sheet.name}
                  {sheet.hidden && <small>非表示</small>}
                </span>
              </label>
            ))}
          </div>
        )}

        {!valid && (
          <p className="selection-error" role="alert">
            有効な変換範囲を指定してください。
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!valid}
            onClick={() => valid && onConfirm(draft)}
          >
            この範囲に決定
          </button>
        </div>
      </section>
    </div>
  );
}
