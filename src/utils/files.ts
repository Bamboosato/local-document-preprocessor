export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function outputFileName(inputName: string, extension: '.md' | '.txt'): string {
  const withoutExtension = inputName.replace(/\.[^.]+$/u, '');
  const safeBase = withoutExtension
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '_')
    .replace(/[. ]+$/gu, '')
    .slice(0, 120);
  return `${safeBase || 'converted'}${extension}`;
}

export function markdownDownloadContent(
  markdown: string,
  originalFileName: string,
  originalUpdatedAt: number,
): string {
  const title = JSON.stringify(originalFileName);
  const updatedAt = JSON.stringify(new Date(originalUpdatedAt).toISOString());
  return `---\ntitle: ${title}\noriginal_updatedAt: ${updatedAt}\n---\n\n${markdown}`;
}

export function downloadText(fileName: string, text: string, mimeType: string): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard API is unavailable.');
  }
  await navigator.clipboard.writeText(text);
}
