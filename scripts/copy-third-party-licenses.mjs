import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const projectRoot = new URL('../', import.meta.url);
const outputDirectory = new URL('dist/licenses/', projectRoot);
const licenses = [
  ['node_modules/@firecrawl/anydoc-wasm/LICENSE', 'anydoc-MIT.txt'],
  ['node_modules/@embedpdf/pdfium/LICENSE', 'embedpdf-pdfium-MIT.txt'],
  ['node_modules/@embedpdf/pdfium/LICENSE.pdfium', 'PDFium-Apache-2.0.txt'],
  ['node_modules/fflate/LICENSE', 'fflate-MIT.txt'],
  ['node_modules/pdf-lib/LICENSE.md', 'pdf-lib-MIT.txt'],
];

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  licenses.map(([source, destination]) =>
    copyFile(new URL(source, projectRoot), new URL(destination, outputDirectory)),
  ),
);

console.log(
  `Copied ${licenses.length} third-party license files to ${fileURLToPath(outputDirectory)}`,
);
