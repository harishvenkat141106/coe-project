import React, { useState } from 'react';
import { apiClient } from '../api/client';

function ImmunizationTimeline({ immunizations }) {
  if (!immunizations?.length) return <p style={{ fontSize: '0.85rem' }}>No immunization records found.</p>;
  const sorted = [...immunizations].sort((a, b) => a.date_administered?.localeCompare(b.date_administered));
  const vaxColors = {
    BCG: '#4f6ef7', DTP1: '#8b5cf6', DTP2: '#06b6d4', DTP3: '#10b981',
    OPV0: '#f59e0b', MCV1: '#84cc16', MCV2: '#22c55e', HepB1: '#a78bfa',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      {sorted.map((ev, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: vaxColors[ev.vaccine] || '#4f6ef7',
            boxShadow: `0 0 8px ${vaxColors[ev.vaccine] || '#4f6ef7'}`,
          }} />
          <div style={{
            flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '0.5rem 0.75rem',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{
              fontWeight: 600, fontSize: '0.85rem',
              color: vaxColors[ev.vaccine] || 'var(--accent-cyan)',
            }}>{ev.vaccine}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
              {ev.date_administered}
            </span>
            <span className="badge badge-gray" style={{ fontSize: '0.65rem' }}>{ev.facility_id}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FieldVerify() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const handleSearch = async () => {
    if (!query.trim() || query.length < 2) {
      setError('Please enter at least 2 characters to search.');
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);
    setSelected(null);
    try {
      const res = await apiClient.verifyField(query);
      setResults(res.data.results || []);
      if (res.data.results?.length === 0) setError('No records found matching your search.');
    } catch (e) {
      if (e.response?.status === 403) {
        setError('🔒 Access denied: Field Worker role required. (This is automatically set in the API client.)');
      } else {
        setError(e.response?.data?.error || 'Search failed. Check if the backend server is running.');
      }
    } finally { setLoading(false); }
  };

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <div>
        <h1>Point of <span style={{ color: 'var(--accent-green)' }} className="glow-green">Care</span></h1>
        <p>Field worker patient verification — privacy-protected PII lookup with reconciled immunization history</p>
      </div>

      <div className="alert alert-info">
        🔐 <div style={{ fontSize: '0.85rem' }}>
          This screen simulates a field worker endpoint. The API requires <code style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: 4 }}>X-User-Role: field_worker</code> header, which is automatically sent by this client.
        </div>
      </div>

      {/* Search */}
      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>Search Patient Record</h3>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            className="input"
            placeholder="Search by name, date of birth (YYYY-MM-DD), or phone..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn btn-primary" onClick={handleSearch} disabled={loading} style={{ flexShrink: 0 }}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '🔍'} Search
          </button>
        </div>

        {error && (
          <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Results List */}
      {results && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h4 style={{ marginBottom: 0 }}>{results.length} result(s) found</h4>
          {results.map((r, i) => {
            const d = r.demographics;
            const isSelected = selected === i;
            return (
              <div
                key={i}
                className="card"
                onClick={() => setSelected(isSelected ? null : i)}
                style={{ cursor: 'pointer', border: isSelected ? '1px solid rgba(16,185,129,0.4)' : undefined }}
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, color: 'white',
                    }}>
                      {d.first_name?.[0]}{d.last_name?.[0]}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700 }}>{d.first_name} {d.last_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        {d.child_id} · DOB: {d.dob} · {d.sex}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.linked_duplicates?.length > 0 && (
                      <span className="badge badge-amber">
                        🔗 {r.linked_duplicates.length} linked record(s)
                      </span>
                    )}
                    <span className="badge badge-blue">{r.immunizations?.length || 0} vaccines</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{isSelected ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isSelected && (
                  <div className="animate-in" style={{ marginTop: '1.25rem' }}>
                    <div className="divider" />
                    <div className="grid-2" style={{ marginTop: '1rem' }}>
                      <div>
                        <h4 style={{ marginBottom: 8 }}>Demographics</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
                          {[
                            ['Child ID', d.child_id], ['Parent ID', r.unified_parent_id],
                            ['Mother', d.mother_name], ['Phone', d.phone],
                            ['Cluster', d.cluster_id], ['Household', d.household_id],
                          ].map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                              <span className={k.includes('ID') ? 'mono' : ''} style={{ color: 'var(--text-primary)' }}>{v || '—'}</span>
                            </div>
                          ))}
                          {r.linked_duplicates?.length > 0 && (
                            <div style={{ marginTop: 4 }}>
                              <span style={{ color: 'var(--text-muted)' }}>Linked records:</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                {r.linked_duplicates.map((lid) => (
                                  <span key={lid} className="badge badge-amber mono">{lid}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <h4 style={{ marginBottom: 8 }}>Immunization Timeline</h4>
                        <ImmunizationTimeline immunizations={r.immunizations} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
