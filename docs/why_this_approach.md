# Design Rationale & Approach Justification

This document justifies the key architectural and design choices made in this prototype.

---

## 1. Why Rules + Probabilistic Matching Over Pure Machine Learning?

In public health, trust, auditability, and ease of deployment are critical. A rules+probabilistic approach (based on the classic Fellegi-Sunter methodology) is preferred over deep learning/black-box models for several reasons:

* **Auditability and Health-Worker Trust**: Health workers must understand *why* two records were linked. In a rules-based model, we can point to an exact scorecard: "These records matched because the Jaro-Winkler name similarity was 0.92, the phone numbers matched exactly, and the DOB difference was under 30 days." A neural network cannot provide this level of inspectable rationale out-of-the-box.
* **Low-Resource Computations**: The deterministic + probabilistic rules engine runs efficiently in standard Python without requiring GPU resources, heavy neural runtimes (like PyTorch or TensorFlow), or complex dependency packages. This makes the system viable for district-level servers or offline laptops.
* **Deterministic Guardrails**: We can hardcode strict logical exclusions (e.g., "Never auto-merge records if genders are known and mismatch, or if age difference is greater than 18 months") that machine learning classifiers might occasionally violate due to statistical noise.

---

## 2. Why Cluster-Level k-Anonymized Output Over Named Lists?

Generating planning lists at the household or named-community level (e.g., "The Al-Fulan family at GPS coordinates (X, Y) is unvaccinated") presents severe risks:

* **The Stigma Problem**: If under-vaccination maps pinpoint specific small communities, this can lead to profiling, discrimination in service delivery, and harassment from neighboring groups or local authorities. Historically, this causes communities to refuse to engage with outreach teams, severely damaging trust.
* **The Principle of Least Privilege**: A district coordinator planning vaccine logistics only needs to know *how many* doses to load into a vehicle and *which route* to take. They do not need to know the names or exact home locations of unvaccinated individuals.
* **Enforcing k-Anonymity**: By aggregating at the settlement cluster level and suppressing clusters with fewer than $k=10$ children, we ensure that individual families cannot be singled out. The system balances operational efficiency with robust data protection.

---

## 3. Why a Safe-Fallback / Trust-Flag is Mandatory

In health-equity applications, presenting false precision is more dangerous than reporting no data:

* **Risk of Misdirected Resources**: If a system reports a coverage rate of 85% for a cluster based on incomplete data (e.g., a facility outage meant half the logs weren't synced), planners will assume the area is safe. In reality, it might have a major outbreak risk.
* **Preventing Stigmatization**: Reporting a low coverage rate of 20% due to missing logs might cause a community to be labeled as "refusers" or "non-compliant", leading to institutional bias.
* **Operational Fallback**: By calculating a data-completeness score and displaying a visible **Trust Flag** (e.g., "Incomplete Feeds - Do Not Use for Target Allocation"), the system forces planners to consult manual outreach reports or deploy a rapid assessment team, rather than acting blindly on flawed metrics.
