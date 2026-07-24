/**
 * PDF → PNG renderer (P0.2.a §4).
 *
 * Uses poppler's `pdftoppm` (the same poppler package `packages/kb` already
 * depends on via `pdftotext`). Zero native npm deps — no node-canvas / cairo /
 * pango to compile, which keeps the Debian LXC deploy clean. Images are passed
 * to the vision model as base64 data URLs.
 *
 *   PDF → pdftoppm -png → one PNG buffer per page (capped)
 */
import { execFile } from 'node:child_process';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/** Cap the number of pages rendered to bound cost/latency. */
export const MAX_PAGES = 8;

/** A rendered page image ready for the vision model. */
export type PageImage = {
  /** 1-indexed page number */
  page: number;
  /** MIME type, e.g. "image/png" */
  mimeType: string;
  /** raw image bytes */
  data: Buffer;
};

/** A single rendered image plus its data URL. */
export type PageImageInput = PageImage & {
  /** `data:image/png;base64,...` for OpenAI image_url input */
  dataUrl: string;
};

/** Read a file and, for images, return it directly as a single "page". */
async function readImageFile(filePath: string, mimeType: string): Promise<PageImage[]> {
  const data = await readFile(filePath);
  return [{ page: 1, mimeType, data }];
}

/**
 * Render a lab document into page images for the vision model.
 * - PDF  → pdftoppm → one PNG per page (capped at MAX_PAGES)
 * - image → returned directly as a single page
 *
 * The tmp dir is always cleaned up. Throws on poppler failure (caller surfaces
 * it as a FAILED ExtractionRun).
 */
export async function renderPages(filePath: string, mimeType: string): Promise<PageImage[]> {
  const ext = extname(filePath).toLowerCase();
  const isPdf = ext === '.pdf' || mimeType === 'application/pdf';

  if (!isPdf) {
    // Image: pass through. Normalize the MIME from the extension when needed.
    const imgMime =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.heic'
            ? 'image/heic'
            : 'image/png';
    return readImageFile(filePath, imgMime);
  }

  // PDF → pdftoppm. -r 150 is a good fidelity/size tradeoff for lab reports.
  let tmp: string | null = null;
  try {
    tmp = await mkdtemp(join(tmpdir(), 'trt-extract-'));
    const prefix = join(tmp, 'page');
    // pdftoppm names files page-1.png, page-2.png, ...
    await exec(
      'pdftoppm',
      ['-png', '-r', '150', '-l', String(MAX_PAGES), filePath, prefix],
      {
        maxBuffer: 256 * 1024 * 1024,
        // Bound the render — a pathological PDF must not hang the request
        // handler indefinitely (the vision call has its own 300s; the render
        // had none). execFile rejects cleanly on timeout (RES-3).
        timeout: 120_000,
      },
    );

    // pdftoppm zero-pads names when there are ≥10 pages; list + numeric sort.
    const dir = tmp;
    const entries = await readdir(dir);
    const files = entries
      .filter((f) => f.endsWith('.png'))
      .map((f) => join(dir, f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const pages: PageImage[] = [];
    for (let i = 0; i < files.length; i++) {
      pages.push({ page: i + 1, mimeType: 'image/png', data: await readFile(files[i]!) });
    }
    if (pages.length === 0) {
      throw new Error('pdftoppm produced no pages');
    }
    return pages;
  } finally {
    if (tmp) await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/** Convert rendered pages to OpenAI image_url data-URL inputs. */
export function toDataUrlInputs(pages: PageImage[]): PageImageInput[] {
  return pages.map((p) => ({
    ...p,
    dataUrl: `data:${p.mimeType};base64,${p.data.toString('base64')}`,
  }));
}
