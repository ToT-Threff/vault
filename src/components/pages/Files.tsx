'use client';

export default function Files() {
  return (
    <div className="fade-in">
      <h1 className="page-title">🗃️ File Vault</h1>
      <p className="page-subtitle">Browse, search, and preview files stored in GCS. Upload new files and associate them with projects and wardens.</p>

      {/* Upload zone */}
      <div style={{
        border: '2px dashed var(--border-bright)',
        borderRadius: 14, padding: '40px 20px', textAlign: 'center',
        marginBottom: 28, cursor: 'pointer', transition: 'all 250ms',
        background: 'var(--surface)',
      }}
      onDragOver={(e) => e.preventDefault()}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>◨</div>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Drop files here or click to upload</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Scripts · PDFs · Images · Markdown · Archives<br />
          Stored in <code style={{ color: 'var(--gold)', fontSize: '0.8125rem' }}>gs://omnia-kingdom-vault/files/</code>
        </div>
      </div>

      {/* GCS bucket structure */}
      <div className="card">
        <h2 className="section-title" style={{ marginBottom: 16 }}>Bucket Structure</h2>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem', lineHeight: 2, color: 'var(--text-secondary)' }}>
          {[
            { path: 'gs://omnia-kingdom-vault/',   desc: 'Root' },
            { path: '  /files/',                    desc: 'Uploaded scripts, PDFs, images' },
            { path: '  /exports/',                  desc: 'BigQuery export snapshots' },
            { path: '  /backups/',                  desc: 'Nightly Firestore export' },
            { path: '  /warden-logs/',              desc: 'Raw session transcript files' },
          ].map((item) => (
            <div key={item.path} style={{ display: 'flex', gap: 24 }}>
              <span style={{ color: 'var(--gold)', minWidth: 260 }}>{item.path}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', alignSelf: 'center' }}>{item.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
