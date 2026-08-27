import type { DestructionStyleId, VisualStyleId } from '../types/destructionStyle';

export type ExportFormatId = 'html' | 'json' | 'react' | 'svg-anim' | 'svg-static' | 'png-poster' | 'webm';

export interface ExportCapabilities {
  supported: boolean;
  animation: 'full' | 'limited' | 'none';
  interactive: boolean;
  audio: boolean;
  transparent: boolean;
  note: string;
}

export function getExportCapabilities(
  format: ExportFormatId,
  destructionStyle: DestructionStyleId,
  _visualStyle: VisualStyleId,
): ExportCapabilities {
  switch (format) {
    case 'html':
    case 'react':
      return { supported: true, animation: 'full', interactive: true, audio: true, transparent: true, note: 'Shared V3 runtime with full visual and audio parity.' };
    case 'json':
      return { supported: true, animation: 'none', interactive: false, audio: false, transparent: true, note: 'Portable V3 configuration and fragment data.' };
    case 'webm':
      return { supported: true, animation: 'full', interactive: false, audio: false, transparent: false, note: 'Visual recording only; the captured stream has no audio track.' };
    case 'svg-anim':
      return destructionStyle === 'physical'
        ? { supported: true, animation: 'limited', interactive: false, audio: false, transparent: true, note: 'Physical fragment motion only; canvas-only effects are omitted.' }
        : { supported: false, animation: 'none', interactive: false, audio: false, transparent: true, note: 'Stylized smoke and whisps cannot be represented faithfully in animated SVG.' };
    case 'svg-static':
    case 'png-poster':
      return { supported: true, animation: 'none', interactive: false, audio: false, transparent: true, note: 'Static output.' };
  }
}
