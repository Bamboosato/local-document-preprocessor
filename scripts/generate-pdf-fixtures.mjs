import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const fixtureDirectory = fileURLToPath(
  new URL('../tests/fixtures/pdf/', import.meta.url),
);
const expected = 'ICT本部品質技術ｿﾘｭｰｼｮﾝ部ｿﾘｭｰｼｮﾝ第一課';

function utf16BeHex(value) {
  return Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0);
      if (codePoint > 0xffff) {
        const adjusted = codePoint - 0x10000;
        const high = 0xd800 + (adjusted >> 10);
        const low = 0xdc00 + (adjusted & 0x3ff);
        return `${high.toString(16).padStart(4, '0')}${low.toString(16).padStart(4, '0')}`;
      }
      return codePoint.toString(16).padStart(4, '0');
    })
    .join('')
    .toUpperCase();
}

function buildPdf(objects) {
  const parts = [Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets = [0];
  let length = parts[0].byteLength;

  objects.forEach((object, index) => {
    offsets.push(length);
    const part = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'latin1');
    parts.push(part);
    length += part.byteLength;
  });

  const xrefOffset = length;
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join('');
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}

function stream(contents) {
  const byteLength = Buffer.byteLength(contents, 'latin1');
  return `<< /Length ${byteLength} >>\nstream\n${contents}\nendstream`;
}

function type0RegressionPdf() {
  const contents = `BT\n/F1 8 Tf\n36 760 Td\n<${utf16BeHex(`Regression fixture: ${expected}`)}> Tj\nET`;
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    stream(contents),
    '<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiKakuGo-W5 /Encoding /UniJIS-UCS2-H /DescendantFonts [6 0 R] >>',
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HeiseiKakuGo-W5 /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 2 >> /DW 1000 >>',
  ]);
}

function normalPdf() {
  const contents = 'BT\n/F1 12 Tf\n72 760 Td\n(Normal machine-readable PDF) Tj\nET';
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    stream(contents),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]);
}

function threePageRangePdf() {
  const pageTexts = ['PAGE_ONE_ONLY', 'PAGE_TWO_ONLY', 'PAGE_THREE_ONLY'];
  const contents = pageTexts.map(
    (text) => `BT\n/F1 12 Tf\n72 760 Td\n(${text}) Tj\nET`,
  );
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 9 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 9 0 R >> >> /Contents 8 0 R >>',
    ...contents.map(stream),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]);
}

function imageOnlyPdf() {
  const contents = 'q\n0.9 0.9 0.9 rg\n72 600 451 160 re\nf\nQ';
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 4 0 R >>',
    stream(contents),
  ]);
}

function mixedPdf() {
  const textContents = 'BT\n/F1 12 Tf\n72 760 Td\n(Machine-readable page) Tj\nET';
  const imageContents = 'q\n0.8 0.8 0.8 rg\n72 600 451 160 re\nf\nQ';
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 6 0 R >>',
    stream(textContents),
    stream(imageContents),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]);
}

await mkdir(fixtureDirectory, { recursive: true });
await Promise.all([
  writeFile(`${fixtureDirectory}/type0-no-tounicode-halfwidth.pdf`, type0RegressionPdf()),
  writeFile(`${fixtureDirectory}/normal-machine-readable.pdf`, normalPdf()),
  writeFile(`${fixtureDirectory}/three-page-range.pdf`, threePageRangePdf()),
  writeFile(`${fixtureDirectory}/image-only.pdf`, imageOnlyPdf()),
  writeFile(`${fixtureDirectory}/mixed-text-image.pdf`, mixedPdf()),
]);

console.log(`Generated deterministic PDF fixtures in ${fixtureDirectory}`);
