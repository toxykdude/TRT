/**
 * Build the deterministic knowledge base from a corpus directory.
 *
 *   pnpm --filter @trt/kb build
 *
 * Walks the corpus (default /var/lib/trt/corpus, or CORPUS_DIR env), extracts
 * text from each PDF/EPUB/image, and indexes it into the SQLite KB. Idempotent:
 * already-indexed sources (same path + content hash) are skipped.
 */
import { readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';
import { KbStore, extractDocument, slugify } from '../packages/kb/src/index.js';

const CORPUS_DIR = process.env.CORPUS_DIR || '/var/lib/trt/corpus';
const KB_DB_PATH = process.env.KB_DB_PATH || '/var/lib/trt/kb/knowledge.db';
const TEXT_OUT_DIR = process.env.KB_TEXT_DIR || '/var/lib/trt/kb/text';

const EXTS = new Set(['.pdf', '.epub', '.png', '.jpg', '.jpeg', '.heic', '.webp', '.txt']);

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (EXTS.has(extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

async function main() {
  console.log(`Corpus dir: ${CORPUS_DIR}`);
  console.log(`KB database: ${KB_DB_PATH}`);

  const files = await walk(CORPUS_DIR);
  console.log(`Found ${files.length} source file(s)\n`);

  const store = new KbStore(KB_DB_PATH);
  let indexed = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const relName = file.replace(CORPUS_DIR + '/', '');

    // Plain text files: read directly (no extraction needed).
    if (ext === '.txt') {
      try {
        const { readFile, writeFile, mkdir } = await import('node:fs/promises');
        const text = await readFile(file, 'utf8');
        const hash = createHash('sha1').update(text).digest('hex');
        if (store.isIndexed(file, hash)) {
          skipped++;
          continue;
        }
        const r = store.indexDocument({
          title: relName,
          sourcePath: file,
          contentHash: hash,
          method: 'plaintext',
          pages: null,
          text,
        });
        await mkdir(TEXT_OUT_DIR, { recursive: true });
        await writeFile(join(TEXT_OUT_DIR, `${slugify(file)}.txt`), text);
        console.log(`  ✓ ${relName} (${r.chunkCount} chunks)`);
        indexed++;
      } catch (e) {
        console.log(`  ✗ ${relName}: ${e instanceof Error ? e.message : e}`);
        failed++;
      }
      continue;
    }

    // PDF / EPUB / image: extract then index.
    try {
      const doc = await extractDocument(file);
      if (!doc.text || doc.text.length < 50) {
        console.log(`  · ${relName}: no text extracted (${doc.method})`);
        failed++;
        continue;
      }
      if (store.isIndexed(doc.sourcePath, doc.contentHash)) {
        skipped++;
        continue;
      }
      const r = store.indexDocument({
        title: doc.title,
        sourcePath: doc.sourcePath,
        contentHash: doc.contentHash,
        method: doc.method,
        pages: doc.pages,
        text: doc.text,
      });
      // Persist extracted text for Graphiti ingestion later.
      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir(TEXT_OUT_DIR, { recursive: true });
      await writeFile(join(TEXT_OUT_DIR, `${slugify(doc.sourcePath)}.txt`), doc.text);
      console.log(
        `  ✓ ${relName} [${doc.method}] → ${r.chunkCount} chunks, ${doc.text.length.toLocaleString()} chars`,
      );
      indexed++;
    } catch (e) {
      console.log(`  ✗ ${relName}: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  console.log(
    `\n✓ KB build complete: ${indexed} indexed, ${skipped} skipped, ${failed} failed, ${store.docCount()} total documents.`,
  );
  store.close();
}

main().catch((e) => {
  console.error('✗ KB build failed:', e);
  process.exit(1);
});
