import React, { useCallback, useState } from 'react';
import { Upload, FileImage } from 'lucide-react';
import { parseSVGInfo } from '../engine/svgParser';
import { SVGInfo } from '../types/shatter';

interface UploadPanelProps {
  svgInfo: SVGInfo | null;
  onUpload: (info: SVGInfo) => void;
  onError: (msg: string) => void;
}

const MAX_SIZE_MB = 10;

export const UploadPanel: React.FC<UploadPanelProps> = ({ svgInfo, onUpload, onError }) => {
  const [dragging, setDragging] = useState(false);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml') {
      onError('Please upload an SVG file.');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      onError(`File too large (max ${MAX_SIZE_MB}MB).`);
      return;
    }

    try {
      const raw = await file.text();
      const info = parseSVGInfo(raw, file.name, file.size);
      onUpload(info);
    } catch (e: any) {
      onError(e?.message || 'Failed to parse SVG.');
    }
  }, [onUpload, onError]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }, [processFile]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  if (svgInfo) {
    return (
      <div className="space-y-3">
        <div className="panel p-3 flex items-start gap-3">
          <div className="w-14 h-14 rounded-lg bg-surface-700 border border-surface-500 overflow-hidden flex-shrink-0 flex items-center justify-center">
            <img
              src={svgInfo.blobUrl}
              alt="SVG preview"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm font-medium text-white truncate">{svgInfo.fileName}</p>
            <div className="space-y-0.5">
              <p className="text-xs text-gray-500">
                <span className="text-gray-400">Size</span> {svgInfo.width} × {svgInfo.height}
              </p>
              {svgInfo.viewBox && (
                <p className="text-xs text-gray-500 truncate">
                  <span className="text-gray-400">ViewBox</span> {svgInfo.viewBox}
                </p>
              )}
              <p className="text-xs text-gray-500">
                <span className="text-gray-400">File</span> {formatBytes(svgInfo.fileSize)}
              </p>
            </div>
          </div>
        </div>

        <label className="btn-secondary w-full flex items-center justify-center gap-2 cursor-pointer text-sm">
          <Upload size={14} />
          Replace SVG
          <input type="file" accept=".svg,image/svg+xml" className="hidden" onChange={handleFileInput} />
        </label>
      </div>
    );
  }

  return (
    <label
      className={`
        flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed cursor-pointer
        transition-all duration-200 min-h-[180px]
        ${dragging
          ? 'border-accent bg-accent/10 drop-zone-active'
          : 'border-surface-400 hover:border-accent/60 hover:bg-surface-700/50'
        }
      `}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${dragging ? 'bg-accent/20' : 'bg-surface-600'}`}>
        <FileImage size={22} className={dragging ? 'text-accent' : 'text-gray-400'} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-gray-200">Drop SVG here</p>
        <p className="text-xs text-gray-500 mt-0.5">or click to choose</p>
      </div>
      <span className="text-xs text-gray-600">Max {MAX_SIZE_MB}MB</span>
      <input type="file" accept=".svg,image/svg+xml" className="hidden" onChange={handleFileInput} />
    </label>
  );
};
