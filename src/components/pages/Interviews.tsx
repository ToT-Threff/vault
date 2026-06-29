'use client';

import { useState, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const QUESTIONS = [
  'What is the core user value / target user of this feature?',
  'What are the key edge cases we must handle?',
  'What are the architectural boundaries / database contracts (e.g. collection names, properties)?',
];

export default function Interviews() {
  const [featureName, setFeatureName] = useState('');
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedPath, setSavedPath] = useState('');
  const [specification, setSpecification] = useState('');

  const handleStart = () => {
    if (!featureName.trim()) return;
    setActive(true);
    setStep(0);
    setAnswers([]);
    setCurrentAnswer('');
    setSpecification('');
    setSavedPath('');
  };

  const handleNext = async () => {
    if (!currentAnswer.trim()) return;

    const nextAnswers = [...answers, currentAnswer.trim()];
    setAnswers(nextAnswers);
    setCurrentAnswer('');

    if (step < 2) {
      setStep(step + 1);
    } else {
      // Complete! Compile specification
      setSaving(true);
      const specText = [
        `# System Specification: ${featureName}`,
        `**Date:** ${new Date().toLocaleDateString()}  `,
        `**Author:** Ptolemy (via Vault Grill-Me UI)`,
        '',
        '## 1. Core Value & Audience',
        nextAnswers[0],
        '',
        '## 2. Key Edge Cases',
        nextAnswers[1],
        '',
        '## 3. Architecture & Contracts',
        nextAnswers[2],
      ].join('\n');

      setSpecification(specText);

      try {
        const auth = getAuth();
        const user = auth.currentUser;
        const ref = collection(db, 'kingdom', 'task-proposals', 'items');
        const docRef = await addDoc(ref, {
          title: `Spec: ${featureName}`,
          description: nextAnswers[0],
          specification: specText,
          status: 'proposed',
          author: user?.email || 'ryan@omniatheatre.com',
          createdAt: serverTimestamp(),
        });
        setSavedPath(`kingdom/task-proposals/items/${docRef.id}`);
      } catch (err: any) {
        console.error('Error saving spec:', err);
      } finally {
        setSaving(false);
        setStep(3);
      }
    }
  };

  return (
    <div className="vault-page">
      <div className="page-header-container">
        <h1 className="page-title">Grill-Me System Specification</h1>
        <p className="page-subtitle">Interactive alignment tool for designing new features</p>
      </div>

      {!active ? (
        <div className="card" style={{ maxWidth: 500, margin: '20px auto' }}>
          <h2>Start New Feature Spec</h2>
          <div className="form-group" style={{ margin: '20px 0' }}>
            <label htmlFor="feature-name" style={{ display: 'block', marginBottom: 8 }}>Feature Name</label>
            <input
              id="feature-name"
              type="text"
              className="text-input"
              value={featureName}
              onChange={(e) => setFeatureName(e.target.value)}
              placeholder="e.g. Workspace Auth Logging"
              style={{ width: '100%' }}
            />
          </div>
          <button className="btn btn-primary" onClick={handleStart} disabled={!featureName.trim()}>
            Start Interview
          </button>
        </div>
      ) : step < 3 ? (
        <div className="card" style={{ maxWidth: 600, margin: '20px auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Feature: <strong>{featureName}</strong>
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Question {step + 1} of 3
            </span>
          </div>

          {/* Progress Bar */}
          <div style={{ height: 4, background: 'var(--border-color)', borderRadius: 2, marginBottom: 24, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--primary)', width: `${((step + 1) / 3) * 100}%`, transition: 'width 0.3s ease' }} />
          </div>

          <h3 style={{ marginBottom: 16 }}>{QUESTIONS[step]}</h3>

          <div className="form-group" style={{ marginBottom: 24 }}>
            <textarea
              className="textarea-input"
              rows={6}
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              placeholder="Provide a detailed answer..."
              style={{ width: '100%', padding: 12, borderRadius: 6 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn" onClick={() => setActive(false)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text)' }}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleNext} disabled={!currentAnswer.trim()}>
              {step === 2 ? 'Generate Specification' : 'Next Question'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 700, margin: '20px auto' }}>
          <h2>Specification Generated!</h2>
          {saving ? (
            <p>Saving to Firestore...</p>
          ) : (
            <>
              {savedPath && (
                <div className="tag tag-teal" style={{ margin: '12px 0', display: 'inline-block' }}>
                  Saved to: {savedPath}
                </div>
              )}
              <pre
                style={{
                  background: 'var(--bg-card-hover)',
                  padding: 16,
                  borderRadius: 6,
                  overflowX: 'auto',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  marginTop: 16,
                  whiteSpace: 'pre-wrap',
                  textAlign: 'left',
                }}
              >
                {specification}
              </pre>
              <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                <button className="btn btn-primary" onClick={handleStart}>
                  Create Another
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    navigator.clipboard.writeText(specification);
                    alert('Copied to clipboard!');
                  }}
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text)' }}
                >
                  Copy to Clipboard
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
