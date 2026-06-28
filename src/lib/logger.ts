// src/lib/logger.ts
// Client-side performance and metrics logging utility

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface PerformanceLog {
  action: string;
  durationMs: number;
  details?: string;
}

export async function logPerformance(action: string, durationMs: number, details?: string) {
  console.log(`[PERFORMANCE] ${action} took ${durationMs.toFixed(2)}ms ${details ? `(${details})` : ''}`);
  try {
    await addDoc(collection(db, 'kingdom', 'performance_logs', 'items'), {
      action,
      durationMs,
      details: details ?? '',
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[logger] Failed to write performance log to Firestore:', err);
  }
}
