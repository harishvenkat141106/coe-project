import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import ingestRoutes from './src/routes/ingest.js';
import coverageRoutes from './src/routes/coverage.js';
import dedupRoutes from './src/routes/dedup.js';
import fieldRoutes from './src/routes/field.js';
import systemRoutes from './src/routes/system.js';
import { mockDB } from './src/lib/mockDB.js';
import { deduplicateRecords } from './src/lib/dedupEngine.js';

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', ingestRoutes);
app.use('/api/coverage', coverageRoutes);
app.use('/api/dedup', dedupRoutes);
app.use('/api/field', fieldRoutes);
app.use('/api/system', systemRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ShieldHealth API', timestamp: new Date().toISOString() }));

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Startup ───────────────────────────────────────────────────────────────────
function initializeState() {
  console.log('🔄 Initializing synthetic data and running deduplication...');
  const threshold = parseFloat(process.env.AUTO_MERGE_THRESHOLD || '0.85');
  const reviewThreshold = parseFloat(process.env.REVIEW_THRESHOLD || '0.50');
  const { parentMapping, reviewQueue } = deduplicateRecords(mockDB.demographics, threshold, reviewThreshold);
  mockDB.parentMapping = parentMapping;
  mockDB.reviewQueue = reviewQueue;
  console.log(`✅ Loaded ${mockDB.demographics.length} demographics, ${mockDB.serviceEvents.length} service events`);
  console.log(`🔗 Found ${reviewQueue.length} review queue items`);
}

initializeState();

app.listen(PORT, () => {
  console.log(`\n🚀 ShieldHealth API running at http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Coverage: http://localhost:${PORT}/api/coverage`);
  console.log(`   Dedup Queue: http://localhost:${PORT}/api/dedup/review\n`);
});
