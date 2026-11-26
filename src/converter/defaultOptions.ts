import {defaultJsonSettings} from '../json/contracts';
import type {ConversionOptions, DocumentInspection} from './contracts';

export function defaultOptions(inspection: DocumentInspection): ConversionOptions {
  if (inspection.json) return {insertPageBreaks:false, json:{...defaultJsonSettings}};
  return {insertPageBreaks: inspection.selectionKind === 'pages' ||
    inspection.selectionKind === 'slides' || (inspection.explicitPageBreakCount ?? 0) > 0};
}
