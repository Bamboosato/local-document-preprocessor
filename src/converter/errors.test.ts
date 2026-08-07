import { describe, expect, it } from 'vitest';
import { conversionErrorMessage, serializeConversionError } from './errors';

describe('conversion errors', () => {
  it.each(['encrypted', 'unsupported', 'malformed', 'resourceLimit', 'missingPart', 'invalidSelection'] as const)(
    'preserves the supported error code %s',
    (code) => {
      expect(serializeConversionError({ code, message: 'internal detail' })).toEqual({ code });
      expect(conversionErrorMessage(code)).not.toContain('internal detail');
    },
  );

  it('redacts unknown errors to the unknown category', () => {
    expect(serializeConversionError(new Error('C:\\private\\document.docx'))).toEqual({
      code: 'unknown',
    });
  });

  it('explains the four user-critical failures explicitly', () => {
    expect(conversionErrorMessage('encrypted')).toContain('パスワード');
    expect(conversionErrorMessage('unsupported')).toContain('スキャン PDF');
    expect(conversionErrorMessage('malformed')).toContain('破損');
    expect(conversionErrorMessage('resourceLimit')).toContain('安全');
  });
});
