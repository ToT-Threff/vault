// src/lib/hooks/useUploadFile.ts
// Kingdom Vault — File upload hook
//
// Flow:
//   1. Extract text from the file (inline — text types only; stub for others)
//   2. Upload to Firebase Storage (files/{filename})
//   3. Write KingdomFile metadata doc to Firestore /files/{id}
//   4. Mark doc embeddingStatus='indexing'
//   5. Call ingestDocument Cloud Function
//   6. On success: set embeddingStatus='indexed', indexedAt
//      On failure: set embeddingStatus='failed', embeddingError (non-fatal)

'use client';

import { useState, useCallback } from 'react';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  type UploadTaskSnapshot,
} from 'firebase/storage';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, db, storage } from '@/lib/firebase';
import { cfUrl } from '@/lib/config';
import type { KingdomFile, FileType, WardenId } from '@/lib/types';

// ── Text extraction ────────────────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  'md', 'txt', 'ts', 'tsx', 'js', 'jsx', 'py', 'sh',
  'json', 'yaml', 'yml', 'html', 'css', 'sql', 'csv',
  'toml', 'ini', 'env', 'xml', 'rs', 'go', 'rb', 'php',
]);

async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (TEXT_EXTENSIONS.has(ext)) {
    try {
      return await file.text();
    } catch {
      // Fall through to stub
    }
  }
  return `File: ${file.name}\nType: ${file.type || 'unknown'}\nSize: ${file.size} bytes`;
}

// ── File type classifier ───────────────────────────────────────────────────────

function classifyFile(file: File): FileType {
  const mime = file.type ?? '';
  if (mime.startsWith('image/'))                          return 'image';
  if (mime.startsWith('video/'))                          return 'video';
  if (mime.startsWith('audio/'))                          return 'audio';
  if (
    mime.startsWith('text/') ||
    mime === 'application/pdf' ||
    mime === 'application/msword' ||
    mime.includes('wordprocessingml') ||
    mime.includes('spreadsheetml') ||
    mime.includes('presentationml')
  )                                                        return 'document';
  if (
    mime === 'application/zip' ||
    mime === 'application/x-tar' ||
    mime === 'application/gzip' ||
    mime === 'application/x-rar-compressed'
  )                                                        return 'archive';
  return 'other';
}

// ── ingestDocument caller ─────────────────────────────────────────────────────

interface IngestPayload {
  collection: string;
  content: string;
  metadata: {
    name: string;
    storagePath: string;
    uploadedBy: string;
    fileType: string;
    projectId: string | null;
    fileId: string;
  };
}

async function callIngestDocument(payload: IngestPayload): Promise<{ id: string; dims: number }> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('No auth token — user not signed in');

  const response = await fetch(cfUrl('ingestDocument'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error ?? `HTTP ${response.status}`);
  }

  return response.json();
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UploadProgress {
  /** 0-100 */
  percent: number;
  /** 'uploading' | 'indexing' | 'done' | 'error' */
  stage: 'uploading' | 'indexing' | 'done' | 'error';
  error?: string;
}

export interface UseUploadFileResult {
  upload: (
    file: File,
    options?: { uploadedBy?: string; projectId?: string; tags?: string[] }
  ) => Promise<KingdomFile>;
  progress: Record<string, UploadProgress>;
  clearProgress: (name: string) => void;
}

export function useUploadFile(): UseUploadFileResult {
  const [progress, setProgress] = useState<Record<string, UploadProgress>>({});

  const setStage = useCallback((name: string, stage: UploadProgress['stage'], percent = 0, error?: string) => {
    setProgress((prev) => ({ ...prev, [name]: { percent, stage, error } }));
  }, []);

  const upload = useCallback(async (
    file: File,
    options: { uploadedBy?: string; projectId?: string; tags?: string[] } = {},
  ): Promise<KingdomFile> => {
    const { uploadedBy = 'ryan', projectId, tags = [] } = options;

    // 1. Extract text while upload is being set up
    const textContent = await extractText(file);

    // 2. Upload to Firebase Storage
    const storagePath = `files/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    setStage(file.name, 'uploading', 0);

    const downloadURL = await new Promise<string>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot: UploadTaskSnapshot) => {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setStage(file.name, 'uploading', pct);
        },
        (err) => {
          setStage(file.name, 'error', 0, err.message);
          reject(err);
        },
        async () => {
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          } catch (e) {
            reject(e);
          }
        },
      );
    });

    // 3. Write Firestore metadata doc
    const fileRef = doc(collection(db, 'files'));
    const nowTs = Timestamp.now();

    const fileDoc: Omit<KingdomFile, 'id'> & { embeddingStatus: 'indexing' } = {
      name: file.name,
      type: classifyFile(file),
      size: file.size,
      url: downloadURL,
      storagePath: `gs://omnia-kingdom-vault-storage/${storagePath}`,
      uploadedBy: uploadedBy as WardenId,
      createdAt: nowTs,
      tags,
      ...(projectId ? { projectId } : {}),
      embeddingStatus: 'indexing',
    };

    await setDoc(fileRef, {
      ...fileDoc,
      createdAt: serverTimestamp(),
    });

    const savedFile: KingdomFile = { id: fileRef.id, ...fileDoc };

    // 4. Mark as indexing in UI
    setStage(file.name, 'indexing', 100);

    // 5. Call ingestDocument (non-fatal — upload is already successful)
    try {
      await callIngestDocument({
        collection: 'files',
        content: textContent,
        metadata: {
          name: file.name,
          storagePath: fileDoc.storagePath,
          uploadedBy,
          fileType: file.type || 'application/octet-stream',
          projectId: projectId ?? null,
          fileId: fileRef.id,
        },
      });

      // 6a. Update Firestore: indexed
      await updateDoc(fileRef, {
        embeddingStatus: 'indexed',
        indexedAt: serverTimestamp(),
      });

      setStage(file.name, 'done', 100);
      return { ...savedFile, embeddingStatus: 'indexed' };
    } catch (ingestErr: unknown) {
      const errMsg = ingestErr instanceof Error ? ingestErr.message : 'Unknown ingest error';
      console.warn('[useUploadFile] ingestDocument failed (non-fatal):', errMsg);

      // 6b. Update Firestore: failed (non-fatal)
      await updateDoc(fileRef, {
        embeddingStatus: 'failed',
        embeddingError: errMsg,
      }).catch(() => {
        // Even this can fail silently — the file is uploaded and saved
      });

      setStage(file.name, 'done', 100); // Upload itself succeeded
      return { ...savedFile, embeddingStatus: 'failed' };
    }
  }, [setStage]);

  const clearProgress = useCallback((name: string) => {
    setProgress((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  return { upload, progress, clearProgress };
}
