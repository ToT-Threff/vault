// src/lib/types.ts
// Kingdom Vault — Canonical TypeScript interfaces
// Matches Firestore schema defined in firestore.rules
// DO NOT EDIT without updating Firestore rules accordingly.

import { Timestamp } from 'firebase/firestore';

// ── Participants ───────────────────────────────────────────────────────────────

export type WardenId =
  | 'ryan'
  | 'saroya'
  | 'melody'
  | 'cerulia'
  | 'affin'
  | 'jewel'
  | 'krishe'
  | 'astyr'
  | 'hurrian'
  | 'jovin'
  | 'herus'
  | 'ptolemy-rh'
  | 'ptolemy-lh';

export type WardenRole =
  | 'emperor'
  | 'warden'
  | 'spectres';

export interface Participant {
  id: WardenId;
  name: string;
  role: WardenRole;
  wardenTitle: string;
  emoji: string;
  /** Ollama model identifier used by this warden */
  model: string;
  /** ISO 8601 timestamp string or Firestore Timestamp */
  lastActive: Timestamp | null;
  memoryCount: number;
  /** CSS color variable value e.g. '#3498DB' */
  color: string;
}

// ── Memories ───────────────────────────────────────────────────────────────────

export interface Memory {
  id: string;
  /** Full text content of the memory */
  content: string;
  /** Short summary for list views */
  summary: string;
  /** Ollama nomic-embed-text vector (stored separately, optional here) */
  embedding?: number[];
  createdAt: Timestamp;
  /**
   * Map of warden IDs who were present and may read this memory.
   * MUST be a Firestore map (Record<string, true>), NOT an array.
   * Firestore rules `in` operator works only on maps.
   * e.g. { "saroya": true, "melody": true }
   */
  sharedWith: Record<string, true>;
  tags: string[];
  /** Optional project association */
  projectId?: string;
}

// ── Sessions ───────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  /**
   * Map of participant IDs for this session.
   * MUST be a map for Firestore rules `in` operator.
   * e.g. { "ryan": true, "melody": true }
   */
  participants: Record<string, true>;
  /**
   * Participant IDs beyond the primary owner (for cross-warden read gate).
   * MUST be a map for Firestore rules `in` operator.
   */
  coParticipants: Record<string, true>;
  summary: string;
  createdAt: Timestamp;
  startedAt: Timestamp;
}


// ── Wiki ───────────────────────────────────────────────────────────────────────

export interface WikiArticle {
  id: string;
  title: string;
  /** Full markdown content */
  content: string;
  tags: string[];
  updatedAt: Timestamp;
  /** Participant ID of the author */
  author: WardenId;
}

// ── Projects ───────────────────────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'backlog' | 'paused' | 'complete';

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  description: string;
  /** Participant IDs assigned to this project */
  wardens: WardenId[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── Files ──────────────────────────────────────────────────────────────────────

export type FileType = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

export interface KingdomFile {
  id: string;
  name: string;
  type: FileType;
  /** File size in bytes */
  size: number;
  /** Firebase Storage download URL */
  url: string;
  /** Firebase Storage object path */
  storagePath: string;
  uploadedBy: WardenId;
  createdAt: Timestamp;
  tags: string[];
  /** Optional project association */
  projectId?: string;
}

// ── Kingdom Stats (aggregated for Dashboard) ───────────────────────────────────

export interface KingdomStats {
  totalMemories: number;
  totalParticipants: number;
  totalWikiArticles: number;
  totalFiles: number;
  totalProjects: number;
  totalSessions: number;
}

// ── Hook return types ──────────────────────────────────────────────────────────

export interface HookResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export interface HookListResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}
