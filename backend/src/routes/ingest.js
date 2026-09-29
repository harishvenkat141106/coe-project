import { Router } from 'express';
import { mockDB } from '../lib/mockDB.js';
import { deduplicateRecords } from '../lib/dedupEngine.js';
import { supabase, isPlaceholder } from '../lib/supabase.js';

const router = Router();

// Helper: run dedup and store results
function runDedup() {
  const threshold = parseFloat(process.env.AUTO_MERGE_THRESHOLD || '0.85');
  const reviewThreshold = parseFloat(process.env.REVIEW_THRESHOLD || '0.50');
  const { parentMapping, reviewQueue } = deduplicateRecords(mockDB.demographics, threshold, reviewThreshold);

  // Apply manual decisions
  Object.entries(mockDB.manualDecisions).forEach(([pairKey, decision]) => {
    const [id1, id2] = pairKey.split('|');
    if (decision === 'MERGE') {
      const find = (id) => { while (parentMapping[id] !== id) id = parentMapping[id]; return id; };
      const p1 = find(id1);
      const p2 = find(id2);
      if (p1 !== p2) {
        Object.keys(parentMapping).forEach((k) => { if (parentMapping[k] === p2) parentMapping[k] = p1; });
        parentMapping[id2] = p1;
      }
    } else if (decision === 'SPLIT') {
      parentMapping[id2] = id2;
    }
  });

  // Apply manual decisions to queue status
  const updatedQueue = reviewQueue.map((item) => {
    const id1 = item.record_1.child_id < item.record_2.child_id ? item.record_1.child_id : item.record_2.child_id;
    const id2 = item.record_1.child_id < item.record_2.child_id ? item.record_2.child_id : item.record_1.child_id;
    const pairKey = `${id1}|${id2}`;
    return { ...item, status: mockDB.manualDecisions[pairKey] || 'PENDING' };
  });

  mockDB.parentMapping = parentMapping;
  mockDB.reviewQueue = updatedQueue;
}

// POST /api/ingest — regenerate data
router.post('/ingest', async (req, res) => {
  try {
    const { offline_facilities } = req.body;
    mockDB.reset();
    if (offline_facilities) mockDB.offlineFacilities = new Set(offline_facilities);
    runDedup();
    res.json({
      status: 'success',
      demographics_count: mockDB.demographics.length,
      services_count: mockDB.serviceEvents.length,
      facilities_count: mockDB.facilities.length,
      households_count: mockDB.households.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/demographics — paginated list
router.get('/demographics', (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const search = (req.query.search || '').toLowerCase();
  let data = mockDB.demographics;
  if (search) {
    data = data.filter(
      (d) =>
        d.first_name?.toLowerCase().includes(search) ||
        d.last_name?.toLowerCase().includes(search) ||
        d.child_id?.toLowerCase().includes(search)
    );
  }
  const total = data.length;
  const paginated = data.slice((page - 1) * limit, page * limit);
  res.json({ total, page, limit, data: paginated });
});

export default router;
