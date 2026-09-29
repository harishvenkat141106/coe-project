import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

// ── API Helpers ───────────────────────────────────────────────────────────────
export const apiClient = {
  // System
  getHealth: () => api.get('/health'),
  getTrustStatus: () => api.get('/api/system/trust-status'),
  getMetrics: () => api.get('/api/system/metrics'),

  // Coverage
  getCoverage: (k) => api.get('/api/coverage', { params: k != null ? { k } : {} }),

  // Ingest
  triggerIngest: (data) => api.post('/api/ingest', data),

  // Dedup
  getReviewQueue: () => api.get('/api/dedup/review'),
  getAllDedup: () => api.get('/api/dedup/all'),
  applyDedupAction: (record_1_id, record_2_id, action) =>
    api.post('/api/dedup/action', { record_1_id, record_2_id, action }),
  explainPair: (id1, id2) => api.get('/api/dedup/explain', { params: { id1, id2 } }),

  // Demographics
  getDemographics: (page = 1, limit = 20, search = '') =>
    api.get('/api/demographics', { params: { page, limit, search } }),

  // Field
  verifyField: (q) =>
    api.get('/api/field/verify', {
      params: { q },
      headers: { 'X-User-Role': 'field_worker' },
    }),
};

export default api;
