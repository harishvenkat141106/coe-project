import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

export default function Navbar({ activePage, setActivePage }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getTrustStatus()
      .then((r) => setStatus(r.data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      apiClient.getTrustStatus().then((r) => setStatus(r.data)).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const pages = [
    { id: 'dashboard', label: 'Coverage', icon: '📊' },
    { id: 'dedup', label: 'Review Queue', icon: '🔗' },
    { id: 'field', label: 'Point of Care', icon: '🏥' },
    { id: 'metrics', label: 'Metrics', icon: '📈' },
    { id: 'data', label: 'Data', icon: '🗄️' },
  ];

  return (
    <nav style={{
      background: 'rgba(10,15,30,0.85)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      padding: '0 2rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: '60px',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
    }}>
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div style={{
          width: 32, height: 32,
          background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6)',
          borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px',
        }}>🛡️</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.02em' }}>
            Shield<span style={{ color: 'var(--accent-cyan)' }}>Health</span>
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            MATERNAL-CHILD DEDUPLICATOR
          </div>
        </div>
      </div>

      {/* Nav Links */}
      <div className="flex items-center gap-1">
        {pages.map((page) => (
          <button
            key={page.id}
            onClick={() => setActivePage(page.id)}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: activePage === page.id
                ? 'rgba(79,110,247,0.2)'
                : 'transparent',
              color: activePage === page.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s',
              borderBottom: activePage === page.id ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            }}
          >
            <span>{page.icon}</span>
            {page.label}
          </button>
        ))}
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-3">
        {!loading && status && (
          <span className={`badge ${status.status === 'STABLE' ? 'badge-green' : 'badge-amber'}`}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: status.status === 'STABLE' ? '#10b981' : '#f59e0b',
              display: 'inline-block',
              animation: 'pulse 2s infinite',
            }} />
            {status.status}
          </span>
        )}
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          API: localhost:5000
        </div>
      </div>
    </nav>
  );
}
