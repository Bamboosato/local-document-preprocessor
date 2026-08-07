import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import type { PdfPageService } from './documentSelection';
import { inspectDocument, prepareSelectedDocument } from './documentSelection';

function packageWith(path: string, xml: string, extras: Record<string, string> = {}): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    [path]: strToU8(xml),
    ...Object.fromEntries(Object.entries(extras).map(([name, value]) => [name, strToU8(value)])),
  });
}

const pdfPages: PdfPageService = {
  countPages: vi.fn(async () => 3),
  selectPages: vi.fn(async (_bytes, start, end) => new Uint8Array([start, end])),
};

const presentationXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="urn:p" xmlns:r="urn:r"><p:sldIdLst>
  <p:sldId id="1" r:id="rId1"/><p:sldId id="2" r:id="rId2"/><p:sldId id="3" r:id="rId3"/>
</p:sldIdLst></p:presentation>`;

const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="urn:w" xmlns:r="urn:r"><sheets>
  <sheet name="Visible &amp; One" sheetId="1" r:id="rId1"/>
  <sheet name="Hidden Two" sheetId="2" state="hidden" r:id="rId2"/>
  <sheet name="三番目" sheetId="3" r:id="rId3"/>
</sheets></workbook>`;

describe('document selection', () => {
  it('PDFのページ数を検査し、指定範囲だけをPDFサービスへ渡す', async () => {
    const bytes = new Uint8Array([1, 2, 3]);

    await expect(inspectDocument('sample.pdf', bytes, pdfPages)).resolves.toEqual({
      selectionKind: 'pages',
      supportsSelection: true,
      totalUnits: 3,
      sheets: [],
    });
    await expect(
      prepareSelectedDocument('sample.pdf', bytes, { mode: 'range', start: 2, end: 3 }, pdfPages),
    ).resolves.toEqual(new Uint8Array([2, 3]));
    expect(pdfPages.selectPages).toHaveBeenCalledWith(bytes, 2, 3);
  });

  it('PPTXのスライド数を検査し、選択外スライド参照を除外する', async () => {
    const bytes = packageWith('ppt/presentation.xml', presentationXml, {
      'ppt/slides/slide1.xml': '<slide>SLIDE_ONE_ONLY</slide>',
      'ppt/slides/slide2.xml': '<slide>SLIDE_TWO_ONLY</slide>',
      'ppt/slides/slide3.xml': '<slide>SLIDE_THREE_ONLY</slide>',
    });

    await expect(inspectDocument('sample.pptx', bytes, pdfPages)).resolves.toMatchObject({
      selectionKind: 'slides',
      totalUnits: 3,
    });
    const selected = await prepareSelectedDocument(
      'sample.pptx',
      bytes,
      { mode: 'range', start: 2, end: 3 },
      pdfPages,
    );
    const selectedXml = strFromU8(unzipSync(selected)['ppt/presentation.xml']);
    expect(selectedXml).not.toContain('rId1');
    expect(selectedXml).toContain('rId2');
    expect(selectedXml).toContain('rId3');
  });

  it('XLSXのシート名と非表示状態を検査し、非選択シート参照を除外する', async () => {
    const bytes = packageWith('xl/workbook.xml', workbookXml);

    await expect(inspectDocument('sample.xlsx', bytes, pdfPages)).resolves.toMatchObject({
      selectionKind: 'sheets',
      totalUnits: 3,
      sheets: [
        { name: 'Visible & One', index: 1, hidden: false },
        { name: 'Hidden Two', index: 2, hidden: true },
        { name: '三番目', index: 3, hidden: false },
      ],
    });
    const selected = await prepareSelectedDocument(
      'sample.xlsx',
      bytes,
      { mode: 'sheets', sheetNames: ['Hidden Two'] },
      pdfPages,
    );
    const selectedXml = strFromU8(unzipSync(selected)['xl/workbook.xml']);
    expect(selectedXml).not.toContain('Visible &amp; One');
    expect(selectedXml).toContain('Hidden Two');
    expect(selectedXml).not.toContain('三番目');
  });

  it('範囲外、逆転、シート未選択をinvalidSelectionとして拒否する', async () => {
    const pdf = new Uint8Array([1]);
    await expect(
      prepareSelectedDocument('sample.pdf', pdf, { mode: 'range', start: 0, end: 1 }, pdfPages),
    ).rejects.toMatchObject({ code: 'invalidSelection' });
    await expect(
      prepareSelectedDocument('sample.pdf', pdf, { mode: 'range', start: 3, end: 2 }, pdfPages),
    ).rejects.toMatchObject({ code: 'invalidSelection' });
    await expect(
      prepareSelectedDocument(
        'sample.xlsx',
        packageWith('xl/workbook.xml', workbookXml),
        { mode: 'sheets', sheetNames: [] },
        pdfPages,
      ),
    ).rejects.toMatchObject({ code: 'invalidSelection' });
  });

  it('DOCXと安定した単位境界のない形式は文書全体のみとする', async () => {
    await expect(inspectDocument('document.docx', new Uint8Array(), pdfPages)).resolves.toEqual({
      selectionKind: 'document',
      supportsSelection: false,
      sheets: [],
    });
    await expect(
      prepareSelectedDocument(
        'document.docx',
        new Uint8Array(),
        { mode: 'range', start: 1, end: 1 },
        pdfPages,
      ),
    ).rejects.toMatchObject({ code: 'invalidSelection' });
  });
});
