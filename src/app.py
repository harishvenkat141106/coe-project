import os
import csv
from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List

from src.data_generator import DataGenerator
from src.dedup_engine import DeduplicationEngine, resolve_conflicting_events
from src.coverage_verifier import CoverageVerifier
from src.config import Config
from src.genai_explain import GenAIExplainer

app = FastAPI(title="Maternal-Child Service Record Deduplicator & Coverage Verifier")

# Mount static files directory
static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# In-memory database representation
class AppState:
    def __init__(self):
        self.demographics = []
        self.service_events = []
        self.facilities = []
        self.households = []
        self.ground_truth = []
        self.true_duplicates = [] # list of sets or tuples
        
        self.parent_mapping = {}
        self.clusters_reconciled = {}
        self.review_queue = []
        self.manual_decisions = {} # (id1, id2) -> "MERGE" or "SPLIT"
        
        # State configurations
        self.k_threshold = Config.DEFAULT_K_ANONYMITY_THRESHOLD
        self.offline_facilities = {"F-03"} # F-03 has a data sync outage by default

state = AppState()

# Ingest / generate data helper
def load_data_from_files():
    data_dir = "data/synthetic"
    if not os.path.exists(os.path.join(data_dir, "demographics.csv")):
        # Generate data if not present
        dg = DataGenerator()
        dg.generate_all(output_dir=data_dir)
        
    state.demographics = []
    state.service_events = []
    state.facilities = []
    state.households = []
    state.ground_truth = []
    state.true_duplicates = []
    
    # Read facilities
    with open(os.path.join(data_dir, "facilities.csv"), mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        state.facilities = list(reader)
        
    # Read households
    with open(os.path.join(data_dir, "households.csv"), mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        state.households = list(reader)
        
    # Read demographics
    with open(os.path.join(data_dir, "demographics.csv"), mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        state.demographics = list(reader)
        
    # Read service events
    with open(os.path.join(data_dir, "service_events.csv"), mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        state.service_events = list(reader)
        
    # Read ground truth (for metrics dashboard)
    if os.path.exists(os.path.join(data_dir, "ground_truth.csv")):
        with open(os.path.join(data_dir, "ground_truth.csv"), mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            state.ground_truth = list(reader)
            
    # Read true duplicates log
    if os.path.exists(os.path.join(data_dir, "true_duplicates_log.csv")):
        with open(os.path.join(data_dir, "true_duplicates_log.csv"), mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                state.true_duplicates.append((row["child_id1"], row["child_id2"]))

    # Initialize / Run matching engine
    run_deduplication()

def run_deduplication():
    # Run the engine
    engine = DeduplicationEngine(auto_threshold=0.85, review_threshold=0.50)
    parent_map, clusters_rec, r_queue = engine.deduplicate(state.demographics)
    
    # Apply manual decisions
    # If a manual decision exists, overwrite parent_map
    for (id1, id2), decision in state.manual_decisions.items():
        if decision == "MERGE":
            # Set parent of id2 to parent of id1
            p1 = parent_map.get(id1, id1)
            p2 = parent_map.get(id2, id2)
            
            # Find and update all nodes with parent p2 to p1
            for k, v in parent_map.items():
                if v == p2:
                    parent_map[k] = p1
            parent_map[id2] = p1
        elif decision == "SPLIT":
            # Separate them: reset parent of id2 to itself
            # This is simplified: reset to original state
            p2 = parent_map.get(id2, id2)
            if p2 == parent_map.get(id1, id1):
                parent_map[id2] = id2
                # Also reset any other nodes that were grouped with id2 if needed,
                # but for this demo just splitting id2 is sufficient.

    state.parent_mapping = parent_map
    state.clusters_reconciled = clusters_rec
    
    # Filter review queue: remove already resolved decisions
    filtered_queue = []
    for item in r_queue:
        id1 = item["record_1"]["child_id"]
        id2 = item["record_2"]["child_id"]
        pair = (id1, id2) if id1 < id2 else (id2, id1)
        if pair in state.manual_decisions:
            item["status"] = state.manual_decisions[pair]
        filtered_queue.append(item)
    state.review_queue = filtered_queue

# Pydantic models for REST requests
class IngestRequest(BaseModel):
    trigger_generation: bool = True
    offline_facilities: Optional[List[str]] = None

class DedupActionRequest(BaseModel):
    record_1_id: str
    record_2_id: str
    action: str # "MERGE" or "SPLIT"

# REST API Endpoints

@app.post("/api/ingest")
def trigger_ingest(req: IngestRequest):
    if req.trigger_generation:
        dg = DataGenerator()
        # If outage list was provided, set the main outage
        outage_fac = req.offline_facilities[0] if req.offline_facilities else "F-03"
        dg.generate_all(facility_outage_id=outage_fac)
    
    if req.offline_facilities is not None:
        state.offline_facilities = set(req.offline_facilities)
    else:
        state.offline_facilities = {"F-03"}
        
    state.manual_decisions = {} # Reset reviews on fresh ingest
    load_data_from_files()
    
    return {
        "status": "success",
        "demographics_count": len(state.demographics),
        "services_count": len(state.service_events),
        "facilities_count": len(state.facilities),
        "households_count": len(state.households)
    }

@app.get("/api/coverage")
def get_coverage(k: Optional[int] = None):
    if k is not None:
        state.k_threshold = k
        
    verifier = CoverageVerifier(k_threshold=state.k_threshold)
    naive = verifier.calculate_naive_coverage(state.demographics, state.service_events, state.facilities)
    reconciled = verifier.calculate_reconciled_coverage(
        state.demographics, state.service_events, state.parent_mapping, state.facilities, state.offline_facilities
    )
    
    return {
        "k_threshold": state.k_threshold,
        "offline_facilities": list(state.offline_facilities),
        "naive": naive,
        "reconciled": reconciled
    }

@app.get("/api/dedup/review")
def get_review_queue():
    # Only return PENDING items
    pending = [item for item in state.review_queue if item["status"] == "PENDING"]
    return {
        "count": len(pending),
        "queue": pending
    }

@app.post("/api/dedup/action")
def resolve_dedup_match(req: DedupActionRequest):
    if req.action not in ["MERGE", "SPLIT"]:
        raise HTTPException(status_code=400, detail="Invalid action. Must be MERGE or SPLIT.")
        
    id1, id2 = req.record_1_id, req.record_2_id
    pair = (id1, id2) if id1 < id2 else (id2, id1)
    
    state.manual_decisions[pair] = req.action
    run_deduplication()
    
    return {"status": "success", "message": f"Applied {req.action} to pair ({id1}, {id2})"}

@app.get("/api/field/verify")
def verify_field_record(
    q: str = Query(..., description="Search query (name, DOB, or phone)"),
    x_user_role: Optional[str] = Header(None)
):
    # Enforce PII role-based access control
    # Simulates verification screen only accessible to field_worker role
    if x_user_role != "field_worker":
        raise HTTPException(
            status_code=403, 
            detail="Forbidden: Detailed PII query is restricted to authorized field workers at point-of-care (X-User-Role header missing or invalid)."
        )
        
    q = q.lower().strip()
    results = []
    
    # Simple search demographic registry
    for d in state.demographics:
        full_name = f"{d['first_name']} {d['last_name']}".lower()
        if q in full_name or q in d.get("phone", "") or q in d.get("dob", ""):
            # Gather child's reconciled record detail and vaccine schedule
            pid = state.parent_mapping.get(d["child_id"], d["child_id"])
            
            # Find sibling duplicates if any
            duplicates = [k for k, v in state.parent_mapping.items() if v == pid and k != d["child_id"]]
            
            # Find events
            events = []
            for ev in state.service_events:
                if ev.get("child_id") == d["child_id"] or (ev.get("child_id") in duplicates and len(duplicates) > 0):
                    events.append({
                        "event_id": ev["event_id"],
                        "vaccine": ev["vaccine"],
                        "date_administered": ev["date_administered"],
                        "facility_id": ev["facility_id"]
                    })
            
            # Resolve conflicts: earliest vaccine wins
            resolved_events = resolve_conflicting_events(events)
            
            results.append({
                "demographics": d,
                "unified_parent_id": pid,
                "linked_duplicates": duplicates,
                "immunizations": resolved_events
            })
            
    return {"count": len(results), "results": results}

@app.get("/api/system/trust-status")
def get_system_trust():
    outage_detected = len(state.offline_facilities) > 0
    pending_reviews = sum(1 for item in state.review_queue if item["status"] == "PENDING")
    
    overall_status = "STABLE"
    reasons = []
    
    if outage_detected:
        overall_status = "DEGRADED"
        reasons.append(f"Outage detected in facility feeds: {', '.join(state.offline_facilities)}")
    if pending_reviews > 5:
        overall_status = "DEGRADED"
        reasons.append(f"High number of ambiguous records awaiting human review: {pending_reviews}")
        
    return {
        "status": overall_status,
        "outage_detected": outage_detected,
        "offline_facilities": list(state.offline_facilities),
        "pending_reviews": pending_reviews,
        "reasons": reasons
    }

@app.get("/api/metrics")
def get_metrics():
    # If ground truth doesn't exist, return empty stats
    if not state.ground_truth:
        return {"status": "no_ground_truth"}
        
    # Calculate Precision and Recall of the matching engine
    # Ground truth duplicates are stored in state.true_duplicates as pairs of (cid1, cid2)
    # Reconciled duplicates are pairs of child_ids sharing the same parent in state.parent_mapping
    
    gt_pairs = set()
    for c1, c2 in state.true_duplicates:
        gt_pairs.add((c1, c2) if c1 < c2 else (c2, c1))
        
    # Compile actual matched pairs (excluding self-matches)
    actual_pairs = set()
    # Group by parent
    parent_groups = {}
    for cid, pid in state.parent_mapping.items():
        if pid not in parent_groups:
            parent_groups[pid] = []
        parent_groups[pid].append(cid)
        
    for pid, group in parent_groups.items():
        m = len(group)
        for i in range(m):
            for j in range(i + 1, m):
                c1, c2 = group[i], group[j]
                actual_pairs.add((c1, c2) if c1 < c2 else (c2, c1))
                
    # Intersection (True Positives)
    tp = len(gt_pairs.intersection(actual_pairs))
    # False Positives (matched in engine, but are actually different children, e.g. siblings)
    fp = len(actual_pairs - gt_pairs)
    # False Negatives (actual duplicates missed by engine)
    fn = len(gt_pairs - actual_pairs)
    
    precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    
    # Calculate coverage error vs ground truth
    # We will evaluate DTP3 and MCV1 coverage overall for reconciled vs. naive vs. ground truth
    gt_dtp3_count = 0
    gt_mcv1_count = 0
    for gt in state.ground_truth:
        vacs = gt.get("vaccines", "").split("|")
        for v in vacs:
            if v.startswith("DTP3:"):
                gt_dtp3_count += 1
            elif v.startswith("MCV1:"):
                gt_mcv1_count += 1
                
    gt_total = len(state.ground_truth)
    gt_dtp3_rate = gt_dtp3_count / gt_total if gt_total > 0 else 0.0
    gt_mcv1_rate = gt_mcv1_count / gt_total if gt_total > 0 else 0.0
    
    # Reconciled counts (for synced facilities)
    verifier = CoverageVerifier(k_threshold=0) # turn off suppression for metric comparison
    reconciled_stats = verifier.calculate_reconciled_coverage(
        state.demographics, state.service_events, state.parent_mapping, state.facilities, state.offline_facilities
    )
    
    naive_stats = verifier.calculate_naive_coverage(state.demographics, state.service_events, state.facilities)
    
    # Summarize overall rates
    # Sum across all clusters
    total_reconciled_eligible = sum(c["total_eligible"] for c in reconciled_stats.values())
    total_reconciled_dtp3 = sum(c["vaccines"]["DTP3"]["count"] for c in reconciled_stats.values() if c["vaccines"]["DTP3"]["count"] is not None)
    total_reconciled_mcv1 = sum(c["vaccines"]["MCV1"]["count"] for c in reconciled_stats.values() if c["vaccines"]["MCV1"]["count"] is not None)
    
    total_naive_catchment = sum(c["BCG"]["catchment"] for c in naive_stats.values()) # catchment is same for all vaccines
    total_naive_dtp3 = sum(c["DTP3"]["count"] for c in naive_stats.values())
    total_naive_mcv1 = sum(c["MCV1"]["count"] for c in naive_stats.values())
    
    rec_dtp3_rate = total_reconciled_dtp3 / total_reconciled_eligible if total_reconciled_eligible > 0 else 0.0
    rec_mcv1_rate = total_reconciled_mcv1 / total_reconciled_eligible if total_reconciled_eligible > 0 else 0.0
    
    naive_dtp3_rate = total_naive_dtp3 / total_naive_catchment if total_naive_catchment > 0 else 0.0
    naive_mcv1_rate = total_naive_mcv1 / total_naive_catchment if total_naive_catchment > 0 else 0.0

    return {
        "dedup_metrics": {
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "precision": precision,
            "recall": recall,
            "f1_score": f1
        },
        "coverage_metrics": {
            "dtp3": {
                "ground_truth_rate": gt_dtp3_rate,
                "naive_rate": naive_dtp3_rate,
                "reconciled_rate": rec_dtp3_rate,
                "naive_error": naive_dtp3_rate - gt_dtp3_rate,
                "reconciled_error": rec_dtp3_rate - gt_dtp3_rate
            },
            "mcv1": {
                "ground_truth_rate": gt_mcv1_rate,
                "naive_rate": naive_mcv1_rate,
                "reconciled_rate": rec_mcv1_rate,
                "naive_error": naive_mcv1_rate - gt_mcv1_rate,
                "reconciled_error": rec_mcv1_rate - gt_mcv1_rate
            }
        }
    }

# Fallback root route to serve UI index.html
@app.get("/", response_class=HTMLResponse)
def serve_ui():
    ui_path = os.path.join(static_dir, "index.html")
    if os.path.exists(ui_path):
        with open(ui_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>Maternal-Child Service Record Deduplicator (UI static files not built yet)</h1>")

# Initialize app state upon launch
@app.on_event("startup")
def startup_event():
    load_data_from_files()
