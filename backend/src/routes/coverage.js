import { Router } from 'express';
import { mockDB } from '../lib/mockDB.js';
import { calculateCoverage, calculateNaiveCoverage } from '../lib/coverageVerifier.js';

const router = Router();

// GET /api/coverage
router.get('/', (req, res) => {
  try {
    const k = req.query.k ? parseInt(req.query.k, 10) : mockDB.kThreshold;
    mockDB.kThreshold = k;

    const naive = calculateNaiveCoverage(mockDB.demographics, mockDB.serviceEvents, mockDB.facilities);
    const reconciled = calculateCoverage(
      mockDB.demographics,
      mockDB.serviceEvents,
      mockDB.parentMapping,
      mockDB.facilities,
      mockDB.offlineFacilities,
      k
    );

    res.json({
      k_threshold: k,
      offline_facilities: [...mockDB.offlineFacilities],
      naive,
      reconciled,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
