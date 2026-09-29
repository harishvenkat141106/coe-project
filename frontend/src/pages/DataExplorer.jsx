import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';

export default function DataExplorer() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getDemographics(page, 20, search);
      setData(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1>Data <span style={{ color: 'var(--accent-pink)' }}>Explorer</span></h1>
          <p>Browse and search the synthetic demographics registry</p>
        </div>
        <div className="flex items-center gap-2">
          <input className="input" placeholder="Search name or ID..." value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{ width: 220 }} />
          <button className="btn btn-primary btn-sm" onClick={handleSearch}>Search</button>
          {search && <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}>✕ Clear</button>}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {loading ? 'Loading...' : `${total} records ${search ? `matching "${search}"` : 'total'}`}
          </span>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>← Prev</button>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', minWidth: 80, textAlign: 'center' }}>
              Page {page} / {totalPages || 1}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}>Next →</button>
          </div>
        </div>

        <div className="table-wrap" style={{ borderRadius: 0, border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Child ID</th>
                <th>Name</th>
                <th>DOB</th>
                <th>Sex</th>
                <th>Mother</th>
                <th>Phone</th>
                <th>Cluster</th>
                <th>Household</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(10).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(8).fill(0).map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 14, width: '75%' }} /></td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No records found
                  </td>
                </tr>
              ) : (
                data.map((d) => (
                  <tr key={d.child_id}>
                    <td>
                      <span className="mono" style={{ fontSize: '0.78rem', color: d.child_id.includes('DUP') ? 'var(--accent-amber)' : 'var(--accent-cyan)' }}>
                        {d.child_id}
                        {d.child_id.includes('DUP') && <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: '0.6rem' }}>DUP</span>}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{d.first_name} {d.last_name}</td>
                    <td className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{d.dob}</td>
                    <td>
                      <span className={`badge ${d.sex === 'M' ? 'badge-blue' : 'badge-violet'}`}>{d.sex}</span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{d.mother_name}</td>
                    <td className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{d.phone}</td>
                    <td><span className="badge badge-gray">{d.cluster_id}</span></td>
                    <td className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{d.household_id}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
