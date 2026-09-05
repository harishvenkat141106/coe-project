# Architecture Design

This document details the system components, data ingestion pipeline, deduplication flow, and the strict PII (Personally Identifiable Information) boundaries implemented to enforce privacy-by-design.

---

## 1. System Data Flow Diagram

The diagram below illustrates how data is ingested, processed, and served. Notice the strict boundary where identifiable client data (PII) is isolated and prevented from reaching planning interfaces.

```mermaid
graph TD
    %% Data Ingestion
    subgraph Ingestion Layer [1. Ingestion Layer]
        A[demographics.csv] -->|Raw Records| E[Ingest & Validation Engine]
        B[service_events.csv] -->|Service Logs| E
        C[facilities.csv] -->|Reference Data| E
        D[households.csv] -->|Geographic Context| E
    end

    %% Processing Layer
    subgraph Processing Layer [2. Core Processing Engine]
        E -->|Noisy PII Data| F[Deduplication Engine]
        F -->|Step 1: Deterministic Match| G{Match Found?}
        G -->|Yes| H[Auto-Merge Record]
        G -->|No| I[Step 2: Probabilistic Match]
        I -->|Score >= 0.85| H
        I -->|0.50 <= Score < 0.85| J[Review Queue]
        I -->|Score < 0.50| K[Reject/Keep Split]
        
        H --> L[Deduplicated Population Registry]
        K --> L
    end

    %% Reconciler / Output
    subgraph Verification Layer [3. Coverage & Privacy Layer]
        L --> M[Coverage Verifier]
        M -->|Raw Reconciled Stats| N[Privacy-by-Design Filter]
        N -->|Verify Cluster Size >= k| O{k-Anonymity OK?}
        O -->|No: Size < k| P[Suppress Stats & Roll-up]
        O -->|Yes: Size >= k| Q[Compute Final Rates & Trust Flags]
    end

    %% Presentation Layer
    subgraph Presentation Layer [4. Access-Controlled Interfaces]
        P -->|Aggregate Data| R[REST API: GET /api/coverage]
        Q -->|Aggregate Data| R
        R -->|Aggregated Metrics| S[District Planning Dashboard]
        
        J -->|Requires Staff Role| T[REST API: GET /api/dedup/review]
        T -->|Anonymized Matches| S
        
        L -->|Requires Field Role| U[REST API: GET /api/field/verify]
        U -->|PII Verification| V[Point-of-Care App]
    end

    %% Styles & Boundaries
    style IngestionLayer fill:#f9f,stroke:#333,stroke-width:2px
    style ProcessingLayer fill:#bbf,stroke:#333,stroke-width:2px
    style VerificationLayer fill:#bfb,stroke:#333,stroke-width:2px
    style PresentationLayer fill:#fbb,stroke:#333,stroke-width:2px
```

---

## 2. Privacy Boundaries & PII Flow Isolation

To prevent the profiling and stigmatization of communities:
* **The PII Boundary**: Raw client names, birth dates, precise household links, and phone numbers are strictly processed in-memory within the **Core Processing Engine**. 
* **The Database / Registry**: Detailed records are stored in the *Deduplicated Population Registry*. This registry resides on an encrypted database/file server and is not accessible to standard business intelligence tools.
* **Planning Dashboard Separation**: The dashboard receives ONLY aggregated statistics per cluster (e.g., vaccine coverage percentage, estimated count of under-vaccinated children, trust level). At no point does individual detail flow to the planning client.
* **Point-of-Care Access (Field Verification)**: A field health worker, physically visiting a household, can look up a child's record using the `GET /api/field/verify` API. This requires passing credentials simulating the `field_worker` role. The lookup is single-record based and does not allow bulk extraction of PII.

---

## 3. Component Details

1. **Ingest Engine**: Reads demographic, service, facility, and household CSV tables. Validates schema and structure.
2. **Deduplication Engine**: Resolves identity fragmentation by applying deterministic keys, then computing Jaro-Winkler string similarities, temporal birth differences, phonetic similarity (Double Metaphone), and phone Hamming distances. It outputs matching weights and links.
3. **Coverage Verifier**: Computes vaccine coverage estimates. Applies the **k-Anonymity** rule to ensure any cluster containing fewer than $k$ (default 10) children does not report individual metrics. Instead, it flags the cluster as suppressed to prevent single-family exposure.
4. **FastAPI Web Server**: Serves static frontend files and hosts JSON-REST endpoints. Implements basic token/role validation simulation to enforce authorization boundaries.
5. **Aesthetics & UI**: Modern single-page client built with HTML5, CSS3 grid/flexbox layout, visual charts (comparative bars, line targets), and dynamic review screens.
