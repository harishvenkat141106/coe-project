import csv

class CoverageVerifier:
    def __init__(self, k_threshold=10):
        self.k_threshold = k_threshold

    def calculate_naive_coverage(self, demographics, service_events, facilities):
        # Naive calculation: raw counts of service records / raw catchment population
        # Does not deduplicate demographics, nor link service events through reconciled IDs
        
        # 1. Map facility to cluster
        fac_to_cluster = {f["facility_id"]: f["cluster_served"] for f in facilities}
        cluster_catchment = {f["cluster_served"]: int(f["catchment_population"]) for f in facilities}
        
        # Initialize counts
        # We will track vaccine counts per cluster
        # e.g., cluster -> vaccine -> count
        vaccines_schedule = ["BCG", "DTP1", "DTP2", "DTP3", "MCV1", "MCV2"]
        cluster_vaccine_counts = {c: {v: 0 for v in vaccines_schedule} for c in fac_to_cluster.values()}
        
        # We also need to count total service events per cluster.
        # Direct facility mapping:
        for event in service_events:
            fac_id = event.get("facility_id")
            cluster = fac_to_cluster.get(fac_id)
            vac = event.get("vaccine")
            if cluster and vac in cluster_vaccine_counts[cluster]:
                cluster_vaccine_counts[cluster][vac] += 1
                
        # Calculate naive coverage rate
        naive_coverage = {}
        for cluster, catchment in cluster_catchment.items():
            naive_coverage[cluster] = {}
            for vac in vaccines_schedule:
                count = cluster_vaccine_counts[cluster][vac]
                # In naive calculation, we divide total recorded events by catchment population
                rate = count / catchment if catchment > 0 else 0.0
                naive_coverage[cluster][vac] = {
                    "count": count,
                    "catchment": catchment,
                    "rate": min(rate, 1.25) # Cap at 1.25 for display formatting, but show inflation
                }
        return naive_coverage

    def calculate_reconciled_coverage(self, demographics, service_events, parent_mapping, facilities, offline_facilities=None):
        if offline_facilities is None:
            offline_facilities = set()
            
        # 1. Build child mapping: demographic_id -> parent_id (unified)
        # Using parent_mapping from dedup_engine
        
        # 2. Reconcile demographics: group all child records by their parent_id
        reconciled_children = {}
        child_by_id = {d["child_id"]: d for d in demographics}
        
        for d in demographics:
            cid = d["child_id"]
            pid = parent_mapping.get(cid, cid)
            if pid not in reconciled_children:
                reconciled_children[pid] = []
            reconciled_children[pid].append(d)

        # 3. Associate service events to unified parent_id
        # Group by child_id first
        events_by_child = {}
        for ev in service_events:
            cid = ev.get("child_id")
            if cid:
                if cid not in events_by_child:
                    events_by_child[cid] = []
                events_by_child[cid].append(ev)
            else:
                # If child_id is missing, search demographics by fuzzy match or exact name
                # For this prototype, we match exact string "First Last" to find child_id
                name_ref = ev.get("child_name")
                if name_ref:
                    name_ref = name_ref.strip().lower()
                    for d in demographics:
                        full_name = f"{d['first_name']} {d['last_name']}".strip().lower()
                        if full_name == name_ref:
                            cid = d["child_id"]
                            if cid not in events_by_child:
                                events_by_child[cid] = []
                            events_by_child[cid].append(ev)
                            break
                            
        # Combine vaccine events for each unified parent_id
        reconciled_vaccines = {} # parent_id -> list of unique vaccine doses
        for pid, sibling_records in reconciled_children.items():
            all_sibling_events = []
            # Gather all events across all duplicate child_ids
            for sibling_rec in sibling_records:
                sid = sibling_rec["child_id"]
                sibling_events = events_by_child.get(sid, [])
                all_sibling_events.extend(sibling_events)
            
            # Resolve conflicts: only keep one dose event per vaccine type (earliest wins)
            resolved = {}
            for ev in all_sibling_events:
                vac = ev["vaccine"]
                date_str = ev["date_administered"]
                if vac not in resolved or date_str < resolved[vac]["date_administered"]:
                    resolved[vac] = ev
            reconciled_vaccines[pid] = resolved

        # 4. Map facility to cluster and compile totals
        fac_to_cluster = {f["facility_id"]: f["cluster_served"] for f in facilities}
        cluster_catchment = {f["cluster_served"]: int(f["catchment_population"]) for f in facilities}
        
        # Unique reconciled children count per cluster
        # Map parent child to a cluster based on primary registration (earliest registration date or first in list)
        parent_cluster = {}
        for pid, sibs in reconciled_children.items():
            # sort siblings by registration date to get primary
            sibs_sorted = sorted(sibs, key=lambda x: x.get("reg_date", "9999-99-99"))
            primary_rec = sibs_sorted[0]
            parent_cluster[pid] = primary_rec["cluster_id"]
            
        vaccines_schedule = ["BCG", "DTP1", "DTP2", "DTP3", "MCV1", "MCV2"]
        
        cluster_reconciled_stats = {}
        for cluster in cluster_catchment:
            # Count parents registered in this cluster
            cluster_parents = [pid for pid, cl in parent_cluster.items() if cl == cluster]
            total_eligible = len(cluster_parents)
            
            # Count vaccinations for these eligible parents
            vac_counts = {v: 0 for v in vaccines_schedule}
            for pid in cluster_parents:
                p_vacs = reconciled_vaccines.get(pid, {})
                for vac in vaccines_schedule:
                    if vac in p_vacs:
                        vac_counts[vac] += 1
            
            # Determine Trust/Confidence Flag
            # If any facility serving this cluster is offline, flag is low confidence
            cluster_facilities = [f["facility_id"] for f in facilities if f["cluster_served"] == cluster]
            has_outage = any(fac in offline_facilities for fac in cluster_facilities)
            
            trust_status = "TRUSTED"
            trust_reason = "Normal sync"
            if has_outage:
                trust_status = "LOW_CONFIDENCE"
                trust_reason = "Facility sync outage detected. Data incomplete."
            elif total_eligible == 0:
                trust_status = "LOW_CONFIDENCE"
                trust_reason = "No demographic registrations recorded."
                
            # Enforce k-Anonymity
            is_suppressed = total_eligible < self.k_threshold
            
            cluster_reconciled_stats[cluster] = {
                "total_eligible": total_eligible,
                "vaccines": {},
                "trust_status": trust_status,
                "trust_reason": trust_reason,
                "privacy_status": "SUPPRESSED" if is_suppressed else "EXCEEDS_K_LIMIT"
            }
            
            for vac in vaccines_schedule:
                count = vac_counts[vac]
                rate = count / total_eligible if total_eligible > 0 else 0.0
                
                # If suppressed, do not disclose count or rate in planning exports
                if is_suppressed:
                    cluster_reconciled_stats[cluster]["vaccines"][vac] = {
                        "count": None,
                        "rate": None
                    }
                else:
                    cluster_reconciled_stats[cluster]["vaccines"][vac] = {
                        "count": count,
                        "rate": rate
                    }
                    
        return cluster_reconciled_stats
