'use client';

import { useState, useCallback, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { UploadCloud, File as FileIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.heic';

export function UploadZone() {
  const router = useRouter();
  const t = useTranslations('Upload');
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) return;
      setError(null);
      const next = Array.from(incoming);
      setFiles((prev) => [...prev, ...next]);
    },
    [],
  );

  const uploadAll = async () => {
    setError(null);
    for (const file of files) {
      setProgress((p) => ({ ...p, [file.name]: 0 }));
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await fetch('/dashboard/labs/upload', { method: 'POST', body: fd });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `Upload failed for ${file.name}`);
        }
        setProgress((p) => ({ ...p, [file.name]: 100 }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
        return;
      }
    }
    setFiles([]);
    setProgress({});
    startTransition(() => router.refresh());
  };

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors',
          dragging ? 'border-primary bg-accent/50' : 'border-border hover:border-primary/50',
        )}
      >
        <UploadCloud className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">{t('dropHere')}</p>
        <p className="text-xs text-muted-foreground">{t('formats')}</p>
        <input
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f) => (
            <li key={f.name} className="flex items-center gap-3 rounded-md border p-3 text-sm">
              <FileIcon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
              {progress[f.name] !== undefined && (
                <span className="text-xs text-muted-foreground">{progress[f.name]}%</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {files.length > 0 && (
        <Button onClick={uploadAll} disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t('uploadButton', { count: files.length })}
        </Button>
      )}
    </div>
  );
}
