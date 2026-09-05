# Maternal-Child Service Record Deduplicator & Coverage Verifier (ShieldHealth)

ShieldHealth is a privacy-by-design prototype developed to reconcile fragmented and duplicate maternal-child health and immunization records for mobile, nomadic, and displaced populations. 

By utilizing **Fellegi-Sunter probabilistic record linkage** combined with **k-anonymity aggregation controls** and **safe data fallbacks**, ShieldHealth allows district planning teams to calculate true immunization coverage and route logistics without exposing, profiling, or stigmatizing vulnerable families or communities.

---

## Key Features

1. **Rule-Based & Probabilistic Matching Engine**: Native Python implementation of Jaro-Winkler string similarity, Soundex phonetic hashes, DOB temporal decay, and gender checks. Safely isolates twin/sibling overlaps from duplicate merges.
2. **k-Anonymity Guardrails**: Enforces privacy by automatically suppressing cluster-level coverage rates when a settlement cohort has fewer than $k$ (default 10) children, rolling up counts to preserve identity.
3. **Point-of-Care Simulation**: An access-controlled patient verification screen simulating field workers resolving detailed patient identities on-device, restricted by simulated role-based JWT/API headers (`X-User-Role: field_worker`).
4. **Data Sync Health Warning Flags**: Monitors facility sync feeds and flags clusters as "Low Confidence" rather than displaying inaccurate precise coverage rates during network outages.
5. **Measurable Experiment Board**: Programmatically compares naive baselines vs. reconciled ShieldHealth engines against simulated ground-truth metrics (Precision, Recall, and immunization coverage error rates).

---

## Project Structure

```
coe_project/
├── data/
│   ├── raw/                  # (Optional) Kaggle calibration source files
│   └── synthetic/            # Generated synthetic messy CSV files
├── docs/
│   ├── requirements.md       # Requirements specification & Acceptance Criteria
│   ├── architecture.md       # Block diagrams & PII flow isolation boundaries
│   ├── limitations.md        # Edge cases, bounds (adversarial name spoofing, migration)
│   ├── why_this_approach.md  # Design rationales (rules vs. black-box ML, k-anonymity)
│   └── validation_and_experiment_results.md  # Measured metrics table & stakeholder feedback
├── src/
│   ├── data_generator.py     # Generates demographics, services, facilities, households
│   ├── dedup_engine.py       # Deterministic & Probabilistic matching logic (Fellegi-Sunter)
│   ├── coverage_verifier.py  # Baseline vs. Reconciled calculations & k-suppression
│   └── app.py                # FastAPI REST server hosting mock stubs and static assets
├── static/
│   ├── index.html            # Translucent Single-Page dashboard markup
│   ├── style.css             # Glassmorphic premium CSS (Dark mode, visual progress bars)
│   └── app.js                # Frontend controllers, API hooks, and review queue updates
├── demo.py                   # Automated end-to-end command-line validation script
├── run.py                    # Server launch runner & dependency validator
└── README.md                 # Project guide (this file)
```

---

## REST API Endpoint Stubs

| Method | Endpoint | Description | Role Restriction |
|---|---|---|---|
| `POST` | `/api/ingest` | Triggers synthetic data generation and reloads registry | Open |
| `GET` | `/api/coverage` | Returns aggregated, k-anonymized cluster coverage rates | Open |
| `GET` | `/api/dedup/review` | Retrieves candidates in the medium-confidence review queue | Planner/Reviewer |
| `POST` | `/api/dedup/action` | Resolves review items (Approve Merge / Keep Separate) | Planner/Reviewer |
| `GET` | `/api/field/verify` | Look up client profile and resolved dose history | Field Worker Only (`X-User-Role: field_worker`) |
| `GET` | `/api/system/trust-status` | System health status (outages, review queue size) | Open |
| `GET` | `/api/metrics` | Head-to-head comparison metrics vs. Ground Truth | Open |

---

## How to Setup and Run

### Prerequisites
* Python 3.8 or higher.
* Python package manager (`pip`).

### Option 1: Run the Automated CLI Demo (Immediate Verification)
To execute the entire pipeline end-to-end programmatically, verify all 4 failure/edge cases, conflict resolution rules, and output the precision/recall metrics directly in the terminal, run:

```bash
python demo.py
```

This script will run completely standalone, generate the necessary synthetic data, verify all requirements, and return an exit code of `0` on success.

---

### Option 2: Run the Web Dashboard & API Server
To launch the FastAPI server, serving the interactive glassmorphic dashboard:

```bash
python run.py
```

The script will:
1. Verify python dependencies (`fastapi`, `uvicorn`, `pydantic`) and auto-install them if missing.
2. Search for Kaggle credentials (`~/.kaggle/kaggle.json`). If present, download and calibrate real-world immunization data; otherwise, gracefully degrade to pre-calibrated statistical models.
3. Start the server on [http://127.0.0.1:8000](http://127.0.0.1:8000).

Open your browser and navigate to the dashboard to interact with:
* **Planning Dashboard**: View naive vs. reconciled coverages, adjust the k-anonymity threshold, select vaccine targets, and view warning flags during outages.
* **Review Queue**: Approve or reject fuzzy matched client pairs.
* **Point of Care**: Toggle the "Field Worker Auth Header" to simulate privacy-by-design access controls when looking up individual patient profiles.
* **Experiment Panel**: View precision/recall gauges and head-to-head coverage errors compared to ground truth.
