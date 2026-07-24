import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';

const ALLOWED = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.heic']);
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file

/**
 * File upload endpoint (GOLD §5.5).
 * - Auth required.
 * - Stores the file OUTSIDE the webroot (private), never web-addressable.
 * - Creates a LabReport row with status UPLOADED, RLS-scoped to the user.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const ext = extname(file.name).toLowerCase();
  if (!ALLOWED.has(ext)) {
    return NextResponse.json({ error: `File type ${ext} not allowed` }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 25 MB)' }, { status: 413 });
  }

  const base = process.env.UPLOADS_DIR || '/var/lib/trt/uploads';
  const id = randomUUID();
  const storedName = `${id}${ext}`;
  const dir = join(base, session.user.id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const filePath = join(dir, storedName);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buf, { mode: 0o600 });

  const db = prismaFor(session.user.id);
  const patient = await db.patient.findUnique({ where: { ownerId: session.user.id } });
  if (!patient) return NextResponse.json({ error: 'No patient record' }, { status: 400 });

  await db.labReport.create({
    data: {
      patientId: patient.id,
      ownerId: session.user.id,
      fileName: file.name,
      filePath, // private, not web-accessible
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: BigInt(file.size),
      status: 'UPLOADED',
    },
  });

  await db.auditLog.create({
    data: { userId: session.user.id, action: 'create', entity: 'lab_reports', entityId: id },
  });

  return NextResponse.json({ ok: true });
}
