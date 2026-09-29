import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

function ScoreBar({ score }) {
  const pct = (score * 100).toFixed(1);
  const color = score >= 0.85 ? '#ef4444' : score >= 0.70 ? '#f59e0b' : '#4f6ef7';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="progress-bar" style={{ width: 100 }}>
        <div style={{
          height: '100%', borderRadius: 99, width: `${pct}%`,
          background: color, transition: 'width 0.6s',
        }} />
      </div>
      <span className="mono" style={{ fontSize: '0.8rem', color }}>{pct}%</span>
    </div>
  );
}

function SimilarityGrid({ sims }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 8 }}>
      {Object.entries(sims).map(([field, val]) => (
        <div key={field} style={{
          background: 'rgba(255,255,255,0.04)', borderRadius: 8,
          padding: '0.5rem 0.6rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
            {field.replace(/_/g, ' ')}
          </div>
          <div style={{
            fontSize: '0.85rem', fontWeight: 700, fontFamily: 'monospace',
            color: val >= 0.85 ? '#10b981' : val >= 0.5 ? '#f59e0b' : val === -1 ? '#ef4444' : '#94a3b8',
          }}>
            {val === -1 ? '⚠️' : `${(val * 100).toFixed(0)}%`}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecordCard({ record, side }) {
  return (
    <div style={{
      flex: 1, background: 'rgba(255,255,255,0.03)',
      borderRadius: 12, padding: '1rem',
      border: `1px solid ${side === 'A' ? 'rgba(79,110,247,0.3)' : 'rgba(139,92,246,0.3)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: side === 'A' ? 'rgba(79,110,247,0.2)' : 'rgba(139,92,246,0.2)',
          fontSize: '0.8rem', fontWeight: 700, color: side === 'A' ? '#4f6ef7' : '#8b5cf6',
        }}>{side}</div>
        <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{record.child_id}</span>
      </div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{record.first_name} {record.last_name}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span>DOB: <span style={{ color: 'var(--text-primary)' }}>{record.dob}</span></span>
        <span>Sex: <span style={{ color: 'var(--text-primary)' }}>{record.sex}</span></span>
        <span>Mother: <span style={{ color: 'var(--text-primary)' }}>{record.mother_name}</span></span>
        <span>Phone: <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{record.phone}</span></span>
        <span>Cluster: <span style={{ color: 'var(--accent-cyan)' }}>{record.cluster_id}</span></span>
      </div>
    </div>
  );
}

export default function DedupReview() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [explanations, setExplanations] = useState({});
  const [filter, setFilter] = useState('PENDING'); // PENDING | ALL

  const loadQueue = async () => {
    setLoading(true);
    try {
      const res = filter === 'ALL'
        ? await apiClient.getAllDedup()
        : await apiClient.getReviewQueue();
      setQueue(res.data.queue || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadQueue(); }, [filter]);

  const handleAction = async (item, action) => {
    const key = item.pair_key;
    setActionLoading((p) => ({ ...p, [key]: action }));
    try {
      await apiClient.applyDedupAction(item.record_1.child_id, item.record_2.child_id, action);
      await loadQueue();
    } catch (e) { console.error(e); }
    finally { setActionLoading((p) => ({ ...p, [key]: null })); }
  };

  const handleExplain = async (item) => {
    const key = item.pair_key;
    if (explanations[key]) { setExplanations((p) => ({ ...p, [key]: null })); return; }
    try {
      const res = await apiClient.explainPair(item.record_1.child_id, item.record_2.child_id);
      setExplanations((p) => ({ ...p, [key]: res.data }));
    } catch (e) { console.error(e); }
  };

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1>Review <span style={{ color: 'var(--accent-violet)' }} className="glow-violet">Queue</span></h1>
          <p>Ambiguous record pairs requiring human adjudication</p>
        </div>
        <div className="flex items-center gap-3">
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 130 }}>
            <option value="PENDING">Pending only</option>
            <option value="ALL">All items</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={loadQueue} disabled={loading}>
            {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '↻'} Refresh
          </button>
        </div>
      </div>

      {loading ? (
        Array(3).fill(0).map((_, i) => (
          <div key={i} className="card skeleton" style={{ height: 120 }} />
        ))
      ) : queue.length === 0 ? (
        <div className="card text-center" style={{ padding: '3rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
          <h3>No pending reviews</h3>
          <p style={{ marginTop: 4 }}>All ambiguous record pairs have been resolved.</p>
        </div>
      ) : (
        queue.map((item) => {
          const key = item.pair_key;
          const isOpen = expanded === key;
          const explanation = explanations[key];
          const isActing = actionLoading[key];

          return (
            <div key={key} className="card animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Header row */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {item.record_1.first_name} {item.record_1.last_name}
                      <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>↔</span>
                      {item.record_2.first_name} {item.record_2.last_name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                      {item.record_1.child_id} | {item.record_2.child_id}
                    </div>
                  </div>
                  <span className={`badge ${
                    item.status === 'PENDING' ? 'badge-amber' :
                    item.status === 'MERGE' ? 'badge-green' : 'badge-red'
                  }`}>{item.status}</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <ScoreBar score={item.score} />
                  <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(isOpen ? null : key)}>
                    {isOpen ? '▲ Collapse' : '▼ Details'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleExplain(item)}>
                    🤖 {explanation ? 'Hide AI' : 'AI Explain'}
                  </button>
                  {item.status === 'PENDING' && (
                    <>
                      <button className="btn btn-success btn-sm" onClick={() => handleAction(item, 'MERGE')} disabled={!!isActing}>
                        {isActing === 'MERGE' ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '🔗'} Merge
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleAction(item, 'SPLIT')} disabled={!!isActing}>
                        {isActing === 'SPLIT' ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '✂️'} Split
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* AI Explanation */}
              {explanation && (
                <div className="alert alert-info animate-in">
                  <span>🤖</span>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {explanation.confidence_grade}
                    </div>
                    <div style={{ fontSize: '0.85rem' }}>{explanation.explanation}</div>
                    <div style={{ fontSize: '0.7rem', marginTop: 4, opacity: 0.7 }}>Source: {explanation.source}</div>
                  </div>
                </div>
              )}

              {/* Expanded Details */}
              {isOpen && (
                <div className="animate-in">
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <RecordCard record={item.record_1} side="A" />
                    <RecordCard record={item.record_2} side="B" />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Field Similarity Scores
                    </div>
                    <SimilarityGrid sims={item.similarities} />
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
