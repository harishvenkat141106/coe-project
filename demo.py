import os
import sys
import csv
from datetime import datetime

# Add root folder to python path to import src modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.data_generator import DataGenerator
from src.dedup_engine import DeduplicationEngine, resolve_conflicting_events
from src.coverage_verifier import CoverageVerifier

def run_walkthrough():
    print("=" * 80)
    print(" SHIELDHEALTH: MATERNAL-CHILD SERVICE RECORD DEDUPLICATOR & COVERAGE VERIFIER ")
    print(" PROGRAMMATIC END-TO-END DEMONSTRATION & FAILURE-CASE VALIDATION RUN ")
    print("=" * 80)
    
    data_dir = "data/synthetic"
    
    # -------------------------------------------------------------------------
    # STEP 1: Generate Synthetic Messy Datasets
    # -------------------------------------------------------------------------
    print("\n[STEP 1] Generating Synthetic Dataset (Demographics, Services, Facilities, Households)...")
    dg = DataGenerator(seed=42)
    dg.generate_all(output_dir=data_dir, facility_outage_id="F-03")
    
    # Load files in python lists
    demographics = []
    service_events = []
    facilities = []
    households = []
    ground_truth = []
    true_duplicates = []
    
    with open(os.path.join(data_dir, "facilities.csv"), mode="r", encoding="utf-8") as f:
        facilities = list(csv.DictReader(f))
    with open(os.path.join(data_dir, "households.csv"), mode="r", encoding="utf-8") as f:
        households = list(csv.DictReader(f))
    with open(os.path.join(data_dir, "demographics.csv"), mode="r", encoding="utf-8") as f:
        demographics = list(csv.DictReader(f))
    with open(os.path.join(data_dir, "service_events.csv"), mode="r", encoding="utf-8") as f:
        service_events = list(csv.DictReader(f))
    with open(os.path.join(data_dir, "ground_truth.csv"), mode="r", encoding="utf-8") as f:
        ground_truth = list(csv.DictReader(f))
    with open(os.path.join(data_dir, "true_duplicates_log.csv"), mode="r", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            true_duplicates.append((r["child_id1"], r["child_id2"]))

    print(f"-> Loaded {len(demographics)} registered child records (F-03 data omitted to simulate outage).")
    print(f"-> Loaded {len(service_events)} immunization service logs.")
    print(f"-> Loaded {len(facilities)} health facilities serving the district.")
    print(f"-> Loaded {len(households)} households.")
    print(f"-> Loaded {len(ground_truth)} ground truth children (complete reference registry).")
    print(f"-> Loaded {len(true_duplicates)} true duplicate links to verify model accuracy.")

    # -------------------------------------------------------------------------
    # STEP 2: Naive Baseline Coverage (No Deduplication)
    # -------------------------------------------------------------------------
    print("\n[STEP 2] Computing Naive Baseline Coverage (Direct counts/catchment population)...")
    verifier = CoverageVerifier(k_threshold=10)
    naive_coverage = verifier.calculate_naive_coverage(demographics, service_events, facilities)
    
    # -------------------------------------------------------------------------
    # STEP 3: Reconciled Coverage Pipeline
    # -------------------------------------------------------------------------
    print("\n[STEP 3] Running Probabilistic Deduplication & Coverage Verification Pipeline...")
    engine = DeduplicationEngine(auto_threshold=0.85, review_threshold=0.50)
    parent_map, clusters_rec, review_queue = engine.deduplicate(demographics)
    
    # Compute Reconciled stats (respecting k-anonymity and facility sync outage)
    # We pass F-03 in the offline list to check trust degradation
    offline_facilities = {"F-03"}
    reconciled_coverage = verifier.calculate_reconciled_coverage(
        demographics, service_events, parent_map, facilities, offline_facilities
    )
    
    # -------------------------------------------------------------------------
    # STEP 4: Trigger and Verify Failure Cases
    # -------------------------------------------------------------------------
    print("\n" + "-" * 50)
    print(" VERIFYING FAILURE AND EDGE CASES (SAFE FALLBACK MECHANISMS)")
    print("-" * 50)
    
    # --- Failure Case 1: Ambiguous Match ---
    # We injected two kids named Ali Kamara in C-01 with same DOB and mother but distinct households/missing phone.
    # They should NOT auto-merge; they should flag for review.
    print("\n[CASE 1] Ambiguous Match (Same Name + Same DOB + No phone/distinct household)")
    amb_review_items = []
    for item in review_queue:
        n1 = f"{item['record_1']['first_name']} {item['record_1']['last_name']}"
        n2 = f"{item['record_2']['first_name']} {item['record_2']['last_name']}"
        if n1 == "Ali Kamara" and n2 == "Ali Kamara":
            amb_review_items.append(item)
            
    if len(amb_review_items) > 0:
        print("[OK] SUCCESS: System safely intercepted ambiguous match.")
        print(f"  -> Candidate Pair: {amb_review_items[0]['record_1']['child_id']} & {amb_review_items[0]['record_2']['child_id']}")
        print(f"  -> Match Score: {amb_review_items[0]['score']:.2%}")
        print(f"  -> Action: Flagged and routed to Review Queue. Auto-merge: BLOCKED.")
    else:
        print("[ERROR] FAILURE: Ambiguous match was not intercepted or was auto-merged.")

    # --- Failure Case 2: Data Sync Outage ---
    # Facility F-03 serves Cluster C-03. F-03 is offline.
    # The coverage verifier should flag C-03 trust status as LOW_CONFIDENCE.
    print("\n[CASE 2] Facility Sync Outage (Facility F-03 offline)")
    c03_stats = reconciled_coverage.get("C-03")
    if c03_stats and c03_stats["trust_status"] == "LOW_CONFIDENCE":
        print("[OK] SUCCESS: System detected the sync outage at F-03 and degraded trust status gracefully.")
        print(f"  -> Cluster C-03 Trust Status: {c03_stats['trust_status']}")
        print(f"  -> Reason: {c03_stats['trust_reason']}")
    else:
        print("[ERROR] FAILURE: System did not flag trust status degradation for C-03.")

    # --- Failure Case 3: k-Anonymity Suppression ---
    # Cluster C-05 has only 6 registered children, which is below the threshold of 10.
    # Its demographics metrics and vaccine rates must be suppressed from planning exports.
    print("\n[CASE 3] k-Anonymity Privacy Violation Safeguard (Cluster C-05 population < 10)")
    c05_stats = reconciled_coverage.get("C-05")
    if c05_stats and c05_stats["privacy_status"] == "SUPPRESSED":
        print("[OK] SUCCESS: Cluster C-05 suppressed safely to protect client identity.")
        print(f"  -> Cluster C-05 registered count: {c05_stats['total_eligible']} (Threshold: {verifier.k_threshold})")
        print(f"  -> BCG Count: {c05_stats['vaccines']['BCG']['count']} (Disclosed: Hidden/None)")
        print(f"  -> BCG Rate: {c05_stats['vaccines']['BCG']['rate']} (Disclosed: Hidden/None)")
    else:
        print("[ERROR] FAILURE: Small cluster C-05 was not suppressed under k-anonymity.")

    # --- Failure Case 4: Conflicting Dose Records ---
    print("\n[CASE 4] Conflicting Dose Records (Same child, same vaccine, different dates)")
    # Let's create two mock events for vaccine BCG with different dates and run conflict resolution
    conflict_events = [
        {"vaccine": "BCG", "date_administered": "2024-03-10", "facility_id": "F-01", "event_id": "E1"},
        {"vaccine": "BCG", "date_administered": "2024-03-01", "facility_id": "F-02", "event_id": "E2"} # earliest
    ]
    resolved = resolve_conflicting_events(conflict_events)
    if len(resolved) == 1 and resolved[0]["date_administered"] == "2024-03-01":
        print("[OK] SUCCESS: Conflicting doses resolved. Earliest valid date wins.")
        print(f"  -> Selected Event: {resolved[0]['event_id']} on date {resolved[0]['date_administered']}")
    else:
        print("[ERROR] FAILURE: Conflict resolution rule did not apply correctly.")

    print("\n" + "-" * 50)
    print(" EXPERIMENT RESULTS & HEAD-TO-HEAD METRICS ")
    print("-" * 50)

    # -------------------------------------------------------------------------
    # STEP 5: Print Head-to-Head Comparison Metrics
    # -------------------------------------------------------------------------
    # Deduplication Precision/Recall
    gt_pairs = set()
    for c1, c2 in true_duplicates:
        gt_pairs.add((c1, c2) if c1 < c2 else (c2, c1))
        
    actual_pairs = set()
    parent_groups = {}
    for cid, pid in parent_map.items():
        if pid not in parent_groups:
            parent_groups[pid] = []
        parent_groups[pid].append(cid)
        
    for pid, group in parent_groups.items():
        m = len(group)
        for i in range(m):
            for j in range(i + 1, m):
                c1, c2 = group[i], group[j]
                actual_pairs.add((c1, c2) if c1 < c2 else (c2, c1))
                
    tp = len(gt_pairs.intersection(actual_pairs))
    fp = len(actual_pairs - gt_pairs)
    fn = len(gt_pairs - actual_pairs)
    
    precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    print(f"Algorithmic Linkage Quality:")
    print(f"  * Precision: {precision:.2%}")
    print(f"  * Recall:    {recall:.2%}")
    print(f"  * F1-Score:  {f1:.2%}")
    print(f"  * Audit Linkages Resolved: TP={tp}, FP={fp} (False merges), FN={fn} (Missed duplicates)")

    # Coverage Error analysis overall (Core Indicator DTP3)
    gt_total = len(ground_truth)
    gt_dtp3_count = sum(1 for gt in ground_truth if "DTP3:" in gt.get("vaccines", ""))
    gt_dtp3_rate = gt_dtp3_count / gt_total
    
    # Summing synced cluster totals
    # We turn off k-anonymity suppression to compute aggregate comparison metrics
    eval_verifier = CoverageVerifier(k_threshold=0)
    rec_eval = eval_verifier.calculate_reconciled_coverage(demographics, service_events, parent_map, facilities, offline_facilities)
    
    total_reconciled_eligible = sum(c["total_eligible"] for c in rec_eval.values())
    total_reconciled_dtp3 = sum(c["vaccines"]["DTP3"]["count"] for c in rec_eval.values())
    rec_dtp3_rate = total_reconciled_dtp3 / total_reconciled_eligible if total_reconciled_eligible > 0 else 0.0

    total_naive_catchment = sum(c["BCG"]["catchment"] for c in naive_coverage.values())
    total_naive_dtp3 = sum(c["DTP3"]["count"] for c in naive_coverage.values())
    naive_dtp3_rate = total_naive_dtp3 / total_naive_catchment if total_naive_catchment > 0 else 0.0

    print(f"\nDTP3 Immunization Coverage Rate Comparison:")
    print(f"  * Ground Truth Rate:   {gt_dtp3_rate:.2%}")
    print(f"  * Naive Baseline Rate: {naive_dtp3_rate:.2%} (Error: {naive_dtp3_rate - gt_dtp3_rate:+.2%})")
    print(f"  * Reconciled Rate:     {rec_dtp3_rate:.2%} (Error: {rec_dtp3_rate - gt_dtp3_rate:+.2%})")
    
    print("\n" + "=" * 80)
    print(" WALKTHROUGH PIPELINE SUCCESSFULLY COMPLETED ")
    print("=" * 80)

if __name__ == "__main__":
    run_walkthrough()
