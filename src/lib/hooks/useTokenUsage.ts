// src/lib/hooks/useTokenUsage.ts
// Subscribes to the `token_usage` Firestore collection (top-level) and computes
// aggregate token/cost statistics for the Kingdom Dashboard widget.
// Data is written by MCP log_token_usage, nightly audit, and token_logger.py.

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  type FirestoreError,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { HookResult } from '@/lib/types';

// ── Record shape (matches MCP log_token_usage output) ─────────────────────────

export interface TokenUsageRecord {
  id: string;
  timestamp: string;       // ISO 8601 string from MCP
  source: string;          // 'api' | 'local' | 'antigravity'
  workspace: string;
  model: string;
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  trigger: string;
  status: string;
  loggedBy: string;        // warden ID that logged this
}

// ── Aggregated stats ──────────────────────────────────────────────────────────

export interface TokenUsageStats {
  totalInput: number;
  totalOutput: number;
  totalCost: number;
  byModel: Record<string, { input: number; output: number; cost: number }>;
  byWarden: Record<string, { input: number; output: number; cost: number }>;
  records: TokenUsageRecord[];
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useTokenUsage(): HookResult<TokenUsageStats> {
  const [records, setRecords] = useState<TokenUsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'token_usage'),
      orderBy('timestamp', 'desc'),
      limit(100),
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const items: TokenUsageRecord[] = snapshot.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            timestamp: (d.timestamp as string) ?? '',
            source: (d.source as string) ?? '',
            workspace: (d.workspace as string) ?? '',
            model: (d.model as string) ?? '',
            sessionId: (d.session_id as string) ?? '',
            inputTokens: (d.input_tokens as number) ?? 0,
            outputTokens: (d.output_tokens as number) ?? 0,
            totalTokens: (d.total_tokens as number) ?? 0,
            costUsd: (d.cost_usd as number) ?? 0,
            trigger: (d.trigger as string) ?? '',
            status: (d.status as string) ?? '',
            loggedBy: (d.logged_by as string) ?? '',
          };
        });
        setRecords(items);
        setLoading(false);
        setError(null);
      },
      (err: FirestoreError) => {
        console.error('[useTokenUsage] Firestore error:', err);
        setError(new Error(err.message));
        setLoading(false);
      },
    );

    return () => unsub();
  }, []);

  // Compute aggregates from the raw records
  const data = useMemo<TokenUsageStats>(() => {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCost = 0;
    const byModel: TokenUsageStats['byModel'] = {};
    const byWarden: TokenUsageStats['byWarden'] = {};

    for (const r of records) {
      totalInput += r.inputTokens;
      totalOutput += r.outputTokens;
      totalCost += r.costUsd;

      // Aggregate by model
      const modelKey = r.model || 'unknown';
      if (!byModel[modelKey]) byModel[modelKey] = { input: 0, output: 0, cost: 0 };
      byModel[modelKey].input += r.inputTokens;
      byModel[modelKey].output += r.outputTokens;
      byModel[modelKey].cost += r.costUsd;

      // Aggregate by warden (logged_by field)
      const wardenKey = r.loggedBy || 'unknown';
      if (!byWarden[wardenKey]) byWarden[wardenKey] = { input: 0, output: 0, cost: 0 };
      byWarden[wardenKey].input += r.inputTokens;
      byWarden[wardenKey].output += r.outputTokens;
      byWarden[wardenKey].cost += r.costUsd;
    }

    return { totalInput, totalOutput, totalCost, byModel, byWarden, records };
  }, [records]);

  return { data, loading, error };
}
