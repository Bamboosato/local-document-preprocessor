import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { resolve } from 'node:path';

async function confirmDefaultScope(page: Page) {
  await expect(page.getByRole('dialog', { name: '変換範囲を選択' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'この範囲に決定' }).click();
}

async function selectRange(page: Page, start: number, end: number) {
  await expect(page.getByRole('dialog', { name: '変換範囲を選択' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('radio', { name: '範囲を指定' }).check();
  await page.getByLabel('開始').fill(String(start));
  await page.getByLabel('終了').fill(String(end));
  await page.getByRole('button', { name: 'この範囲に決定' }).click();
}

function docxFixture(includePageBreak: boolean): Buffer {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
    </Types>`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body><w:p><w:r><w:t>DOCX_PAGE_ONE</w:t>${includePageBreak ? '<w:br w:type="page"/>' : ''}<w:t>DOCX_PAGE_TWO</w:t></w:r></w:p>
      <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
    </w:document>`;
  const rootRelationships = `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`;
  const stylesXml = '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>';
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8(contentTypes),
      '_rels/.rels': strToU8(rootRelationships),
      'word/document.xml': strToU8(documentXml),
      'word/styles.xml': strToU8(stylesXml),
    }),
  );
}

test('実 WASM で日本語と半角カタカナを端末内変換する', async ({ page }) => {
  const requests: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('requestfailed', (request) =>
    failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? 'failed'}`),
  );
  page.on('response', (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  const expected = 'ICT本部品質技術ｿﾘｭｰｼｮﾝ部ｿﾘｭｰｼｮﾝ第一課';
  await page.locator('input[type="file"]').setInputFiles({
    name: 'regression.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`項目,値\n所属,${expected}\n氏名,山田太郎`, 'utf-8'),
  });

  await expect(page.getByText('regression.csv')).toBeVisible();
  await confirmDefaultScope(page);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  await page.getByRole('button', { name: '1 ファイルを変換' }).click();
  await expect(
    page.getByText(/変換成功（要原本照合）|変換できませんでした/).first(),
  ).toBeVisible({ timeout: 30_000 });
  expect({ pageErrors, consoleErrors, failedRequests, badResponses }).toEqual({
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    badResponses: [],
  });
  if (await page.getByText('変換できませんでした').isVisible()) {
    throw new Error(`Browser conversion failed: ${await page.locator('.inline-error').textContent()}`);
  }
  await expect(page.getByText('変換成功（要原本照合）').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('.result-handoff')).toContainText(
    '結果は local-pii-masker へ手動で受け渡せます。',
  );
  await expect(page.getByTestId('markdown-preview')).toContainText(expected);

  await page.getByRole('tab', { name: 'plain text' }).click();
  await expect(page.locator('.plain-preview')).toContainText(expected);
  await expect(page.getByText('原本との照合が必要です')).toBeVisible();

  const externalRequests = requests.filter((url) => new URL(url).origin !== new URL(page.url()).origin);
  expect(externalRequests).toEqual([]);

  const storage = await page.evaluate(async () => ({
    localStorage: localStorage.length,
    sessionStorage: sessionStorage.length,
    indexedDbDatabases: (await indexedDB.databases()).length,
  }));
  expect(storage).toEqual({
    localStorage: 0,
    sessionStorage: 0,
    indexedDbDatabases: 0,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Local Document Preprocessor' })).toBeVisible();
  const smallViewportLayout = await page.locator('h1').evaluate((element) => {
    const title = element as HTMLElement;
    const rect = title.getBoundingClientRect();
    const lineHeight = Number.parseFloat(getComputedStyle(title).lineHeight);
    return {
      pageFitsViewport: document.documentElement.scrollWidth <= window.innerWidth,
      titleSingleLine: rect.height <= lineHeight * 1.2,
      titleFitsViewport: rect.right <= window.innerWidth,
    };
  });
  expect(smallViewportLayout).toEqual({
    pageFitsViewport: true,
    titleSingleLine: true,
    titleFitsViewport: true,
  });
});

test('Type0・ToUnicode欠落PDFを客観比較し、完全一致のpartialとして出力する', async ({
  page,
}) => {
  const requests: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(
    resolve('tests/fixtures/pdf/type0-no-tounicode-halfwidth.pdf'),
  );
  await confirmDefaultScope(page);
  await page.getByRole('button', { name: '1 ファイルを変換' }).click();

  await expect(page.getByText('一部変換（要原本照合）').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-issue-code="encoding_suspect"]')).toBeVisible();
  await expect(page.locator('[data-issue-code="pdf_text_fallback"]')).toBeVisible();

  const expected = 'ICT本部品質技術ｿﾘｭｰｼｮﾝ部ｿﾘｭｰｼｮﾝ第一課';
  await expect(page.getByTestId('markdown-preview')).toContainText(expected);
  expect(await page.getByTestId('markdown-preview').textContent()).not.toContain('�');

  await page.getByRole('tab', { name: 'plain text' }).click();
  await expect(page.locator('.plain-preview')).toContainText(expected);
  expect(await page.locator('.plain-preview').textContent()).not.toContain('�');

  const externalRequests = requests.filter(
    (url) => new URL(url).origin !== new URL(page.url()).origin,
  );
  expect({ pageErrors, consoleErrors, externalRequests }).toEqual({
    pageErrors: [],
    consoleErrors: [],
    externalRequests: [],
  });
});

test('正常な機械可読PDFを誤ってpartialにしない', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(
    resolve('tests/fixtures/pdf/normal-machine-readable.pdf'),
  );
  await confirmDefaultScope(page);
  await page.getByRole('button', { name: '1 ファイルを変換' }).click();

  await expect(page.getByText('変換成功（要原本照合）').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('markdown-preview')).toContainText(
    'Normal machine-readable PDF',
  );
  await expect(page.locator('[data-issue-code="encoding_suspect"]')).toHaveCount(0);
});

test('画像のみPDFをOCR必須のfailedとして出力停止する', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(
    resolve('tests/fixtures/pdf/image-only.pdf'),
  );
  await confirmDefaultScope(page);
  await page.getByRole('button', { name: '1 ファイルを変換' }).click();

  await expect(page.getByText('変換失敗（出力利用不可）')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-issue-code="ocr_required"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /コピー/u })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /ダウンロード/u })).toHaveCount(0);
});

test('テキストページと画像ページの混在PDFをpartialとして区別する', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(
    resolve('tests/fixtures/pdf/mixed-text-image.pdf'),
  );
  await confirmDefaultScope(page);
  await page.getByRole('button', { name: '1 ファイルを変換' }).click();

  await expect(page.getByText('一部変換（要原本照合）').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-issue-code="mixed_pdf"]')).toBeVisible();
  await expect(page.getByTestId('markdown-preview')).toContainText('Machine-readable page');
});

test('[page-break] PDFの選択ページだけをMarkdownとplain textへ変換する', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(
    resolve('tests/fixtures/pdf/three-page-range.pdf'),
  );
  await selectRange(page, 2, 3);
  await expect(page.locator('.selection-summary')).toContainText('2〜3ページ');
  await expect(
    page.getByRole('checkbox', { name: /Markdownにページ区切りを挿入する/u }),
  ).toBeChecked();
  const narrowControlLayout = await page.evaluate(() => {
    const summary = document.querySelector<HTMLElement>('.selection-summary');
    const option = document.querySelector<HTMLElement>('.option-row');
    if (!summary || !option) throw new Error('Selection controls are missing.');
    const summaryRect = summary.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    return optionRect.top >= summaryRect.bottom - 1;
  });
  expect(narrowControlLayout).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page.getByRole('button', { name: '1 ファイルを変換' }).click();

  await expect(page.getByText('変換成功（要原本照合）').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('markdown-preview')).toContainText('PAGE_TWO_ONLY');
  await expect(page.getByTestId('markdown-preview')).toContainText('PAGE_THREE_ONLY');
  await expect(page.getByTestId('markdown-preview')).not.toContainText('PAGE_ONE_ONLY');
  await expect(page.getByTestId('markdown-preview').locator('hr')).toHaveCount(1);
  await page.getByRole('tab', { name: 'plain text' }).click();
  await expect(page.locator('.plain-preview')).toContainText('PAGE_TWO_ONLY');
  await expect(page.locator('.plain-preview')).not.toContainText('PAGE_ONE_ONLY');
  await expect(page.locator('.plain-preview')).not.toContainText('---');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test('[page-break] PowerPointの選択スライド間だけを設定に応じて区切る', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(
    resolve('tests/fixtures/office/three-slides.pptx'),
  );
  await expect(page.getByRole('radio', { name: 'すべてのスライド（3枚）' })).toBeVisible({
    timeout: 30_000,
  });
  await selectRange(page, 2, 3);
  await expect(page.locator('.selection-summary')).toContainText('2〜3枚目');
  const pageBreakOption = page.getByRole('checkbox', {
    name: /Markdownにページ区切りを挿入する/u,
  });
  await expect(pageBreakOption).toBeChecked();
  const desktopControlLayout = await page.evaluate(() => {
    const summary = document.querySelector<HTMLElement>('.selection-summary');
    const option = document.querySelector<HTMLElement>('.option-row');
    if (!summary || !option) throw new Error('Selection controls are missing.');
    const summaryRect = summary.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    return {
      sameRow: Math.abs(summaryRect.top - optionRect.top) < 1,
      orderedWithoutOverlap: summaryRect.right <= optionRect.left,
      pageFitsViewport: document.documentElement.scrollWidth <= window.innerWidth,
    };
  });
  expect(desktopControlLayout).toEqual({
    sameRow: true,
    orderedWithoutOverlap: true,
    pageFitsViewport: true,
  });
  await page.getByRole('button', { name: '1 ファイルを変換' }).click();

  await expect(page.getByText('変換成功（要原本照合）').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('markdown-preview')).toContainText('SLIDE_TWO_ONLY');
  await expect(page.getByTestId('markdown-preview')).toContainText('SLIDE_THREE_ONLY');
  await expect(page.getByTestId('markdown-preview')).not.toContainText('SLIDE_ONE_ONLY');
  await expect(page.getByTestId('markdown-preview').locator('hr')).toHaveCount(1);
  await page.getByRole('tab', { name: 'plain text' }).click();
  await expect(page.locator('.plain-preview')).toContainText('SLIDE_TWO_ONLY');
  await expect(page.locator('.plain-preview')).toContainText('SLIDE_THREE_ONLY');
  await expect(page.locator('.plain-preview')).not.toContainText('SLIDE_ONE_ONLY');
  await expect(page.locator('.plain-preview')).not.toContainText('---');

  await pageBreakOption.uncheck();
  await expect(page.getByRole('heading', { name: '結果を確認' })).not.toBeVisible();
  await expect(page.getByText('待機中')).toBeVisible();
  await page.getByRole('button', { name: '1 ファイルを変換' }).click();
  await expect(page.getByText('変換成功（要原本照合）').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('markdown-preview').locator('hr')).toHaveCount(0);
});

test('[UI boundary wide-table] 多数列の変換結果をページ外へ押し出さず、表の内部だけ横スクロールする', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const headers = Array.from({ length: 40 }, (_, index) => `LONG_COLUMN_${index + 1}`);
  const values = Array.from({ length: 40 }, (_, index) => `VALUE_${index + 1}`);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'wide-table.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`${headers.join(',')}\n${values.join(',')}`, 'utf-8'),
  });
  await confirmDefaultScope(page);
  await page.getByRole('button', { name: '1 ファイルを変換' }).click();

  await expect(page.getByText('変換成功（要原本照合）').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('.markdown-table-scroll')).toBeVisible();

  const measureLayout = () =>
    page.evaluate(() => {
      const results = document.querySelector<HTMLElement>('.results');
      const card = document.querySelector<HTMLElement>('.result-card');
      const scroller = document.querySelector<HTMLElement>('.markdown-table-scroll');
      if (!results || !card || !scroller) throw new Error('Result layout is missing.');

      const resultsRect = results.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      return {
        pageFitsViewport: document.documentElement.scrollWidth <= window.innerWidth,
        cardFitsResults:
          cardRect.left >= resultsRect.left && cardRect.right <= resultsRect.right,
        tableScrollsInsidePreview: scroller.scrollWidth > scroller.clientWidth,
      };
    });

  expect(await measureLayout()).toEqual({
    pageFitsViewport: true,
    cardFitsResults: true,
    tableScrollsInsidePreview: true,
  });

  await page.setViewportSize({ width: 375, height: 812 });
  expect(await measureLayout()).toEqual({
    pageFitsViewport: true,
    cardFitsResults: true,
    tableScrollsInsidePreview: true,
  });
});

test('Excelの選択シートだけを変換し、非表示状態を明示する', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(
    resolve('tests/fixtures/office/three-sheets.xlsx'),
  );
  await expect(page.getByRole('dialog', { name: '変換範囲を選択' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('radio', { name: '対象シートを選択' }).check();
  await expect(page.getByText('非表示')).toBeVisible();
  await page.getByRole('button', { name: '全解除' }).click();
  await page.getByRole('checkbox', { name: /Hidden Two/u }).check();
  await page.getByRole('button', { name: 'この範囲に決定' }).click();
  await expect(page.locator('.selection-summary')).toContainText('1シート');
  await page.getByRole('button', { name: '1 ファイルを変換' }).click();

  await expect(page.getByText('変換成功（要原本照合）').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('markdown-preview')).toContainText('SHEET_TWO_ONLY');
  await expect(page.getByTestId('markdown-preview')).not.toContainText('SHEET_ONE_ONLY');
  await expect(page.getByTestId('markdown-preview')).not.toContainText('SHEET_THREE_ONLY');
  await page.getByRole('tab', { name: 'plain text' }).click();
  await expect(page.locator('.plain-preview')).toContainText('SHEET_TWO_ONLY');
  await expect(page.locator('.plain-preview')).not.toContainText('SHEET_ONE_ONLY');
  await expect(page.locator('.plain-preview')).not.toContainText('SHEET_THREE_ONLY');
});

test('DOCX等の安定ページ境界がない形式は文書全体のみと明示する', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'document.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: docxFixture(false),
  });

  await expect(page.getByRole('dialog', { name: '変換範囲を選択' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('文書全体を変換します')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByRole('button', { name: 'この範囲に決定' }).click();
  await expect(page.locator('.selection-summary')).toContainText('文書全体');
});

test('[page-break] DOCXの明示改ページをMarkdownだけの区切りとして保持する', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'explicit-page-breaks.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: docxFixture(true),
  });

  await expect(page.getByRole('dialog', { name: '変換範囲を選択' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('明示された改ページはMarkdownの区切りとして保持できます。')).toBeVisible();
  await page.getByRole('button', { name: 'この範囲に決定' }).click();

  const pageBreakOption = page.getByRole('checkbox', {
    name: /Markdownにページ区切りを挿入する/u,
  });
  await expect(pageBreakOption).toBeChecked();
  await expect(page.getByText('Word文書の明示改ページを独立行の「---」として保持します')).toBeVisible();
  await page.getByRole('button', { name: '1 ファイルを変換' }).click();

  await expect(page.getByText('変換成功（要原本照合）').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('markdown-preview')).toContainText('DOCX_PAGE_ONE');
  await expect(page.getByTestId('markdown-preview')).toContainText('DOCX_PAGE_TWO');
  await expect(page.getByTestId('markdown-preview').locator('hr')).toHaveCount(1);
  await page.getByRole('tab', { name: 'plain text' }).click();
  await expect(page.locator('.plain-preview')).toContainText('DOCX_PAGE_ONE');
  await expect(page.locator('.plain-preview')).toContainText('DOCX_PAGE_TWO');
  await expect(page.locator('.plain-preview')).not.toContainText('---');

  await pageBreakOption.uncheck();
  await expect(page.getByRole('heading', { name: '結果を確認' })).not.toBeVisible();
  await page.getByRole('button', { name: '1 ファイルを変換' }).click();
  await expect(page.getByText('変換成功（要原本照合）').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('markdown-preview').locator('hr')).toHaveCount(0);
});

test('初期表示で STEP 1 とドロップエリアをファーストビューに配置する', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Local Document Preprocessor' })).toBeVisible();
  await expect(page.locator('.hero-title-row .privacy-badge')).toBeVisible();
  const fontFamily = await page.evaluate(() => getComputedStyle(document.documentElement).fontFamily);
  expect(fontFamily).toContain('Inter');
  expect(fontFamily).toContain('Segoe UI');
  expect(fontFamily).toContain('Hiragino Kaku Gothic ProN');
  const typography = await page.evaluate(() => ({
    titleSize: Number.parseFloat(getComputedStyle(document.querySelector('h1')!).fontSize),
    stepHeadingSize: Number.parseFloat(getComputedStyle(document.querySelector('.section-heading h2')!).fontSize),
  }));
  expect(typography.titleSize).toBeCloseTo(28, 1);
  expect(typography.stepHeadingSize).toBeCloseTo(24, 1);
  const titleBadgeAlignment = await page.evaluate(() => {
    const title = document.querySelector<HTMLElement>('.hero-title-row h1');
    const badge = document.querySelector<HTMLElement>('.hero-title-row .privacy-badge');
    if (!title || !badge) throw new Error('Title badge layout is missing.');
    const titleRect = title.getBoundingClientRect();
    const badgeRect = badge.getBoundingClientRect();
    return Math.abs(titleRect.bottom - badgeRect.bottom) < 2;
  });
  expect(titleBadgeAlignment).toBe(true);
  await expect(
    page.getByText(
      '文書を、端末の中だけでテキストへ。ブラウザ内で完結し、外部送信やサーバー保存は行いません。',
    ),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '文書を選択' })).toBeVisible();
  await expect(page.locator('.drop-zone')).toBeVisible();
  await expect(page.locator('.hero-description')).toHaveCSS('color', 'rgb(74, 85, 104)');
  await expect(page.locator('.boundary-info')).toHaveCSS('color', 'rgb(82, 82, 82)');
  await expect(page.locator('.drop-zone')).toHaveCSS('border-style', 'dashed');
  await expect(page.getByText(/外部送信・永続保存なし/)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '変換後は必ず原本と照合してください' }),
  ).toHaveCount(0);

  const dropZone = page.locator('.drop-zone');
  await dropZone.dispatchEvent('dragenter');
  await expect(dropZone).toHaveClass(/is-dragging/);
  await expect(dropZone).toHaveCSS('border-style', 'solid');
  await expect(dropZone).toHaveCSS('border-color', 'rgb(10, 107, 80)');
  await expect(dropZone).toHaveCSS('background-color', 'rgb(230, 244, 241)');
  await dropZone.dispatchEvent('dragleave');
  await expect(dropZone).not.toHaveClass(/is-dragging/);

  const layout = await page.evaluate(() => {
    const title = document.querySelector<HTMLElement>('h1');
    const dropZone = document.querySelector<HTMLElement>('.drop-zone');
    const boundaryInfo = document.querySelector<HTMLElement>('.boundary-info');
    if (!title || !dropZone || !boundaryInfo) throw new Error('Initial workspace layout is missing.');

    const titleRect = title.getBoundingClientRect();
    const dropRect = dropZone.getBoundingClientRect();
    const infoRect = boundaryInfo.getBoundingClientRect();
    const titleLineHeight = Number.parseFloat(getComputedStyle(title).lineHeight);
    const infoVerticallyCentered = [...boundaryInfo.querySelectorAll('li')].every((item) => {
      const icon = item.querySelector<HTMLElement>('.boundary-info-icon');
      const label = item.children[1] as HTMLElement | undefined;
      if (!icon || !label) return false;
      const iconRect = icon.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      return Math.abs(iconRect.top + iconRect.height / 2 - (labelRect.top + labelRect.height / 2)) < 2;
    });
    return {
      pageFitsViewport: document.documentElement.scrollWidth <= window.innerWidth,
      titleSingleLine: titleRect.height <= titleLineHeight * 1.2,
      titleFitsViewport: titleRect.right <= window.innerWidth,
      dropZoneVisible: dropRect.top >= 0 && dropRect.bottom <= window.innerHeight,
      infoBelowDropZone: infoRect.top >= dropRect.bottom,
      infoVisible: infoRect.bottom <= window.innerHeight,
      infoVerticallyCentered,
    };
  });

  expect(layout).toEqual({
    pageFitsViewport: true,
    titleSingleLine: true,
    titleFitsViewport: true,
    dropZoneVisible: true,
    infoBelowDropZone: true,
    infoVisible: true,
    infoVerticallyCentered: true,
  });
});

test('iPhone相当の狭幅でも補足情報と選択操作が横にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Local Document Preprocessor' })).toBeVisible();
  await expect(page.locator('.hero-title-row .privacy-badge')).toBeVisible();
  await expect(page.getByRole('heading', { name: '文書を選択' })).toBeVisible();
  await expect(page.getByText(/外部送信・永続保存なし/)).toBeVisible();
  await expect(page.getByText(/OCR非対応/)).toBeVisible();
  await expect(page.getByText(/local-pii-masker へ手動でコピー／ダウンロード/)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '変換後は必ず原本と照合してください' }),
  ).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toBeEnabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});
