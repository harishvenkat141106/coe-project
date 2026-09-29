import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';

const VACCINE_COLORS = {
  BCG: '#4f6ef7', DTP1: '#8b5cf6', DTP2: '#06b6d4', DTP3: '#10b981',
  OPV0: '#f59e0b', OPV1: '#f97316', OPV2: '#ef4444', OPV3: '#ec4899',
  MCV1: '#84cc16', MCV2: '#22c55e', HepB1: '#a78bfa', HepB2: '#c4b5fd',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card" style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', minWidth: 160 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{p.name}</span>
          <span style={{ fontFamily: 'monospace' }}>
            {typeof p.value === 'number' ? `${(p.value * 100).toFixed(1)}%` : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

function KGauge({ value, label, color }) {
  const pct = Math.min(Math.max(value, 0), 1);
  const stroke = color || '#4f6ef7';
  const r = 40;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ * 0.75;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={100} height={70} style={{ overflow: 'visible' }}>
        <circle cx={50} cy={60} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8}
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeLinecap="round"
          transform="rotate(-135 50 60)" />
        <circle cx={50} cy={60} r={r} fill="none" stroke={stroke} strokeWidth={8}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          transform="rotate(-135 50 60)"
          style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)' }} />
        <text x={50} y={58} textAnchor="middle" fill="#f0f4ff" fontSize={14} fontWeight={700}>
          {(pct * 100).toFixed(0)}%
        </text>
      </svg>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 80 }}>{label}</span>
    </div>
  );
}

export default function Dashboard() {
  const [coverage, setCoverage] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [kValue, setKValue] = useState(10);
  const [ingesting, setIngesting] = useState(false);
  const [activeVax, setActiveVax] = useState('DTP3');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiClient.getCoverage(kValue),
      apiClient.getTrustStatus(),
    ]).then(([covRes, statusRes]) => {
      setCoverage(covRes.data);
      setStatus(statusRes.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, [kValue]);

  useEffect(() => { load(); }, [load]);

  const handleIngest = async () => {
    setIngesting(true);
    try {
      await apiClient.triggerIngest({ offline_facilities: ['F-03'] });
      await load();
    } catch (e) { console.error(e); }
    finally { setIngesting(false); }
  };

  // Prepare chart data
  const clusters = coverage?.reconciled ? Object.entries(coverage.reconciled) : [];

  const barData = clusters.map(([cid, c]) => ({
    cluster: cid,
    naive: parseFloat(((coverage?.naive?.[cid]?.vaccines?.[activeVax]?.rate || 0) * 100).toFixed(1)),
    reconciled: parseFloat(((c.vaccines?.[activeVax]?.rate || 0) * 100).toFixed(1)),
    suppressed: c.suppressed,
  }));

  const gaugeData = clusters.length > 0 ? {
    dtp3_rec: clusters.reduce((s, [, c]) => s + (c.vaccines?.DTP3?.rate || 0), 0) / clusters.length,
    mcv1_rec: clusters.reduce((s, [, c]) => s + (c.vaccines?.MCV1?.rate || 0), 0) / clusters.length,
    bcg_rec: clusters.reduce((s, [, c]) => s + (c.vaccines?.BCG?.rate || 0), 0) / clusters.length,
    dtp3_naive: clusters.reduce((s, [cid]) => s + ((coverage?.naive?.[cid]?.vaccines?.DTP3?.rate || 0)), 0) / clusters.length,
  } : { dtp3_rec: 0, mcv1_rec: 0, bcg_rec: 0, dtp3_naive: 0 };

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1>Coverage <span style={{ color: 'var(--accent-cyan)' }} className="glow-cyan">Dashboard</span></h1>
          <p style={{ marginTop: 4 }}>Naive vs. reconciled immunization coverage with k-anonymity privacy controls</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>k-threshold:</label>
            <input type="number" className="input" value={kValue} min={0} max={50}
              onChange={(e) => setKValue(parseInt(e.target.value) || 0)}
              style={{ width: 70 }} />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '↻'} Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleIngest} disabled={ingesting}>
            {ingesting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '⚡'} Re-Ingest
          </button>
        </div>
      </div>

      {/* Alerts */}
      {status?.outage_detected && (
        <div className="alert alert-warning animate-in">
          ⚠️ <div>
            <strong>Data Sync Outage Detected</strong> — Facilities offline: <strong>{status.offline_facilities?.join(', ')}</strong>.
            Coverage shown as LOW CONFIDENCE for affected clusters.
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid-4">
        {[
          { label: 'Total Children', value: status?.total_demographics || '–', icon: '👶', color: 'var(--accent-cyan)' },
          { label: 'Service Events', value: status?.total_events || '–', icon: '💉', color: 'var(--accent-violet)' },
          { label: 'Pending Reviews', value: status?.pending_reviews || 0, icon: '🔍', color: status?.pending_reviews > 5 ? 'var(--accent-amber)' : 'var(--accent-green)' },
          { label: 'Offline Facilities', value: status?.offline_facilities?.length || 0, icon: '📡', color: 'var(--accent-red)' },
        ].map((s) => (
          <div key={s.label} className="card stat-card">
            <div style={{ fontSize: '1.5rem' }}>{s.icon}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage Gauges */}
      <div className="card">
        <div className="flex items-center justify-between" style={{ marginBottom: '1.25rem' }}>
          <h3>Overall Coverage Rates</h3>
          <span className="badge badge-blue">Reconciled avg across clusters</span>
        </div>
        <div className="flex flex-wrap gap-8 justify-center">
          <KGauge value={gaugeData.dtp3_rec} label="DTP3 Reconciled" color="#10b981" />
          <KGauge value={gaugeData.dtp3_naive} label="DTP3 Naive" color="#f59e0b" />
          <KGauge value={gaugeData.mcv1_rec} label="MCV1 Reconciled" color="#8b5cf6" />
          <KGauge value={gaugeData.bcg_rec} label="BCG Reconciled" color="#4f6ef7" />
        </div>
      </div>

      {/* Bar Chart */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3" style={{ marginBottom: '1.25rem' }}>
          <h3>Naive vs. Reconciled by Cluster</h3>
          <select className="input" value={activeVax} onChange={(e) => setActiveVax(e.target.value)} style={{ width: 130 }}>
            {Object.keys(VACCINE_COLORS).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        {loading ? (
          <div style={{ height: 260 }} className="skeleton" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="cluster" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '0.8rem', color: '#94a3b8' }} />
              <Bar dataKey="naive" name="Naive" radius={[4,4,0,0]} fill="#f59e0b" />
              <Bar dataKey="reconciled" name="Reconciled" radius={[4,4,0,0]} fill="#4f6ef7" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Cluster Table */}
      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>Cluster Coverage Details</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cluster</th>
                <th>Eligible</th>
                <th>DTP3 Rate</th>
                <th>MCV1 Rate</th>
                <th>BCG Rate</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(6).fill(0).map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 16, width: '80%' }} /></td>
                    ))}
                  </tr>
                ))
              ) : clusters.map(([cid, c]) => (
                <tr key={cid}>
                  <td><span className="mono" style={{ color: 'var(--accent-cyan)' }}>{cid}</span></td>
                  <td>{c.suppressed ? <span className="badge badge-gray">k-suppressed</span> : c.total_eligible}</td>
                  <td>
                    {c.suppressed ? '—' : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="progress-bar" style={{ width: 80 }}>
                          <div className="progress-fill progress-fill-green" style={{ width: `${(c.vaccines?.DTP3?.rate || 0) * 100}%` }} />
                        </div>
                        <span style={{ fontSize: '0.8rem' }}>{((c.vaccines?.DTP3?.rate || 0) * 100).toFixed(1)}%</span>
                      </div>
                    )}
                  </td>
                  <td>
                    {c.suppressed ? '—' : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="progress-bar" style={{ width: 80 }}>
                          <div className="progress-fill progress-fill-violet" style={{ width: `${(c.vaccines?.MCV1?.rate || 0) * 100}%` }} />
                        </div>
                        <span style={{ fontSize: '0.8rem' }}>{((c.vaccines?.MCV1?.rate || 0) * 100).toFixed(1)}%</span>
                      </div>
                    )}
                  </td>
                  <td>
                    {c.suppressed ? '—' : `${((c.vaccines?.BCG?.rate || 0) * 100).toFixed(1)}%`}
                  </td>
                  <td>
                    <span className={`badge ${
                      c.confidence === 'HIGH_CONFIDENCE' ? 'badge-green' :
                      c.confidence === 'LOW_CONFIDENCE' ? 'badge-amber' :
                      'badge-gray'
                    }`}>
                      {c.confidence?.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
