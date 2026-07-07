/**
 * Deterministic knowledge-base store.
 *
 * SQLite-backed chunk store with TF-IDF + BM25 ranking. No embedding model, no
 * external service — the whole KB runs in-process and is fully reproducible:
 * the same query always returns the same ranked passages.
 *
 * Schema:
 *   documents(id, title, source_path, content_hash, method, pages, char_count)
 *   chunks(id, document_id, ordinal, page, text)
 *   terms(term, document_frequency)            — DF per term across the corpus
 *   chunk_terms(chunk_id, term, tf)            — TF per (chunk, term)
 *
 * Search: tokenize query → for each chunk, BM25 score over chunk_terms (using
 * global DF from terms) → return top-k with source citation.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type KbDocument = {
  id: number;
  title: string;
  sourcePath: string;
  contentHash: string;
  method: string;
  pages: number | null;
  charCount: number;
};

export type KbPassage = {
  chunkId: number;
  documentTitle: string;
  sourcePath: string;
  page: number | null;
  ordinal: number;
  text: string;
  score: number;
};

const CHUNK_TARGET_CHARS = 1000;
const CHUNK_MAX_CHARS = 1500;

/** Tokenize: lowercase, split on non-alphanumeric, drop very short/stopword-ish tokens. */
const STOP = new Set([
  'the','a','an','and','or','but','of','to','in','on','for','with','as','by','at','from',
  'is','are','was','were','be','been','being','this','that','these','those','it','its',
  'has','have','had','do','does','did','will','would','can','could','may','might','must',
  'shall','should','not','no','nor','so','than','then','there','here','which','who','whom',
  'what','where','when','why','how','all','any','both','each','few','more','most','other',
  'some','such','only','own','same','very','just','too','also','about','into','through',
  'during','before','after','above','below','up','down','out','off','over','under','again',
  'further','once','i','you','he','she','we','they','them','his','her','their','our','your',
]);
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/** Sentence/paragraph-aware chunking → ~1000 char chunks. */
export function chunkText(text: string): { text: string; page: null }[] {
  const clean = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n');
  // Split on paragraph boundaries, accumulate up to target size.
  const paragraphs = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let buf = '';
  const flush = () => {
    const t = buf.trim();
    if (t.length > 0) chunks.push(t);
    buf = '';
  };
  for (const p of paragraphs) {
    if ((buf + '\n\n' + p).length > CHUNK_MAX_CHARS && buf) {
      flush();
    }
    buf = buf ? `${buf}\n\n${p}` : p;
    if (buf.length >= CHUNK_TARGET_CHARS) flush();
  }
  flush();
  return chunks.map((text) => ({ text, page: null }));
}

export class KbStore {
  private db: Database.Database;

  constructor(public readonly dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.migrate();
  }

  close() {
    this.db.close();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        source_path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        method TEXT NOT NULL,
        pages INTEGER,
        char_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        page INTEGER,
        text TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS terms (
        term TEXT PRIMARY KEY,
        document_frequency INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS chunk_terms (
        chunk_id INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
        term TEXT NOT NULL,
        tf INTEGER NOT NULL,
        PRIMARY KEY (chunk_id, term)
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);
      CREATE INDEX IF NOT EXISTS idx_chunk_terms_term ON chunk_terms(term);
    `);
  }

  /** Has this exact source (by path + content hash) already been ingested? */
  isIndexed(sourcePath: string, contentHash: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM documents WHERE source_path = ? AND content_hash = ?')
      .get(sourcePath, contentHash);
    return !!row;
  }

  /** Index a document: split into chunks, compute TF, update DF. Idempotent per hash. */
  indexDocument(doc: {
    title: string;
    sourcePath: string;
    contentHash: string;
    method: string;
    pages: number | null;
    text: string;
  }): { docId: number; chunkCount: number } {
    if (this.isIndexed(doc.sourcePath, doc.contentHash)) {
      const existing = this.db
        .prepare('SELECT id FROM documents WHERE source_path = ? AND content_hash = ?')
        .get(doc.sourcePath, doc.contentHash) as { id: number };
      return { docId: existing.id, chunkCount: 0 };
    }

    const chunks = chunkText(doc.text);
    const insertDoc = this.db.prepare(
      `INSERT INTO documents (title, source_path, content_hash, method, pages, char_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertChunk = this.db.prepare(
      'INSERT INTO chunks (document_id, ordinal, page, text) VALUES (?, ?, ?, ?)',
    );
    const upsertTermDf = this.db.prepare(
      `INSERT INTO terms (term, document_frequency) VALUES (?, 1)
       ON CONFLICT(term) DO UPDATE SET document_frequency = document_frequency + 1`,
    );
    const insertChunkTerm = this.db.prepare(
      'INSERT INTO chunk_terms (chunk_id, term, tf) VALUES (?, ?, ?)',
    );

    const tx = this.db.transaction(() => {
      const info = insertDoc.run(
        doc.title,
        doc.sourcePath,
        doc.contentHash,
        doc.method,
        doc.pages,
        doc.text.length,
      );
      const docId = Number(info.lastInsertRowid);

      const docTerms = new Set<string>();
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]!;
        const ci = insertChunk.run(docId, i, c.page, c.text);
        const chunkId = Number(ci.lastInsertRowid);
        const tf = new Map<string, number>();
        for (const t of tokenize(c.text)) tf.set(t, (tf.get(t) ?? 0) + 1);
        for (const [term, count] of tf) {
          insertChunkTerm.run(chunkId, term, count);
          docTerms.add(term);
        }
      }
      for (const term of docTerms) upsertTermDf.run(term);
      return { docId, chunkCount: chunks.length };
    });

    return tx();
  }

  /** Number of indexed documents. */
  docCount(): number {
    return Number(
      (this.db.prepare('SELECT COUNT(*) AS n FROM documents').get() as { n: number }).n,
    );
  }

  /** BM25 search over the corpus. Returns top-k cited passages. */
  search(query: string, k = 5): KbPassage[] {
    const qTerms = Array.from(new Set(tokenize(query)));
    if (qTerms.length === 0) return [];

    const totalDocs = this.docCount() || 1;
    const avgdl = Number(
      (
        this.db
          .prepare('SELECT COALESCE(AVG(length),0) AS a FROM (SELECT length(text) AS length FROM chunks)')
          .get() as { a: number }
      ).a,
    ) || 1;

    // BM25 params
    const k1 = 1.5;
    const b = 0.75;

    // Gather candidate chunks that contain any query term, with their DF and TF.
    const placeholders = qTerms.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT ct.chunk_id, ct.term, ct.tf,
                c.text, c.ordinal, c.page, c.document_id,
                length(c.text) AS dl,
                t.document_frequency AS df
         FROM chunk_terms ct
         JOIN chunks c ON c.id = ct.chunk_id
         JOIN terms t ON t.term = ct.term
         WHERE ct.term IN (${placeholders})`,
      )
      .all(...qTerms) as Array<{
        chunk_id: number;
        term: string;
        tf: number;
        text: string;
        ordinal: number;
        page: number | null;
        document_id: number;
        dl: number;
        df: number;
      }>;

    // Accumulate BM25 score per chunk.
    const byChunk = new Map<
      number,
      { text: string; ordinal: number; page: number | null; documentId: number; score: number }
    >();
    for (const r of rows) {
      const idf = Math.log(1 + (totalDocs - r.df + 0.5) / (r.df + 0.5));
      const tfNorm = (r.tf * (k1 + 1)) / (r.tf + k1 * (1 - b + (b * r.dl) / avgdl));
      const contribution = idf * tfNorm;
      const entry = byChunk.get(r.chunk_id);
      if (entry) entry.score += contribution;
      else
        byChunk.set(r.chunk_id, {
          text: r.text,
          ordinal: r.ordinal,
          page: r.page,
          documentId: r.document_id,
          score: contribution,
        });
    }

    // Resolve document titles.
    const docIds = Array.from(new Set([...byChunk.values()].map((v) => v.documentId)));
    const titleMap = new Map<number, string>();
    if (docIds.length) {
      const ph = docIds.map(() => '?').join(',');
      const titleRows = this.db
        .prepare(`SELECT id, title FROM documents WHERE id IN (${ph})`)
        .all(...docIds) as Array<{ id: number; title: string }>;
      for (const t of titleRows) titleMap.set(t.id, t.title);
    }

    return [...byChunk.entries()]
      .map(([chunkId, v]) => ({
        chunkId,
        documentTitle: titleMap.get(v.documentId) ?? 'Unknown',
        sourcePath: '',
        page: v.page,
        ordinal: v.ordinal,
        text: v.text,
        score: v.score,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
