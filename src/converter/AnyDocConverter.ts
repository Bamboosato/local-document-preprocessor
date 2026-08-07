import type { Converter, ConverterInput, ConverterOutput } from './contracts';

type AnyDocWasmModule = typeof import('@firecrawl/anydoc-wasm');

export class AnyDocConverter implements Converter {
  private modulePromise: Promise<AnyDocWasmModule> | undefined;

  async convert({ fileName, bytes }: ConverterInput): Promise<ConverterOutput> {
    const anydoc = await this.loadModule();
    const detectedFormat = anydoc.formatFromBytes(bytes);
    const extensionFallback = detectedFormat ?? anydoc.formatFromPath(fileName);

    // Content detection remains authoritative. The extension is supplied only
    // when the bytes have no signature, notably for CSV.
    let markdown: string;
    try {
      markdown = anydoc.toMarkdownBytes(
        bytes,
        detectedFormat ? undefined : extensionFallback,
      );
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        throw error;
      }
      const conversionError = new Error('The conversion engine failed.') as Error & {
        code: 'conversionFailed';
      };
      conversionError.code = 'conversionFailed';
      throw conversionError;
    }

    const resolvedFormat = (detectedFormat ?? extensionFallback)?.toString();
    if (markdown.trim().length === 0 && resolvedFormat !== 'pdf') {
      const error = new Error('No meaningful text was produced.') as Error & {
        code: 'malformed';
      };
      error.code = 'malformed';
      throw error;
    }

    return {
      markdown,
      detectedFormat: resolvedFormat,
    };
  }

  private loadModule(): Promise<AnyDocWasmModule> {
    if (!this.modulePromise) {
      this.modulePromise = import('@firecrawl/anydoc-wasm')
        .then(async (module) => {
          await module.default();
          return module;
        })
        .catch(() => {
          this.modulePromise = undefined;
          const error = new Error('The conversion engine could not initialize.') as Error & {
            code: 'initializationFailed';
          };
          error.code = 'initializationFailed';
          throw error;
        });
    }

    return this.modulePromise;
  }
}
