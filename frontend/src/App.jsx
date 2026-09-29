import React, { useState } from 'react';
import './index.css';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import DedupReview from './pages/DedupReview';
import FieldVerify from './pages/FieldVerify';
import Metrics from './pages/Metrics';
import DataExplorer from './pages/DataExplorer';

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');

  const pages = {
    dashboard: <Dashboard />,
    dedup: <DedupReview />,
    field: <FieldVerify />,
    metrics: <Metrics />,
    data: <DataExplorer />,
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar activePage={activePage} setActivePage={setActivePage} />
      <main style={{ flex: 1 }}>
        {pages[activePage] || <Dashboard />}
      </main>
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '1rem 2rem',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem',
      }}>
        <span>🛡️ ShieldHealth — Maternal-Child Record Deduplicator &amp; Coverage Verifier</span>
        <span style={{ fontFamily: 'monospace' }}>React + Express/Node.js + Supabase</span>
      </footer>
    </div>
  );
}
