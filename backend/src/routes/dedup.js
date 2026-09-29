import { Router } from 'express';
import { mockDB } from '../lib/mockDB.js';
import { generateHeuristicExplanation, getConfidenceGrade, deduplicateRecords } from '../lib/dedupEngine.js';

const router = Router();

// Helper: re-run dedup and update mockDB
function refreshDedup() {
  const threshold = parseFloat(process.env.AUTO_MERGE_THRESHOLD || '0.85');
  const reviewThreshold = parseFloat(process.env.REVIEW_THRESHOLD || '0.50');
  const { parentMapping, reviewQueue } = deduplicateRecords(mockDB.demographics, threshold, reviewThreshold);

  // Apply manual decisions to parentMapping
  Object.entries(mockDB.manualDecisions).forEach(([pairKey, decision]) => {
    const [id1, id2] = pairKey.split('|');
    if (decision === 'MERGE') {
      const find = (id) => { let cur = id; while (parentMapping[cur] && parentMapping[cur] !== cur) cur = parentMapping[cur]; return cur; };
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

  // Apply decisions to queue status
  const updatedQueue = reviewQueue.map((item) => {
    const i1 = item.record_1.child_id < item.record_2.child_id ? item.record_1.child_id : item.record_2.child_id;
    const i2 = item.record_1.child_id < item.record_2.child_id ? item.record_2.child_id : item.record_1.child_id;
    const pairKey = `${i1}|${i2}`;
    return { ...item, status: mockDB.manualDecisions[pairKey] || 'PENDING' };
  });

  mockDB.parentMapping = parentMapping;
  mockDB.reviewQueue = updatedQueue;
}

// GET /api/dedup/review
router.get('/review', (req, res) => {
  const pending = mockDB.reviewQueue.filter((item) => item.status === 'PENDING');
  res.json({ count: pending.length, queue: pending });
});

// GET /api/dedup/all — all items (including resolved)
router.get('/all', (req, res) => {
  res.json({ count: mockDB.reviewQueue.length, queue: mockDB.reviewQueue });
});

// POST /api/dedup/action
router.post('/action', (req, res) => {
  const { record_1_id, record_2_id, action } = req.body;
  if (!['MERGE', 'SPLIT'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Must be MERGE or SPLIT.' });
  }

  const id1 = record_1_id < record_2_id ? record_1_id : record_2_id;
  const id2 = record_1_id < record_2_id ? record_2_id : record_1_id;
  const pairKey = `${id1}|${id2}`;
  mockDB.manualDecisions[pairKey] = action;

  refreshDedup();

  res.json({ status: 'success', message: `Applied ${action} to pair (${record_1_id}, ${record_2_id})` });
});

// GET /api/dedup/explain?id1=&id2=
router.get('/explain', (req, res) => {
  const { id1, id2 } = req.query;
  const item = mockDB.reviewQueue.find(
    (q) =>
      (q.record_1.child_id === id1 && q.record_2.child_id === id2) ||
      (q.record_1.child_id === id2 && q.record_2.child_id === id1)
  );
  if (!item) return res.status(404).json({ error: 'Pair not found in review queue' });

  const explanation = generateHeuristicExplanation(item.record_1, item.record_2, item.score, item.similarities);
  const confidence_grade = getConfidenceGrade(item.score);
  res.json({ source: 'ShieldHealth GenAI Clinical Logic Engine', explanation, confidence_grade, score: item.score });
});

export default router;
