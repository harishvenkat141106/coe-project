import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, Legend,
} from 'recharts';

function MetricGauge({ value, max = 1, label, color, format }) {
  const pct = max > 0 ? value / max : 0;
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ * 0.75;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg width={110} height={80}>
        <circle cx={55} cy={68} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={9}
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeLinecap="round"
          transform="rotate(-135 55 68)" />
        <circle cx={55} cy={68} r={r} fill="none" stroke={color} strokeWidth={9}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          transform="rotate(-135 55 68)"
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray 1s' }} />
        <text x={55} y={65} textAnchor="middle" fill="#f0f4ff" fontSize={15} fontWeight={800}>
          {format ? format(value) : `${(value * 100).toFixed(1)}%`}
        </text>
      </svg>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 90 }}>{label}</span>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card" style={{ padding: '0.6rem 0.9rem', fontSize: '0.8rem' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {(p.value * 100).toFixed(2)}%
        </div>
      ))}
    </div>
  );
};

export default function Metrics() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getMetrics();
      if (res.data.status === 'no_ground_truth') {
        setError('No ground truth data available. Please trigger a data ingest first.');
      } else {
        setMetrics(res.data);
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load metrics.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const dm = metrics?.dedup_metrics;
  const cm = metrics?.coverage_metrics;

  const radarData = dm ? [
    { metric: 'Precision', value: dm.precision },
    { metric: 'Recall', value: dm.recall },
    { metric: 'F1 Score', value: dm.f1_score },
  ] : [];

  const coverageBarData = cm ? [
    {
      name: 'DTP3',
      'Ground Truth': cm.dtp3?.ground_truth_rate || 0,
      'Naive': cm.dtp3?.naive_rate || 0,
      'Reconciled': cm.dtp3?.reconciled_rate || 0,
    },
    {
      name: 'MCV1',
      'Ground Truth': cm.mcv1?.ground_truth_rate || 0,
      'Naive': cm.mcv1?.naive_rate || 0,
      'Reconciled': cm.mcv1?.reconciled_rate || 0,
    },
  ] : [];

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1>Experiment <span style={{ color: 'var(--accent-amber)' }}>Metrics</span></h1>
          <p>Head-to-head comparison: ShieldHealth engine vs. naive baseline vs. ground truth</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '↻'} Refresh
        </button>
      </div>

      {error && <div className="alert alert-warning">⚠️ {error}</div>}

      {loading ? (
        <div className="grid-2">
          {Array(4).fill(0).map((_, i) => <div key={i} className="card skeleton" style={{ height: 200 }} />)}
        </div>
      ) : metrics && (
        <>
          {/* Dedup Metric Gauges */}
          <div className="card">
            <h3 style={{ marginBottom: '0.75rem' }}>Deduplication Engine Performance</h3>
            <p style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Fellegi-Sunter engine evaluated against ground-truth duplicate labels
            </p>
            <div className="flex flex-wrap gap-8 justify-center" style={{ marginBottom: '1.5rem' }}>
              <MetricGauge value={dm?.precision || 0} label="Precision" color="#10b981" />
              <MetricGauge value={dm?.recall || 0} label="Recall" color="#4f6ef7" />
              <MetricGauge value={dm?.f1_score || 0} label="F1 Score" color="#8b5cf6" />
            </div>

            {/* Confusion counts */}
            <div className="grid-3">
              {[
                { label: 'True Positives', value: dm?.true_positives, color: 'var(--accent-green)', desc: 'Correctly merged duplicate pairs' },
                { label: 'False Positives', value: dm?.false_positives, color: 'var(--accent-amber)', desc: 'Incorrectly merged distinct records' },
                { label: 'False Negatives', value: dm?.false_negatives, color: 'var(--accent-red)', desc: 'Missed actual duplicates' },
              ].map((s) => (
                <div key={s.label} className="card-flat">
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Radar Chart */}
          <div className="grid-2">
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>Performance Radar</h3>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <Radar dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Coverage Comparison */}
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>Coverage Error Analysis</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={coverageBarData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v*100).toFixed(0)}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '0.8rem', color: '#94a3b8' }} />
                  <Bar dataKey="Ground Truth" fill="#10b981" radius={[4,4,0,0]} />
                  <Bar dataKey="Naive" fill="#f59e0b" radius={[4,4,0,0]} />
                  <Bar dataKey="Reconciled" fill="#4f6ef7" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Coverage Error Table */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Coverage Rate Comparison Table</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Vaccine</th>
                    <th>Ground Truth</th>
                    <th>Naive Rate</th>
                    <th>Reconciled Rate</th>
                    <th>Naive Error</th>
                    <th>Reconciled Error</th>
                    <th>Improvement</th>
                  </tr>
                </thead>
                <tbody>
                  {['dtp3', 'mcv1'].map((vax) => {
                    const v = cm?.[vax];
                    if (!v) return null;
                    const naiveErr = Math.abs(v.naive_rate - v.ground_truth_rate);
                    const recErr = Math.abs(v.reconciled_rate - v.ground_truth_rate);
                    const improved = recErr < naiveErr;
                    return (
                      <tr key={vax}>
                        <td style={{ fontWeight: 600, textTransform: 'uppercase', color: 'var(--accent-cyan)' }}>{vax}</td>
                        <td className="mono">{(v.ground_truth_rate * 100).toFixed(2)}%</td>
                        <td className="mono">{(v.naive_rate * 100).toFixed(2)}%</td>
                        <td className="mono">{(v.reconciled_rate * 100).toFixed(2)}%</td>
                        <td className="mono" style={{ color: 'var(--accent-amber)' }}>±{(naiveErr * 100).toFixed(2)}%</td>
                        <td className="mono" style={{ color: 'var(--accent-cyan)' }}>±{(recErr * 100).toFixed(2)}%</td>
                        <td>
                          <span className={`badge ${improved ? 'badge-green' : 'badge-red'}`}>
                            {improved ? `↓ ${((naiveErr - recErr) * 100).toFixed(2)}% better` : '↑ worse'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
