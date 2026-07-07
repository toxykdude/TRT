/**
 * Corpus text extraction — deterministic.
 *
 * Converts source documents (PDF, EPUB, image) to clean UTF-8 text using local
 * CLI tools (poppler's pdftotext, unzip for EPUB) and, only as a fallback for
 * scanned/image PDFs, the OCR HTTP endpoint. No AI model is involved; OCR is a
 * classical image-recognition step, not a generative model.
 *
 * Output is one text file per source plus a manifest entry. Re-runnable: sources
 * already extracted (same size + mtime) are skipped.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, extname, basename, join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export type ExtractedDoc = {
  /** absolute path to the source file */
  sourcePath: string;
  /** display title (derived from filename) */
  title: string;
  /** extracted plain text */
  text: string;
  /** extraction method used */
  method: 'pdftotext' | 'epub' | 'ocr' | 'empty';
  /** number of pages (PDF only, else null) */
  pages: number | null;
  /** content hash for change detection */
  contentHash: string;
};

const OCR_ENDPOINT = process.env.OCR_ENDPOINT || 'https://imagedit.powerhousegym.co/ocr';

/** Slugify a filename into a stable storage key. */
export function slugify(filePath: string): string {
  const base = basename(filePath).replace(/\.[^.]+$/, '');
  const h = createHash('sha1').update(filePath).digest('hex').slice(0, 8);
  return `${base.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 60)}_${h}`;
}

/** Pretty title from a filename. */
export function titleFromPath(filePath: string): string {
  return basename(filePath)
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function sha1File(path: string): Promise<string> {
  const buf = await readFile(path);
  return createHash('sha1').update(buf).digest('hex');
}

/** Run pdftotext with layout preservation; returns {text, pages}. */
async function extractPdf(path: string): Promise<{ text: string; pages: number | null; ocr: boolean }> {
  try {
    // -layout keeps columns; stdout via "-"
    const { stdout } = await exec('pdftotext', ['-layout', '-q', path, '-'], {
      maxBuffer: 256 * 1024 * 1024,
    });
    const text = stdout.trim();
    // Heuristic: if pdftotext yields very little text relative to file size,
    // the PDF is likely scanned images → flag for OCR.
    const sizeKb = (await stat(path)).size / 1024;
    const tooSparse = text.length < 200 && sizeKb > 100;
    return { text, pages: null, ocr: tooSparse };
  } catch {
    return { text: '', pages: null, ocr: true };
  }
}

/** POST a file's bytes to the OCR endpoint and return extracted text. */
async function ocrFile(path: string): Promise<string> {
  const buf = await readFile(path);
  const ext = extname(path).toLowerCase() || '.png';
  const mime =
    ext === '.pdf'
      ? 'application/pdf'
      : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.heic'
          ? 'image/heic'
          : 'image/png';
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime }), basename(path));

  const res = await fetch(OCR_ENDPOINT, { method: 'POST', body: form });
  if (!res.ok) {
    throw new Error(`OCR endpoint ${res.status}: ${await res.text().catch(() => '')}`);
  }
  // Accept either plain text or {text: "..."}
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const data = (await res.json()) as { text?: string; result?: string; content?: string };
    return (data.text ?? data.result ?? data.content ?? '').trim();
  }
  return (await res.text()).trim();
}

/** Extract an EPUB: unzip, concatenate XHTML chapter text. */
async function extractEpub(path: string): Promise<string> {
  const { stdout: listRaw } = await exec('unzip', ['-l', path]);
  const htmlFiles = listRaw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /\.(x?html?|htm)$/i.test(l))
    .map((l) => l.split(/\s+/).slice(-1)[0])
    .filter((f): f is string => !!f && !f.includes(' '));
  if (htmlFiles.length === 0) return '';

  // Extract to a temp dir, read each chapter, strip tags.
  const parts: string[] = [];
  for (const f of htmlFiles.sort()) {
    try {
      const { stdout: raw } = await exec('unzip', ['-p', path, f], { maxBuffer: 16 * 1024 * 1024 });
      const text = raw
        // block elements → newlines
        .replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '') // strip remaining tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (text) parts.push(text);
    } catch {
      // skip unreadable chapter
    }
  }
  return parts.join('\n\n');
}

/**
 * Extract a single source document to text.
 * Method selection: PDF → pdftotext (→ OCR if sparse); EPUB → unzip; image → OCR.
 */
export async function extractDocument(sourcePath: string): Promise<ExtractedDoc> {
  const ext = extname(sourcePath).toLowerCase();
  const contentHash = await sha1File(sourcePath);
  const title = titleFromPath(sourcePath);
  let text = '';
  let method: ExtractedDoc['method'] = 'empty';
  let pages: number | null = null;

  if (ext === '.pdf') {
    const r = await extractPdf(sourcePath);
    text = r.text;
    pages = r.pages;
    method = 'pdftotext';
    if ((!text || r.ocr)) {
      try {
        text = await ocrFile(sourcePath);
        method = 'ocr';
      } catch {
        // keep whatever pdftotext gave us
        method = text ? 'pdftotext' : 'empty';
      }
    }
  } else if (ext === '.epub') {
    text = await extractEpub(sourcePath);
    method = 'epub';
  } else if (['.png', '.jpg', '.jpeg', '.heic', '.webp'].includes(ext)) {
    try {
      text = await ocrFile(sourcePath);
      method = 'ocr';
    } catch {
      method = 'empty';
    }
  }

  return { sourcePath, title, text, method, pages, contentHash };
}

/** Persist extracted text + return the doc. */
export async function extractAndStore(sourcePath: string, outDir: string): Promise<ExtractedDoc> {
  const doc = await extractDocument(sourcePath);
  const slug = slugify(sourcePath);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, `${slug}.txt`), doc.text, 'utf8');
  return { ...doc, sourcePath: slug };
}
