import { SVGInfo } from '../types/shatter';

/** Remove dangerous SVG content while preserving all visual elements */
export function sanitizeSVG(raw: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'image/svg+xml');

  // Check parse error
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Invalid SVG: parse error');

  const svg = doc.documentElement;
  if (svg.tagName.toLowerCase() !== 'svg') throw new Error('Invalid SVG: missing root <svg> element');

  // Walk every element and strip dangerous attributes / elements
  walkNodes(svg);

  return new XMLSerializer().serializeToString(doc);
}

function walkNodes(node: Element) {
  const BLOCKED_ELEMENTS = ['script', 'foreignObject', 'iframe', 'object', 'embed', 'video', 'audio', 'canvas', 'animate'];
  const BLOCKED_ATTRS_PREFIX = ['on']; // event handlers
  const BLOCKED_ATTRS = ['href', 'xlink:href', 'src', 'action', 'formaction'];

  const children = Array.from(node.children);

  for (const child of children) {
    if (BLOCKED_ELEMENTS.includes(child.tagName.toLowerCase())) {
      node.removeChild(child);
      continue;
    }
    // Check href/xlink:href for external resources
    for (const attr of BLOCKED_ATTRS) {
      const val = child.getAttribute(attr) || child.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      if (val && (val.startsWith('javascript:') || val.startsWith('data:text') || /^https?:\/\//.test(val))) {
        child.removeAttribute(attr);
        child.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
      }
    }
    // Remove event handlers
    const attrsToRemove: string[] = [];
    for (let i = 0; i < child.attributes.length; i++) {
      const a = child.attributes[i];
      if (BLOCKED_ATTRS_PREFIX.some(p => a.name.toLowerCase().startsWith(p))) {
        attrsToRemove.push(a.name);
      }
    }
    attrsToRemove.forEach(a => child.removeAttribute(a));

    walkNodes(child);
  }
}

/** Parse SVG metadata */
export function parseSVGInfo(raw: string, fileName: string, fileSize: number): SVGInfo {
  const sanitized = sanitizeSVG(raw);

  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.tagName.toLowerCase() !== 'svg') throw new Error('Invalid SVG: missing root <svg> element');

  const widthAttribute = svg.getAttribute('width');
  const heightAttribute = svg.getAttribute('height');
  let width = parseFloat(widthAttribute || '0');
  let height = parseFloat(heightAttribute || '0');
  const viewBox = svg.getAttribute('viewBox') || '';
  const viewBoxParts = viewBox ? viewBox.split(/[\s,]+/).map(Number) : [];
  if (viewBox && (viewBoxParts.length !== 4 || viewBoxParts.some(value => !Number.isFinite(value)) || viewBoxParts[2] <= 0 || viewBoxParts[3] <= 0)) {
    throw new Error('Invalid SVG: viewBox must contain four finite values with positive dimensions');
  }
  if (widthAttribute && (!Number.isFinite(width) || width <= 0)) throw new Error('Invalid SVG: width must be positive');
  if (heightAttribute && (!Number.isFinite(height) || height <= 0)) throw new Error('Invalid SVG: height must be positive');

  // Fall back to viewBox dimensions
  if ((!width || !height) && viewBox) {
    if (viewBoxParts.length === 4) {
      width = viewBoxParts[2];
      height = viewBoxParts[3];
    }
  }

  // Final fallback
  if (!Number.isFinite(width) || width <= 0) width = 512;
  if (!Number.isFinite(height) || height <= 0) height = 512;

  const blob = new Blob([sanitized], { type: 'image/svg+xml' });
  const blobUrl = URL.createObjectURL(blob);

  return { raw, sanitized, width, height, viewBox, fileName, fileSize, blobUrl };
}
