import { Router } from 'express';
import { mockDB } from '../lib/mockDB.js';
import { computeMetrics } from '../lib/coverageVerifier.js';

const router = Router();

// GET /api/system/trust-status
router.get('/trust-status', (req, res) => {
  const outageDetected = mockDB.offlineFacilities.size > 0;
  const pendingReviews = mockDB.reviewQueue.filter((i) => i.status === 'PENDING').length;
  const reasons = [];

  let status = 'STABLE';
  if (outageDetected) {
    status = 'DEGRADED';
    reasons.push(`Outage detected in facility feeds: ${[...mockDB.offlineFacilities].join(', ')}`);
  }
  if (pendingReviews > 5) {
    status = 'DEGRADED';
    reasons.push(`High number of ambiguous records awaiting review: ${pendingReviews}`);
  }

  res.json({
    status,
    outage_detected: outageDetected,
    offline_facilities: [...mockDB.offlineFacilities],
    pending_reviews: pendingReviews,
    reasons,
    total_demographics: mockDB.demographics.length,
    total_events: mockDB.serviceEvents.length,
  });
});

// GET /api/system/metrics
router.get('/metrics', (req, res) => {
  try {
    if (!mockDB.groundTruth.length) return res.json({ status: 'no_ground_truth' });
    const metrics = computeMetrics(
      mockDB.groundTruth,
      mockDB.trueDuplicates,
      mockDB.parentMapping,
      mockDB.demographics,
      mockDB.serviceEvents,
      mockDB.facilities,
      mockDB.offlineFacilities
    );
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
