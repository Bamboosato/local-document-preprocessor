import { useEffect, useMemo, useRef, useState } from 'react';
import { ResultCard } from './components/ResultCard';
import { SelectionDialog } from './components/SelectionDialog';
import {
  ConverterWorkerClient,
  WorkerConversionError,
} from './converter/ConverterWorkerClient';
import {
  MAX_FILE_COUNT,
  MAX_FILE_SIZE_BYTES,
  SUPPORTED_EXTENSIONS,
  type ConversionOptions,
  type ConversionErrorCode,
  type ConversionResult,
  type DocumentInspection,
  type DocumentSelection,
} from './converter/contracts';
import { conversionErrorMessage } from './converter/errors';
import { processSequentially } from './conversion/processQueue';
import { formatBytes } from './utils/files';

type ItemStatus =
  | 'inspecting'
  | 'queued'
  | 'converting'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled';

interface QueueItem {
  id: string;
  name: string;
  size: number;
  originalUpdatedAt: number;
  file?: File;
  status: ItemStatus;
  result?: ConversionResult;
  errorCode?: ConversionErrorCode;
  inspection?: DocumentInspection;
  selection?: DocumentSelection;
  options?: ConversionOptions;
}

const STATUS_LABELS: Record<ItemStatus, string> = {
  inspecting: '構造確認中',
  queued: '待機中',
  converting: '変換中',
  completed: '変換成功（要原本照合）',
  partial: '一部変換（要原本照合）',
  failed: '変換できませんでした',
  cancelled: 'キャンセル済み',
};

function createId(): string {
  return crypto.randomUUID();
}

function selectionSummary(
  inspection: DocumentInspection,
  selection: DocumentSelection,
): string {
  if (selection.mode === 'range') {
    return `${selection.start}〜${selection.end}${inspection.selectionKind === 'slides' ? '枚目' : 'ページ'}`;
  }
  if (selection.mode === 'sheets') return `${selection.sheetNames.length}シート`;
  if (inspection.selectionKind === 'document') return '文書全体';
  if (inspection.selectionKind === 'sheets') return 'すべてのシート';
  return `すべて（${inspection.totalUnits ?? 0}${inspection.selectionKind === 'slides' ? '枚' : 'ページ'}）`;
}

function defaultOptions(inspection: DocumentInspection): ConversionOptions {
  return {
    insertPageBreaks:
      inspection.selectionKind === 'pages' ||
      inspection.selectionKind === 'slides' ||
      (inspection.explicitPageBreakCount ?? 0) > 0,
  };
}

export default function App() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState('');
  const [dialogItemId, setDialogItemId] = useState<string | undefined>();
  const workerClientRef = useRef<ConverterWorkerClient | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const inspectionAbortControllerRef = useRef<AbortController | undefined>(undefined);
  const inspectionGenerationRef = useRef(0);
  const runIdRef = useRef(0);

  const queuedCount = useMemo(
    () => items.filter((item) => item.status === 'queued' && item.file).length,
    [items],
  );
  const resultItems = items.filter(
    (item): item is QueueItem & { result: ConversionResult } =>
      Boolean(item.result),
  );
  const isInspecting = items.some((item) => item.status === 'inspecting');

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
      inspectionAbortControllerRef.current?.abort();
      workerClientRef.current?.dispose();
    },
    [],
  );

  const replaceSelection = (files: File[]) => {
    if (isConverting) {
      return;
    }

    const accepted = files.slice(0, MAX_FILE_COUNT);
    const rejectedCount = Math.max(0, files.length - MAX_FILE_COUNT);
    inspectionGenerationRef.current += 1;
    inspectionAbortControllerRef.current?.abort();
    inspectionAbortControllerRef.current = undefined;
    if (items.some((item) => item.status === 'inspecting')) {
      workerClientRef.current?.cancel();
    }
    const generation = inspectionGenerationRef.current;
    const nextItems = accepted.map<QueueItem>((file) => {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return {
          id: createId(),
          name: file.name,
          size: file.size,
          originalUpdatedAt: file.lastModified,
          status: 'failed',
          errorCode: 'appFileTooLarge',
        };
      }

      return {
        id: createId(),
        name: file.name,
        size: file.size,
        originalUpdatedAt: file.lastModified,
        file,
        status: 'inspecting',
      };
    });
    const oversizedCount = nextItems.filter(
      (item) => item.errorCode === 'appFileTooLarge',
    ).length;
    const notices: string[] = [];
    if (rejectedCount > 0) {
      notices.push(`上限は ${MAX_FILE_COUNT} ファイルです。末尾 ${rejectedCount} ファイルを追加しませんでした。`);
    }
    if (oversizedCount > 0) {
      notices.push(`${oversizedCount} ファイルは 50 MiB を超えるため変換対象外です。`);
    }

    setItems(nextItems);
    setDialogItemId(undefined);
    setSelectionNotice(notices.join(' '));

    const inspectable = nextItems.filter(
      (item): item is QueueItem & { file: File } => item.status === 'inspecting' && Boolean(item.file),
    );
    if (inspectable.length === 0) return;

    const client = workerClientRef.current ?? new ConverterWorkerClient();
    workerClientRef.current = client;
    const controller = new AbortController();
    inspectionAbortControllerRef.current = controller;

    void (async () => {
      for (const item of inspectable) {
        try {
          const inspection = await client.inspect(item.file, controller.signal);
          if (generation !== inspectionGenerationRef.current) return;
          setItems((current) =>
            current.map((currentItem) =>
              currentItem.id === item.id
                ? {
                    ...currentItem,
                    status: 'queued',
                    inspection,
                    selection: { mode: 'all' },
                    options: defaultOptions(inspection),
                  }
                : currentItem,
            ),
          );
          if (inspectable.length === 1) setDialogItemId(item.id);
        } catch (error) {
          if (generation !== inspectionGenerationRef.current || controller.signal.aborted) return;
          const errorCode =
            error instanceof WorkerConversionError ? error.code : 'unknown';
          setItems((current) =>
            current.map((currentItem) =>
              currentItem.id === item.id
                ? { ...currentItem, status: 'failed', errorCode }
                : currentItem,
            ),
          );
        }
      }
      if (generation === inspectionGenerationRef.current) {
        inspectionAbortControllerRef.current = undefined;
      }
    })();
  };

  const patchItem = (id: string, patch: Partial<QueueItem>, runId: number) => {
    if (runId !== runIdRef.current) {
      return;
    }
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const startConversion = async () => {
    const runnable = items.filter(
      (item): item is QueueItem & {
        file: File;
        selection: DocumentSelection;
        options: ConversionOptions;
      } =>
        item.status === 'queued' &&
        Boolean(item.file) &&
        Boolean(item.selection) &&
        Boolean(item.options),
    );
    if (runnable.length === 0 || isConverting || isInspecting) {
      return;
    }

    const client = workerClientRef.current ?? new ConverterWorkerClient();
    workerClientRef.current = client;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setIsConverting(true);

    try {
      await processSequentially(
        runnable,
        (item, signal) => client.convert(item.file, item.selection, item.options, signal),
        {
          onStart: (item) =>
            patchItem(item.id, { status: 'converting', errorCode: undefined }, runId),
          onSuccess: (item, result) => {
            const status =
              result.quality.disposition === 'success'
                ? 'completed'
                : result.quality.disposition;
            patchItem(item.id, { status, result }, runId);
          },
          onError: (item, error) => {
            const errorCode =
              error instanceof WorkerConversionError ? error.code : 'unknown';
            patchItem(item.id, { status: 'failed', errorCode }, runId);
          },
        },
        abortController.signal,
      );
    } finally {
      if (runId === runIdRef.current) {
        setIsConverting(false);
        abortControllerRef.current = undefined;
      }
    }
  };

  const cancelConversion = () => {
    if (!isConverting) {
      return;
    }

    runIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = undefined;
    workerClientRef.current?.cancel();
    setItems((current) =>
      current.map((item) =>
        item.status === 'queued' || item.status === 'converting'
          ? { ...item, status: 'cancelled' }
          : item,
      ),
    );
    setIsConverting(false);
  };

  const clearAll = () => {
    if (isConverting) {
      cancelConversion();
    }
    inspectionGenerationRef.current += 1;
    inspectionAbortControllerRef.current?.abort();
    inspectionAbortControllerRef.current = undefined;
    if (items.some((item) => item.status === 'inspecting')) {
      workerClientRef.current?.cancel();
    }
    setItems([]);
    setDialogItemId(undefined);
    setSelectionNotice('');
  };

  const dialogItem = dialogItemId
    ? items.find(
        (item): item is QueueItem & {
          inspection: DocumentInspection;
          selection: DocumentSelection;
        } =>
          item.id === dialogItemId && Boolean(item.inspection) && Boolean(item.selection),
      )
    : undefined;

  return (
      <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <div className="hero-title-row">
            <h1>Local Document Preprocessor</h1>
            <div className="privacy-badge" aria-label="ローカル処理・保存なし">
              <svg
                className="privacy-badge-icon"
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3 19 6v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6l7-3Z" />
                <path d="m9.5 12 1.6 1.6 3.5-3.5" />
              </svg>
              ローカル処理・保存なし
            </div>
          </div>
          <p className="hero-description">
            文書を、端末の中だけでテキストへ。ブラウザ内で完結し、外部送信やサーバー保存は行いません。
          </p>
        </div>
      </header>

      <main>
        <section className="workspace" aria-labelledby="input-title">
          <div className="section-heading">
            <div>
              <p className="step-label">STEP 1</p>
              <h2 id="input-title">文書を選択</h2>
            </div>
            <p>最大 {MAX_FILE_COUNT} ファイル / 1 ファイル 50 MiB</p>
          </div>

          <label
            className={`drop-zone ${isDragging ? 'is-dragging' : ''} ${isConverting ? 'is-disabled' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!isConverting) setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              replaceSelection(Array.from(event.dataTransfer.files));
            }}
          >
            <input
              type="file"
              multiple
              disabled={isConverting}
              accept={SUPPORTED_EXTENSIONS.join(',')}
              onChange={(event) => {
                replaceSelection(Array.from(event.target.files ?? []));
                event.currentTarget.value = '';
              }}
            />
            <span className="drop-icon" aria-hidden="true">↓</span>
            <strong>ファイルをここにドロップ</strong>
            <span>またはクリックして選択</span>
            <small>Word / PowerPoint / Excel / OpenDocument / RTF / EPUB / CSV / PDF</small>
          </label>
          <ul className="boundary-info" aria-label="利用上の注意">
            <li>
              <span className="boundary-info-icon" aria-hidden="true">🔒</span>
              <span>外部送信・永続保存なし（タブを閉じると結果は失われます）</span>
            </li>
            <li>
              <span className="boundary-info-icon" aria-hidden="true">🚫</span>
              <span>OCR非対応（画像のみ／スキャンPDFは不可）</span>
            </li>
            <li>
              <span className="boundary-info-icon" aria-hidden="true">↗</span>
              <span>PII処理は local-pii-masker へ手動でコピー／ダウンロード</span>
            </li>
          </ul>
          <p className="selection-notice" role="alert">{selectionNotice}</p>

          {items.length > 0 && (
            <div className="queue-panel" aria-labelledby="queue-title">
              <div className="queue-heading">
                <h3 id="queue-title">処理キュー</h3>
                <span>{items.length} ファイル</span>
              </div>
              <ol className="file-list">
                {items.map((item) => (
                  <li key={item.id}>
                    <div className="file-order" aria-hidden="true">
                      {String(items.indexOf(item) + 1).padStart(2, '0')}
                    </div>
                    <div className="file-details">
                      <strong>{item.name}</strong>
                      <span>{formatBytes(item.size)}</span>
                      {item.errorCode && (
                        <p className="inline-error" role="alert">
                          {conversionErrorMessage(item.errorCode)}
                        </p>
                      )}
                      {item.inspection && item.selection && (
                        <div
                          className={`selection-controls ${
                            item.options &&
                            (item.inspection.selectionKind === 'pages' ||
                              item.inspection.selectionKind === 'slides' ||
                              (item.inspection.explicitPageBreakCount ?? 0) > 0)
                              ? 'has-page-break-option'
                              : ''
                          }`}
                        >
                          <div className="selection-summary">
                            <span>
                              <strong>変換範囲</strong>
                              <small>{selectionSummary(item.inspection, item.selection)}</small>
                            </span>
                            <button
                              type="button"
                              disabled={isConverting}
                              onClick={() => setDialogItemId(item.id)}
                            >
                              変更
                            </button>
                          </div>
                          {item.options &&
                            (item.inspection.selectionKind === 'pages' ||
                              item.inspection.selectionKind === 'slides' ||
                              (item.inspection.explicitPageBreakCount ?? 0) > 0) && (
                              <label className="option-row">
                                <input
                                  type="checkbox"
                                  checked={item.options.insertPageBreaks}
                                  disabled={isConverting}
                                  onChange={(event) => {
                                    const insertPageBreaks = event.target.checked;
                                    setItems((current) =>
                                      current.map((currentItem) =>
                                        currentItem.id === item.id
                                          ? {
                                              ...currentItem,
                                              options: { insertPageBreaks },
                                              status: 'queued',
                                              result: undefined,
                                              errorCode: undefined,
                                            }
                                          : currentItem,
                                      ),
                                    );
                                  }}
                                />
                                <span>
                                  <strong>Markdownにページ区切りを挿入する</strong>
                                  <small>
                                    {item.inspection.selectionKind === 'document'
                                      ? 'Word文書の明示改ページを独立行の「---」として保持します'
                                      : 'ページ間に独立行の「---」を挿入します'}
                                  </small>
                                </span>
                              </label>
                            )}
                        </div>
                      )}
                    </div>
                    <span className={`status status-${item.status}`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </li>
                ))}
              </ol>

              <div className="queue-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={queuedCount === 0 || isConverting || isInspecting}
                  onClick={startConversion}
                >
                  {isConverting ? '逐次変換中…' : `${queuedCount} ファイルを変換`}
                </button>
                {isConverting && (
                  <button type="button" className="danger-button" onClick={cancelConversion}>
                    変換をキャンセル
                  </button>
                )}
                <button type="button" className="text-button" onClick={clearAll}>
                  すべてクリア
                </button>
              </div>
              {isConverting && (
                <p className="worker-note" role="status">
                  1 ファイルずつ処理しています。キャンセルすると実行中 Worker を破棄します。
                </p>
              )}
            </div>
          )}
        </section>

        {resultItems.length > 0 && (
          <section className="results" aria-labelledby="results-title">
            <div className="section-heading">
              <div>
                <p className="step-label">STEP 2</p>
                <h2 id="results-title">結果を確認</h2>
              </div>
              <p className="result-handoff">
                <span aria-hidden="true">↗</span>
                結果は local-pii-masker へ手動で受け渡せます。
              </p>
            </div>
            <div className="result-list">
              {resultItems.map((item) => (
                <ResultCard
                  key={item.id}
                  id={item.id}
                  fileName={item.name}
                  originalUpdatedAt={item.originalUpdatedAt}
                  result={item.result}
                />
              ))}
            </div>
          </section>
        )}
      </main>
      {dialogItem && (
        <SelectionDialog
          key={dialogItem.id}
          fileName={dialogItem.name}
          inspection={dialogItem.inspection}
          selection={dialogItem.selection}
          onCancel={() => setDialogItemId(undefined)}
          onConfirm={(selection) => {
            setItems((current) =>
              current.map((item) =>
                item.id === dialogItem.id
                  ? {
                      ...item,
                      selection,
                      status: 'queued',
                      result: undefined,
                      errorCode: undefined,
                    }
                  : item,
              ),
            );
            setDialogItemId(undefined);
          }}
        />
      )}
    </div>
  );
}
