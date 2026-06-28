// src/lib/types.ts
// Kingdom Vault — Canonical TypeScript interfaces
// Matches Firestore schema defined in firestore.rules
// DO NOT EDIT without updating Firestore rules accordingly.

import { Timestamp } from 'firebase/firestore';

// ── Participants ───────────────────────────────────────────────────────────────

export type WardenId =
  | 'ryan'
  | 'ptolemy'
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
  /** Warden title as written by seedParticipants CF (e.g. 'Warden of the Word') */
  title: string;
  /** Whether this participant is a human (Ryan) or AI warden */
  isHuman: boolean;
  /** CSS color variable value e.g. '#3498DB' */
  color: string;
  /** Emoji identifier — set by UI or seed update, not in initial CF seed */
  emoji?: string;
  /** Ollama model identifier — set when warden loop infrastructure is active */
  model?: string;
  /** Last activity timestamp — aspirational, no auto-update mechanism yet */
  lastActive?: Timestamp | null;
  /** Memory count — aspirational, would need Firestore trigger to maintain */
  memoryCount?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
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

/** Status values written by ingest-work-logs.ts from WORK_LOG.md files */
export type WorkLogStatus = 'stable' | 'in-progress' | 'blocked' | 'inactive';

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  description: string;
  /** Participant IDs assigned to this project */
  wardens: WardenId[];
  createdAt: Timestamp;
  updatedAt: Timestamp;

  // ── Workspace fields (set by New Project modal) ───────────────────────────────
  /** 'new' → CF creates GitHub repo; 'existing' → attach to existing workspace */
  workspace?: 'new' | 'existing';
  /** Firestore ID of the attached workspace (when workspace === 'existing') */
  workspaceId?: string;
  /** Lifecycle state of the workspace provisioning */
  workspaceStatus?: 'pending' | 'ready' | 'failed';
  /** GitHub repo URL (populated by CF after creation) */
  githubUrl?: string;
  /** Mac Mini local path (populated by CF after creation) */
  workspacePath?: string;

  // ── Work Log fields (auto-ingested by ingest-work-logs.ts cron) ──────────────
  /** Derived from WORK_LOG.md; absent if no log exists for this project */
  workLogStatus?: WorkLogStatus;
  statusEmoji?: string;    // e.g. '🟡'
  statusLabel?: string;    // e.g. 'In Progress'
  activeTask?: string;     // e.g. 'TASK-017 — Kingdom Vault build'
  warden?: string;         // e.g. 'Saroya'
  lastOutput?: string;     // truncated summary of last session output
  nextAction?: string;     // next planned action
  blockers?: string;       // 'none' or description
  logDate?: string;        // e.g. '2026-05-28'
  lastUpdated?: Timestamp; // server timestamp of last ingest
}

// ── Files ──────────────────────────────────────────────────────────────────────

export type FileType = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

/** Tracks whether the file has been ingested into the vector index */
export type EmbeddingStatus = 'pending' | 'indexing' | 'indexed' | 'failed';

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
  /** Vector index ingestion status */
  embeddingStatus?: EmbeddingStatus;
  /** Timestamp when the file was indexed */
  indexedAt?: Timestamp;
  /** Error message if ingestion failed */
  embeddingError?: string;
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
