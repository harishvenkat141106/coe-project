# Limitations Report & Future Work

This document outlines key boundaries, potential failure modes, and architectural limitations of the record deduplication and coverage verification prototype.

---

## 1. Where the Approach Breaks

### 1.1 Extremely Sparse or Missing Demographic Fields
* **The Failure Mode**: If both child name and guardian phone number are missing or recorded as "Unknown" or "Child" (common in emergency or rapid-campaign templates), the probabilistic pass has insufficient entropy to distinguish between children of similar ages in the same cluster.
* **Impact**: Sibling overlap and common name collisions increase, leading to false splits or false merges.
* **Mitigation**: The system relies on its fallback rule, flagging clusters with data completeness metrics $< 70\%$ as "Low Confidence" to warn planners that coverage estimates are unreliable.

### 1.2 Adversarial or Adaptive Name Spoofing
* **The Failure Mode**: In regions where mobile populations experience legal or social vulnerability, guardians may intentionally provide different names or incorrect DOBs to different facilities to avoid being tracked or profiled by state authorities.
* **Impact**: Since names and DOBs are intentionally obfuscated, the Jaro-Winkler similarity and Soundex matching fail, resulting in a false-split (treating a single child as multiple distinct individuals). This inflates naive coverage rates and underestimates outreach needs.
* **Mitigation**: The system's on-device Point-of-Care search allows field-workers to search via family phone numbers, sibling references, or previous facility visit patterns, resolving linkages in person.

### 1.3 Cross-Boundary and Rapid Migration
* **The Failure Mode**: Nomadic or cross-border populations move across district boundaries mid-campaign. Dose 1 might be administered in District A, and Dose 2 in District B. If districts operate isolated local servers that only sync periodically, records cannot be linked in real time.
* **Impact**: Double counting of population cohorts and split dose history.
* **Mitigation**: Periodic batch reconciliations between district nodes using high-level anonymized hashes can detect cross-boundary record splits.

### 1.4 High Sibling Density with Shared Phone Numbers
* **The Failure Mode**: Families with multiple children close in age (twins or siblings born within a year) share identical guardian names, phone numbers, household IDs, and last names.
* **Impact**: If birth dates are approximate or rounded (e.g., recorded simply as "Age 2" or "Age 3"), the model may misidentify siblings as duplicates of the same child, incorrectly auto-merging them and under-reporting target vaccine requirements.
* **Mitigation**: The model assigns a negative weight when household details match but genders differ or birth dates differ by more than a set threshold. If names are close but not identical, it routes them to the manual Review Queue rather than auto-merging.

---

## 2. Future Roadmap

1. **Decentralized Cryptographic Identity Linkage**: Utilize privacy-preserving record linkage (PPRL) protocols, where demographic details are hashed into cryptographic tokens (e.g., Bloom filters) locally at the facility before transit. This allows matching across districts without central databases ever seeing raw names.
2. **Differential Privacy on Aggregate Reports**: Inject controlled, mathematically bounded noise to aggregate cluster statistics. This provides formal privacy guarantees for planning exports even if the cluster size varies dynamically.
3. **Offline-first Sync Integration**: Enable mobile field tablets to run a localized database and perform local peer-to-peer deduplication (using Bluetooth/Wi-Fi mesh networks) during multi-team outreach in remote areas without internet coverage.
