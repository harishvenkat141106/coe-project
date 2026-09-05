# Requirements Specification

## 1. Functional Requirements

### 1.1 Ingestion & Parsing
* **Data Sources**: The system must ingest four core structured CSV files representing demographics, immunization service events, health facility details, and households.
* **Real-World Messiness Calibration**: Ingested datasets must support validation calibration based on CDC or local child immunization statistics to align overall coverage rates (e.g., BCG, DTP, MCV) with actual geographical profiles.
* **Automatic Pipeline Execution**: The system must provide a mechanism to trigger dataset generation, load raw tables, and feed them into the matching pipeline.

### 1.2 Deduplication Engine
* **Deterministic Matching**: A fast first-pass matching step using strong keys (e.g., National ID, unique Household ID coupled with Birth Order, or Exact Child ID) when present.
* **Probabilistic Matching**: A secondary pass for records missing strong keys. The engine must compute a match score using:
  * Fuzzy string similarity (e.g., Jaro-Winkler) on names (first name, family name, mother's name).
  * Phonetic hashing (Double Metaphone or Soundex) to resolve transliteration/spelling variations.
  * Temporal proximity of DOBs (handling approximated/estimated birth dates).
  * Hamming distance or exact equality of guardian contact numbers.
  * Geographic cluster distance/co-location.
* **Match Decisions & Tiers**:
  * **Auto-Merge (High Confidence)**: Scores $\ge 0.85$. Records are merged automatically.
  * **Review Queue (Medium Confidence)**: $0.50 \le \text{score} < 0.85$. Records are put into a review queue for human-in-the-loop validation.
  * **Reject (Low Confidence)**: Scores $< 0.50$. Records are treated as distinct individuals.
* **Audit Logging**: Every merge decision must record an explanation of why the choice was made, detailing the weights, fuzzy matching scores, and deterministic matches involved.

### 1.3 Coverage Verifier
* **Naive Baseline**: Calculate coverage metrics by counting raw immunization events per cluster against nominal catchment populations without deduplication.
* **Reconciled Coverage**: Calculate coverage based on the deduplicated population registries.
* **Vaccination Completeness Rates**: Support checking completeness by vaccine schedules (e.g., BCG, DTP1-3, MCV1-2).

### 1.4 API Services
* **Ingest Data Endpoints**: Endpoints for uploading individual datasets or triggering batch ingestion.
* **k-Anonymized Coverage API**: Endpoint `GET /api/coverage` that exposes aggregated cluster rates.
* **Review Queue API**: Endpoints to fetch candidates needing review and post resolutions.
* **Access-Controlled Field Verification API**: Secure search matching name/phone details for point-of-care workers to verify a child's record in real time.
* **Trust Status API**: Endpoint monitoring system health, sync status, and match confidence ratios.

---

## 2. Non-Functional & Privacy-by-Design Requirements

### 2.1 Privacy-by-Design (Acceptance Criteria)
* **AC 2.1.1: Aggregated Planning Views**: All views or APIs accessible to district planners must aggregate data at the cluster level. No household names, coordinates, phone numbers, or individual identifiers may be exported or displayed in planning dashboards.
* **AC 2.1.2: k-Anonymity Guardrails**: If a settlement/cluster has fewer than $k$ children registered (default $k=10$), its individual coverage statistics must be suppressed from planning views and rolled up to the district/sub-district level to prevent identification of specific households.
* **AC 2.1.3: Access Control Simulation**: Personally Identifiable Information (PII) is strictly restricted to point-of-care views. The REST API must simulate role-based authorization: only requests containing a field-worker header (`X-User-Role: field_worker`) can resolve detailed names or service event history.

### 2.2 Explainability & Transparency
* **White-box Algorithms**: The matching engine must use explicit, weighted, rules-based logic (such as Fellegi-Sunter) instead of a black-box machine learning model. Health officers must be able to inspect match scores and rules to build system trust.

### 2.3 Reliability & Failure Handling
* **Safe Fallback rule**: If overall data quality metrics for a cluster drop below threshold (e.g., matching confidence < 70%, facility sync outage detected), the system must flag that cluster as "Low Confidence" or "Insufficient Data" and refuse to display a precise vaccination rate to prevent misdirected outreach.
* **Graceful Degradation**: In the event of a facility sync outage, the system must continue calculating other clusters' coverages while clearly marking the affected area as having incomplete feeds.
