import React, { useMemo, useState } from 'react';
import { ChevronRight, Download, ExternalLink, X } from 'lucide-react';
import JSZip from 'jszip';
import type { Point, ShatterConfig, ShatterFragment, SVGInfo } from '../types/shatter';
import type {
  DestructionExecutionConfig,
  DestructionStyleId,
  GlobalShatterConfig,
  StyleSpecificConfig,
} from '../types/destructionStyle';
import { createPRNG } from '../engine/fractureGenerator';
import { createShatterV3Config } from '../export/shatterV3';
import type { ShatterConfigV3 } from '../export/shatterV3';
import { getExportCapabilities } from '../export/capabilities';
import type { ExportFormatId } from '../export/capabilities';

interface ExportModalProps {
  svgInfo: SVGInfo;
  config: ShatterConfig;
  globalConfig: GlobalShatterConfig;
  styleConfig: StyleSpecificConfig;
  destructionStyle: DestructionStyleId;
  execution: DestructionExecutionConfig;
  fragments: ShatterFragment[];
  seed: number;
  impactPoint: Point;
  canvasWidth: number;
  canvasHeight: number;
  onClose: () => void;
  previewCanvas: HTMLCanvasElement | null;
}

interface ExportFormat {
  id: ExportFormatId;
  group: string;
  name: string;
  description: string;
  recommended?: boolean;
}

const FORMATS: ExportFormat[] = [
  { id: 'html', group: 'Interactive Web', name: 'Interactive HTML', description: 'Self-contained ZIP powered by the shared V3 runtime', recommended: true },
  { id: 'json', group: 'Data', name: 'Shatter JSON', description: 'Machine-readable V3 configuration and fragment data' },
  { id: 'react', group: 'Code', name: 'React Component', description: 'React host powered by the same bundled runtime as Studio' },
  { id: 'svg-anim', group: 'Vector', name: 'Animated SVG', description: 'Limited baked physical fragment motion' },
  { id: 'svg-static', group: 'Vector', name: 'Static Fragments SVG', description: 'Each source fragment in a named group' },
  { id: 'png-poster', group: 'Image', name: 'Poster PNG', description: 'High-resolution still of the intact SVG' },
  { id: 'webm', group: 'Video', name: 'WebM Video', description: 'Visual capture of the complete canvas animation' },
];

const Badge: React.FC<{ yes: boolean; label: string }> = ({ yes, label }) => (
  <span className={`tag ${yes ? 'bg-green-500/10 text-green-400' : 'bg-surface-600 text-gray-500'}`}>
    {yes ? '✓' : '–'} {label}
  </span>
);

export const ExportModal: React.FC<ExportModalProps> = props => {
  const {
    svgInfo, config, globalConfig, styleConfig, destructionStyle, execution,
    fragments, seed, impactPoint, onClose, previewCanvas,
  } = props;
  const [selected, setSelected] = useState<ExportFormatId>('html');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [testHtml, setTestHtml] = useState<string | null>(null);
  const selectedFormat = FORMATS.find(format => format.id === selected)!;
  const capabilities = getExportCapabilities(selected, destructionStyle, execution.visualStyle);
  const groups = useMemo(() => Array.from(new Set(FORMATS.map(format => format.group))), []);

  const buildV3 = async (): Promise<ShatterConfigV3> => {
    let customSoundDataUrl: string | undefined;
    if (config.sound && config.soundSource === 'custom') {
      const { getCustomSoundMetadata } = await import('../engine/soundEngine');
      customSoundDataUrl = getCustomSoundMetadata()?.dataUrl;
    }
    return createShatterV3Config({
      svgInfo, globalConfig, physics: config, styleConfig, destructionStyle,
      fragments, seed, impactPoint, customSoundDataUrl,
    });
  };

  const generateHTMLString = async () => {
    const cfg = await buildV3();
    const module = await import('../assets/shatterCoreBundle.js?raw');
    return { cfg, html: buildStandaloneHTML(cfg, module.default) };
  };

  const testInteractiveExport = async () => {
    setExporting(true);
    setProgress('Building V3 preview…');
    try {
      setTestHtml((await generateHTMLString()).html);
      setProgress('');
    } catch (error) {
      setProgress(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExporting(false);
    }
  };

  const doExport = async () => {
    if (!capabilities.supported) return;
    setExporting(true);
    try {
      if (selected === 'html') await exportHTML();
      else if (selected === 'json') await exportJSON();
      else if (selected === 'react') await exportReact();
      else if (selected === 'svg-anim') await exportAnimatedSVG();
      else if (selected === 'svg-static') await exportStaticSVG();
      else if (selected === 'png-poster') await exportPosterPNG();
      else if (selected === 'webm') await exportWebM();
      setProgress('✓ Complete');
    } catch (error) {
      setProgress(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExporting(false);
    }
  };

  const exportHTML = async () => {
    setProgress('Packaging shared runtime…');
    const { cfg, html } = await generateHTMLString();
    const zip = new JSZip();
    zip.file('index.html', html);
    zip.file('shatter-config.json', JSON.stringify(cfg, null, 2));
    zip.file('source.svg', svgInfo.sanitized);
    zip.file('README.md', buildReadme());
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `shatter-${seed}.zip`);
  };

  const exportJSON = async () => {
    setProgress('Serializing V3 configuration…');
    downloadBlob(
      new Blob([JSON.stringify(await buildV3(), null, 2)], { type: 'application/json' }),
      `shatter-${seed}.shatter.json`,
    );
  };

  const exportReact = async () => {
    setProgress('Packaging React runtime host…');
    const cfg = await buildV3();
    const module = await import('../assets/shatterCoreBundle.js?raw');
    const zip = new JSZip();
    zip.file('ShatterAnimation.tsx', buildReactComponent(cfg, module.default));
    zip.file('shatter-config.json', JSON.stringify(cfg, null, 2));
    zip.file('README.md', buildReactReadme());
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `shatter-react-${seed}.zip`);
  };

  const exportPosterPNG = async () => {
    setProgress('Rendering intact poster…');
    const canvas = document.createElement('canvas');
    canvas.width = svgInfo.width * 2;
    canvas.height = svgInfo.height * 2;
    const url = URL.createObjectURL(new Blob([svgInfo.sanitized], { type: 'image/svg+xml' }));
    try {
      canvas.getContext('2d')!.drawImage(await loadImage(url), 0, 0, canvas.width, canvas.height);
    } finally {
      URL.revokeObjectURL(url);
    }
    downloadBlob(await canvasToBlob(canvas), 'poster.png');
  };

  const exportWebM = async () => {
    if (!previewCanvas) throw new Error('Preview canvas not found');
    setProgress('Recording visual-only WebM…');
    const stream = previewCanvas.captureStream(config.exportFps);
    const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
      ? 'video/webm; codecs=vp9'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    const complete = new Promise<void>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('WebM recording failed'));
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        downloadBlob(new Blob(chunks, { type: 'video/webm' }), `shatter-${seed}.webm`);
        resolve();
      };
    });
    recorder.start();
    const rect = previewCanvas.getBoundingClientRect();
    previewCanvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }));
    window.setTimeout(() => recorder.stop(), execution.timeline.complete + 500);
    await complete;
  };

  const sourceDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgInfo.sanitized)))}`;
  const exportStaticSVG = async () => {
    setProgress('Building static fragment SVG…');
    const defs = fragments.map(fragment => {
      const points = fragment.clipPolygon.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
      return `<clipPath id="clip-${fragment.id}"><polygon points="${points}"/></clipPath>`;
    }).join('\n');
    const groupsMarkup = fragments.map(fragment => `<g id="fragment-${String(fragment.id + 1).padStart(2, '0')}" clip-path="url(#clip-${fragment.id})"><image href="${sourceDataUrl}" x="0" y="0" width="${svgInfo.width}" height="${svgInfo.height}"/></g>`).join('\n');
    const output = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgInfo.width}" height="${svgInfo.height}" viewBox="0 0 ${svgInfo.width} ${svgInfo.height}"><defs>${defs}</defs>${groupsMarkup}</svg>`;
    downloadBlob(new Blob([output], { type: 'image/svg+xml' }), 'fragments.svg');
  };

  const exportAnimatedSVG = async () => {
    if (destructionStyle !== 'physical') throw new Error(capabilities.note);
    setProgress('Baking limited physical motion…');
    const random = createPRNG(seed + 17000);
    const duration = config.animationDuration / 1000;
    const defs: string[] = [];
    const groupsMarkup: string[] = [];
    for (const fragment of fragments) {
      const points = fragment.clipPolygon.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
      defs.push(`<clipPath id="aclip-${fragment.id}"><polygon points="${points}"/></clipPath>`);
      const dx = (fragment.center.x - impactPoint.x) * 0.8;
      const dy = (fragment.center.y - impactPoint.y) * 0.8 + svgInfo.height * 0.6;
      const rotation = (random() - 0.5) * 360;
      groupsMarkup.push(`<g id="fragment-${fragment.id}" clip-path="url(#aclip-${fragment.id})"><image href="${sourceDataUrl}" x="0" y="0" width="${svgInfo.width}" height="${svgInfo.height}"/><animateTransform attributeName="transform" type="translate" values="0,0;0,0;${dx.toFixed(1)},${dy.toFixed(1)}" keyTimes="0;0.06;1" dur="${duration}s" fill="freeze"/><animateTransform attributeName="transform" type="rotate" values="0 ${fragment.center.x} ${fragment.center.y};0 ${fragment.center.x} ${fragment.center.y};${rotation.toFixed(1)} ${fragment.center.x} ${fragment.center.y}" keyTimes="0;0.06;1" dur="${duration}s" fill="freeze" additive="sum"/></g>`);
    }
    const output = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgInfo.width}" height="${svgInfo.height}" viewBox="0 0 ${svgInfo.width} ${svgInfo.height}"><defs>${defs.join('')}</defs>${groupsMarkup.join('')}</svg>`;
    downloadBlob(new Blob([output], { type: 'image/svg+xml' }), 'shatter-animated.svg');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop">
      <div className="bg-surface-800 border border-surface-500 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-600">
          <h2 className="text-base font-semibold text-white">Export</h2>
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Close"><X size={16} /></button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-60 border-r border-surface-600 overflow-y-auto p-3 space-y-4">
            {groups.map(group => (
              <div key={group}>
                <div className="section-title pl-2">{group}</div>
                {FORMATS.filter(format => format.group === group).map(format => {
                  const supported = getExportCapabilities(format.id, destructionStyle, execution.visualStyle).supported;
                  return <button key={format.id} onClick={() => { setSelected(format.id); setProgress(''); }} className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between group ${selected === format.id ? 'bg-accent text-white' : 'hover:bg-surface-600 text-gray-300'} ${supported ? '' : 'opacity-55'}`}>
                    <span className="flex items-center gap-2">{format.recommended && <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">★ REC</span>}{format.name}</span>
                    <ChevronRight size={13} className={selected === format.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} />
                  </button>;
                })}
              </div>
            ))}
          </div>
          <div className="flex-1 p-5 flex flex-col gap-4">
            <div><h3 className="text-base font-semibold text-white">{selectedFormat.name}</h3><p className="text-sm text-gray-400 mt-1">{selectedFormat.description}</p></div>
            <div className="flex flex-wrap gap-2">
              <Badge yes={capabilities.interactive} label="Interactive" />
              <Badge yes={capabilities.audio} label="Audio" />
              <Badge yes={capabilities.transparent} label="Transparent" />
              <Badge yes={capabilities.animation === 'full'} label={capabilities.animation === 'limited' ? 'Limited animation' : 'Full animation'} />
            </div>
            <div className={`rounded-lg p-3 text-xs ${capabilities.supported ? 'bg-surface-700 text-gray-300' : 'bg-red-500/10 border border-red-500/20 text-red-300'}`}>{capabilities.note}</div>
            {progress && <div className="bg-surface-700 rounded-lg px-3 py-2 text-xs font-mono text-gray-300">{progress}</div>}
            <div className="mt-auto flex flex-col gap-2">
              {selected === 'html' && <button onClick={testInteractiveExport} disabled={exporting} className="btn-ghost flex items-center justify-center gap-2 w-full py-2.5 border border-surface-500 rounded-lg"><ExternalLink size={15} />{exporting ? 'Building…' : 'Test Interactive Export'}</button>}
              <button onClick={doExport} disabled={exporting || !capabilities.supported} className="btn-primary flex items-center justify-center gap-2 w-full disabled:opacity-40 disabled:cursor-not-allowed"><Download size={15} />{exporting ? 'Exporting…' : capabilities.supported ? `Export ${selectedFormat.name}` : 'Unavailable for this style'}</button>
            </div>
          </div>
        </div>
        {testHtml && <div className="absolute inset-0 bg-black z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-surface-800 border-b border-surface-600"><h3 className="text-sm font-semibold text-white">Interactive V3 Export Preview</h3><button onClick={() => setTestHtml(null)} className="btn-ghost px-3 py-1.5 text-xs">Close Preview</button></div>
          <iframe srcDoc={testHtml} className="flex-1 w-full border-none bg-black" title="Test Export" sandbox="allow-scripts allow-same-origin" />
        </div>}
      </div>
    </div>
  );
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image load failed'));
    image.src = src;
  });
}

function buildReadme() {
  return '# SVG Shatter Studio V3 Export\n\nOpen `index.html` in a modern browser and click the object. The page embeds the same runtime, renderer, style resolver, audio engine, and serialized fragment textures used by Studio.\n';
}

function buildReactReadme() {
  return '# ShatterAnimation React Component\n\nDrop `ShatterAnimation.tsx` into a React project. It has no animation dependency beyond React: the generated file embeds the shared ShatterCore runtime and V3 configuration.\n\n```tsx\n<ShatterAnimation onShatter={() => {}} onComplete={() => {}} />\n```\n';
}

function buildStandaloneHTML(cfg: ShatterConfigV3, coreSource: string): string {
  const background = cfg.physics.background === 'dark' ? '#111118' : cfg.physics.background === 'light' ? '#f3f4f6' : cfg.physics.background.startsWith('#') ? cfg.physics.background : 'transparent';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shatter Animation</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:${background};min-height:100vh;overflow:hidden}#container{position:relative;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center}canvas{display:block;cursor:crosshair}#hint{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);background:#000b;color:#eee;padding:8px 18px;border-radius:20px;font:500 13px sans-serif;pointer-events:none;transition:opacity .3s}</style></head><body><div id="container"><canvas id="c"></canvas><div id="hint" data-shatter-hint>Click to shatter</div></div><script>window.__SHATTER_CONFIG__=${JSON.stringify(cfg)};</script><script>${coreSource}</script><script>(async()=>{try{window.__SHATTER_HANDLE__=await window.ShatterCore.initShatter('c',window.__SHATTER_CONFIG__)}catch(error){document.body.dataset.shatterError=error instanceof Error?error.message:String(error);document.querySelector('[data-shatter-hint]').textContent='Error loading animation'}})()</script></body></html>`;
}

function buildReactComponent(cfg: ShatterConfigV3, coreSource: string): string {
  return `import React, { useEffect, useId, useRef } from 'react';

const CONFIG = ${JSON.stringify(cfg)};
const SHATTER_CORE_SOURCE = ${JSON.stringify(coreSource)};

function loadShatterCore(): Promise<any> {
  const host = window as any;
  if (host.ShatterCore) return Promise.resolve(host.ShatterCore);
  if (host.__shatterCorePromise) return host.__shatterCorePromise;
  host.__shatterCorePromise = new Promise((resolve, reject) => {
    try {
      const script = document.createElement('script');
      script.dataset.svgShatterCore = 'true';
      script.text = SHATTER_CORE_SOURCE;
      document.head.appendChild(script);
      if (!host.ShatterCore) throw new Error('ShatterCore did not initialize');
      resolve(host.ShatterCore);
    } catch (error) { reject(error); }
  });
  return host.__shatterCorePromise;
}

export interface ShatterAnimationProps {
  className?: string;
  style?: React.CSSProperties;
  onShatter?: () => void;
  onComplete?: () => void;
}

export function ShatterAnimation({ className, style, onShatter, onComplete }: ShatterAnimationProps) {
  const reactId = useId();
  const canvasId = useRef('shatter-' + reactId.replace(/[^a-zA-Z0-9_-]/g, '')).current;
  const callbacks = useRef({ onShatter, onComplete });
  callbacks.current = { onShatter, onComplete };

  useEffect(() => {
    let disposed = false;
    let handle: any;
    loadShatterCore().then(core => core.initShatter(canvasId, CONFIG, {
      onPlaybackChange: (state: string) => { if (state === 'playing') callbacks.current.onShatter?.(); },
      onComplete: () => callbacks.current.onComplete?.(),
    })).then(instance => {
      if (disposed) instance.destroy();
      else handle = instance;
    }).catch(error => { if (!disposed) console.error('Shatter initialization failed', error); });
    return () => { disposed = true; handle?.destroy(); };
  }, [canvasId]);

  return <div className={className} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 240, ...style }}><canvas id={canvasId} style={{ display: 'block' }} /><span data-shatter-hint style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: '#000a', color: '#eee', padding: '6px 14px', borderRadius: 20, fontSize: 12, pointerEvents: 'none', transition: 'opacity .3s' }}>Click to shatter</span></div>;
}
`;
}
