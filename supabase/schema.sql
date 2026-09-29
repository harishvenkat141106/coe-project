-- =====================================================
-- ShieldHealth Supabase Database Schema
-- Run this in your Supabase SQL Editor to create tables
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Households ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS households (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id TEXT UNIQUE NOT NULL,
  cluster_id   TEXT NOT NULL,
  address      TEXT,
  phone        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Demographics ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demographics (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id     TEXT UNIQUE NOT NULL,
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  dob          DATE,
  sex          CHAR(1) CHECK (sex IN ('M', 'F')),
  cluster_id   TEXT,
  household_id TEXT REFERENCES households(household_id),
  mother_name  TEXT,
  phone        TEXT,
  is_duplicate BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Facilities ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facilities (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id  TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  cluster_id   TEXT,
  is_offline   BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Service Events (Immunizations) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id          TEXT UNIQUE NOT NULL,
  child_id          TEXT REFERENCES demographics(child_id),
  vaccine           TEXT NOT NULL,
  date_administered DATE,
  facility_id       TEXT REFERENCES facilities(facility_id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Dedup Decisions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dedup_decisions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id_1    TEXT NOT NULL,
  child_id_2    TEXT NOT NULL,
  score         FLOAT,
  action        TEXT CHECK (action IN ('MERGE', 'SPLIT', 'PENDING')) DEFAULT 'PENDING',
  decided_by    TEXT DEFAULT 'system',
  decided_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (child_id_1, child_id_2)
);

-- ── Ground Truth ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ground_truth (
  id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id TEXT REFERENCES demographics(child_id),
  vaccines TEXT  -- pipe-separated list e.g. "BCG|DTP1|DTP3|MCV1"
);

CREATE TABLE IF NOT EXISTS true_duplicates (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id_1 TEXT NOT NULL,
  child_id_2 TEXT NOT NULL
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_demographics_cluster ON demographics(cluster_id);
CREATE INDEX IF NOT EXISTS idx_demographics_name    ON demographics(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_service_events_child ON service_events(child_id);
CREATE INDEX IF NOT EXISTS idx_service_events_vax   ON service_events(vaccine);

-- ── Row Level Security (Supabase) ─────────────────────────────────────────────
ALTER TABLE demographics    ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dedup_decisions ENABLE ROW LEVEL SECURITY;

-- Allow anon read for aggregated/coverage data (non-PII endpoints use aggregate grouping)
CREATE POLICY "anon_read_demographics" ON demographics
  FOR SELECT USING (true);

CREATE POLICY "anon_read_events" ON service_events
  FOR SELECT USING (true);

CREATE POLICY "service_write" ON service_events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "dedup_read" ON dedup_decisions
  FOR SELECT USING (true);

CREATE POLICY "dedup_write" ON dedup_decisions
  FOR ALL USING (true);
