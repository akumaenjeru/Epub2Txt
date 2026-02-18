import JSZip from 'jszip';
import { ProcessedBook, EpubManifestItem, EpubSpineItem } from '../types';

export const convertEpubToText = async (
  file: File,
  onProgress: (percent: number, message: string) => void
): Promise<ProcessedBook> => {
  const zip = new JSZip();
  
  onProgress(10, 'Unzipping file...');
  const loadedZip = await zip.loadAsync(file);

  // 1. Find Container to locate OPF
  const containerFile = loadedZip.file('META-INF/container.xml');
  if (!containerFile) {
    throw new Error('Invalid EPUB: Missing META-INF/container.xml');
  }
  const containerXml = await containerFile.async('string');
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, 'application/xml');
  
  const rootfile = containerDoc.querySelector('rootfile');
  if (!rootfile) throw new Error('Invalid EPUB: No rootfile in container.xml');
  
  const fullPath = rootfile.getAttribute('full-path');
  if (!fullPath) throw new Error('Invalid EPUB: rootfile path is missing');

  // Directory of the OPF file (used to resolve relative paths)
  const opfDir = fullPath.substring(0, fullPath.lastIndexOf('/') + 1);

  // 2. Parse OPF
  onProgress(20, 'Reading metadata...');
  const opfFile = loadedZip.file(fullPath);
  if (!opfFile) throw new Error(`Invalid EPUB: OPF file ${fullPath} missing`);
  
  const opfContent = await opfFile.async('string');
  const opfDoc = parser.parseFromString(opfContent, 'application/xml');

  // Metadata
  const title = opfDoc.querySelector('metadata > title')?.textContent || 'Untitled';
  const author = opfDoc.querySelector('metadata > creator')?.textContent || 'Unknown Author';

  // Manifest (ID -> HREF)
  const manifestItems: Record<string, EpubManifestItem> = {};
  const manifestNodes = opfDoc.querySelectorAll('manifest > item');
  manifestNodes.forEach(node => {
    const id = node.getAttribute('id');
    const href = node.getAttribute('href');
    const mediaType = node.getAttribute('media-type');
    const properties = node.getAttribute('properties') || '';
    if (id && href && mediaType) {
      manifestItems[id] = { id, href, mediaType, properties };
    }
  });

  // Spine (Order)
  const spineNodes = opfDoc.querySelectorAll('spine > itemref');
  const spine: EpubSpineItem[] = Array.from(spineNodes).map(node => ({
    idref: node.getAttribute('idref') || ''
  })).filter(item => item.idref && manifestItems[item.idref]);

  // 3. Process Spine Items
  let fullText = '';
  const totalItems = spine.length;

  for (let i = 0; i < totalItems; i++) {
    const progressPercent = 30 + Math.round((i / totalItems) * 60);
    onProgress(progressPercent, `Processing chapter ${i + 1} of ${totalItems}...`);

    const item = manifestItems[spine[i].idref];
    
    // Heuristic: Skip ToC
    // 1. Check EPUB3 'nav' property
    if (item.properties && item.properties.includes('nav')) {
      console.log(`Skipping likely ToC (nav property): ${item.href}`);
      continue;
    }

    // 2. Check filename or ID if it's early in the book
    const lowerHref = item.href.toLowerCase();
    const lowerId = item.id.toLowerCase();
    const isEarly = i < 3; // Only check first few items
    if (isEarly && (lowerHref.includes('toc') || lowerHref.includes('contents') || lowerId.includes('toc'))) {
       console.log(`Skipping likely ToC (filename heuristic): ${item.href}`);
       continue;
    }

    // Resolve path
    // item.href is relative to opf file. 
    // We need to combine opfDir + item.href, but handle "../" if present (though rare in simple structures)
    // Simple concat works for most standard OEBPS structures.
    const fileZipPath = opfDir + item.href; 
    
    // Handle URL encoded chars in filenames if necessary (simple decode)
    const decodedPath = decodeURIComponent(fileZipPath);
    
    const fileData = loadedZip.file(decodedPath);
    
    if (!fileData) {
      console.warn(`File missing from zip: ${decodedPath}`);
      continue;
    }

    const htmlContent = await fileData.async('string');
    const text = extractTextFromHtml(htmlContent);
    
    if (text.trim().length > 0) {
      fullText += text + '\n\n------------------------------------------------\n\n';
    }
  }

  onProgress(100, 'Finalizing...');

  return {
    filename: file.name,
    title,
    author,
    content: fullText.trim(),
    size: fullText.length
  };
};

/**
 * Extracts plain text from an XHTML string.
 * Handles block elements to ensure proper spacing.
 */
function extractTextFromHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html'); // 'text/html' handles HTML entities better than 'application/xhtml+xml' for loose parsing

  // Remove scripts and styles
  const scripts = doc.querySelectorAll('script, style, link, meta, title, svg');
  scripts.forEach(node => node.remove());

  // Function to process nodes and insert newlines for block elements
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();
      
      let prefix = '';
      let suffix = '';

      // Block elements that usually imply a break
      if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'br', 'hr', 'tr'].includes(tagName)) {
        if (tagName === 'p') suffix = '\n\n';
        else if (tagName === 'br') suffix = '\n';
        else if (tagName === 'li') prefix = '• '; // Bullet points
        else suffix = '\n';
      }

      // Recursively get children text
      let innerText = '';
      node.childNodes.forEach(child => {
        innerText += walk(child);
      });

      return prefix + innerText + suffix;
    }

    return '';
  };

  const body = doc.body || doc.documentElement;
  let rawText = walk(body);

  // Normalize whitespace
  // 1. Collapse multiple newlines > 2 into 2
  rawText = rawText.replace(/\n{3,}/g, '\n\n');
  // 2. Trim lines
  rawText = rawText.split('\n').map(line => line.trim()).join('\n');
  // 3. Decode entities (handled by DOMParser usually, but good to be safe if manual)
  // already done by textContent
  
  return rawText.trim();
}
