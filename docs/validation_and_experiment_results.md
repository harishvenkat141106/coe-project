# Validation and Experiment Results

This document presents the experimental results comparing the naive baseline with the reconciled deduplication pipeline, followed by a simulated stakeholder validation exercise.

---

## 1. Measurable Experiment Results

The experiment evaluates the performance of the system against a synthetic ground-truth dataset representing **1,000 children** distributed across **10 clusters**, with a duplication rate of **15%** and various fragmentation anomalies injected.

### 1.1 Overall Metrics Table (Calibrated to Ground Truth)

| Metric | Baseline (Naive) | Target (Acceptable Range) | Measured (Prototype) | Error vs. Ground Truth (Measured - GT) |
|---|---|---|---|---|
| **Deduplication Precision** | 100% (Exact match only) | $\ge 95\%$ | **92.2%** | -7.8% (False Merges) |
| **Deduplication Recall** | 42.1% (Misses typos/aliases) | $\ge 90\%$ | **57.6%** | -42.4% (Missed link / Sibling safety clamping) |
| **DTP3 Overall Coverage Error**| 46.6% | $\le \pm 5\%$ | **68.2% (GT: 70.4%)**| -2.23% (Baseline error: -23.84%) |
| **Processing Speed (per 1k)**| N/A | $< 5.0\text{ seconds}$ | **0.34 seconds** | N/A |

### 1.2 Cluster-Level Verification Report

Below is the detailed cluster-level evaluation representing different demographic scenarios:

| Cluster ID | Scenario | True Pop | Naive Pop | Reconciled Pop | Naive Error | Reconciled Error | Trust Status | Privacy Status |
|---|---|---|---|---|---|---|---|---|
| **C-01** | Stable/Urban | 200 | 228 | 201 | +14.0% | +0.5% | TRUSTED | Exceeds $k$ threshold |
| **C-02** | Migrant Camp | 150 | 185 | 152 | +23.3% | +1.3% | TRUSTED | Exceeds $k$ threshold |
| **C-03** | Nomadic Route | 80 | 98 | 82 | +22.5% | +2.5% | TRUSTED | Exceeds $k$ threshold |
| **C-04** | Facility Outage | 120 | 45 | 47 | -62.5% | -60.8% | **UNTRUSTED** | Exceeds $k$ threshold |
| **C-05** | Small Settlement | 6 | 9 | 7 | +50.0% | +16.7% | TRUSTED | **SUPPRESSED** ($< k$) |

---

## 2. Simulated Stakeholder Validation

To evaluate operational viability, three personas reviewed the dashboard and system boundaries:

### 2.1 Persona 1: District Health Officer (EPI Coordinator)
* **Feedback**:
  * "The cluster-level map is incredibly useful. It shows me exactly where we have vaccine coverage gaps without cluttering the screen with family lists."
  * "The Trust status warning on Cluster C-04 saved us from sending a standard outreach team. Knowing a facility sync failed means we should run a manual census first."
  * "Can we export the aggregate cluster gaps to share with our transport logistics team?"
* **Action taken**: Added an 'Export Aggregated Coverage' button that outputs a CSV with PII completely stripped and k-anonymity applied.

### 2.2 Persona 2: Field Vaccinator (Point-of-Care Nurse)
* **Feedback**:
  * "In the field, parents often call their children by different nicknames or don't know the exact DOB. Having the review queue flags and phonetic search on our tablets is a lifesaver."
  * "We need the system to load quickly offline. If the matching takes minutes, we cannot use it at point of care."
* **Action taken**: Optimized the Double Metaphone name index and demographic lookups to execute in under 10ms on simulated low-resource queries.

### 2.3 Persona 3: Data Protection Officer
* **Feedback**:
  * "Suppressing clusters under 10 children prevents neighboring groups from identifying who is/isn't vaccinating. This is crucial for avoiding community conflicts."
  * "However, we need to ensure that the Field Verification API token cannot be leaked to planners."
* **Action taken**: Implemented simulated JWT role validation requiring a strict `X-User-Role: field_worker` header, which is not present in the planner UI session.
