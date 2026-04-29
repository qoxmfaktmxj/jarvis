'use client';

import { useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/gif',
  'application/zip',
];

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileUploaderProps {
  resourceType?: string;
  resourceId?: string;
  onSuccess?: (rawSourceId: string) => void;
}

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: number; filename: string }
  | { status: 'success'; filename: string; sizeBytes: number; rawSourceId: string }
  | { status: 'error'; message: string };

export function FileUploader({ resourceType, resourceId, onSuccess }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const [isDragOver, setIsDragOver] = useState(false);
  const t = useTranslations('Upload.Errors');

  const uploadFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setUploadState({ status: 'error', message: `File type not supported: ${file.type}` });
        return;
      }

      if (file.size > MAX_SIZE_BYTES) {
        setUploadState({ status: 'error', message: 'File exceeds 50 MB limit' });
        return;
      }

      setUploadState({ status: 'uploading', progress: 0, filename: file.name });

      try {
        // Step 1: Get presigned URL
        const presignRes = await fetch('/api/upload/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
        });

        if (!presignRes.ok) {
          const err = await presignRes.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Failed to get presigned URL');
        }

        const { presignedUrl, objectKey } = await presignRes.json() as { presignedUrl: string; objectKey: string };

        // Step 2: Upload directly to MinIO via presigned PUT URL
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', presignedUrl);
          xhr.setRequestHeader('Content-Type', file.type);

          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setUploadState({ status: 'uploading', progress: pct, filename: file.name });
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`MinIO upload failed with status ${xhr.status}`));
            }
          });

          xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
          xhr.send(file);
        });

        // Step 2b: Finalize — verify magic bytes server-side before registering
        const finalizeRes = await fetch('/api/upload/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ objectKey, declaredMimeType: file.type }),
        });

        if (!finalizeRes.ok) {
          const finalizeErr = await finalizeRes.json().catch(() => ({}));
          const code = (finalizeErr as { error?: string }).error;
          if (code === 'magic_byte_mismatch') {
            throw new Error(t('magicMismatch', { declared: file.type }));
          }
          throw new Error(t('finalizeFailed'));
        }

        // Step 3: Register file in raw_source table
        const registerRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            objectKey,
            filename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            ...(resourceType ? { resourceType } : {}),
            ...(resourceId ? { resourceId } : {}),
          }),
        });

        if (!registerRes.ok) {
          const registerErr = await registerRes.json().catch(() => ({}));
          const code = (registerErr as { error?: string }).error;
          if (code === 'forbidden_object_key') {
            throw new Error(t('pathTraversal'));
          }
          if (code === 'magic_byte_mismatch') {
            throw new Error(t('magicMismatch', { declared: file.type }));
          }
          throw new Error((registerErr as { error?: string }).error ?? 'Failed to register file');
        }

        const { rawSourceId } = await registerRes.json() as { rawSourceId: string };

        setUploadState({ status: 'success', filename: file.name, sizeBytes: file.size, rawSourceId });
        onSuccess?.(rawSourceId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setUploadState({ status: 'error', message });
      }
    },
    [resourceType, resourceId, onSuccess, t],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    // Reset input so re-selecting same file triggers onChange
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors',
          isDragOver
            ? 'border-isu-500 bg-isu-50 dark:bg-isu-950'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50',
          uploadState.status === 'uploading' && 'pointer-events-none opacity-70',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleFileChange}
        />

        {uploadState.status === 'idle' && (
          <>
            <svg
              className="h-10 w-10 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-sm text-muted-foreground">
              Drag and drop or <span className="font-medium text-foreground underline">browse</span>
            </p>
            <p className="text-xs text-muted-foreground">PDF, DOCX, XLSX, PPTX, TXT, MD, PNG, JPG, GIF, ZIP — max 50 MB</p>
          </>
        )}

        {uploadState.status === 'uploading' && (
          <div className="w-full space-y-2">
            <p className="text-sm font-medium truncate">{uploadState.filename}</p>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-isu-500 transition-all duration-200"
                style={{ width: `${uploadState.progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-right">{uploadState.progress}%</p>
          </div>
        )}

        {uploadState.status === 'success' && (
          <div className="flex flex-col items-center gap-1">
            <svg
              className="h-8 w-8 text-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium">{uploadState.filename}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(uploadState.sizeBytes)} — uploaded successfully</p>
          </div>
        )}

        {uploadState.status === 'error' && (
          <div className="flex flex-col items-center gap-1">
            <svg
              className="h-8 w-8 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-sm text-destructive">{uploadState.message}</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setUploadState({ status: 'idle' }); }}
              className="text-xs underline text-muted-foreground hover:text-foreground"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
