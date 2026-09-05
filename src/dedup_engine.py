import math
from datetime import datetime

# Pure Python Jaro-Winkler Similarity
def jaro_winkler_similarity(s1, s2):
    if not s1 or not s2:
        return 0.0
    
    s1 = s1.strip().lower()
    s2 = s2.strip().lower()
    
    if s1 == s2:
        return 1.0
        
    len1, len2 = len(s1), len(s2)
    match_distance = max(len1, len2) // 2 - 1
    match_distance = max(0, match_distance)
    
    s1_matches = [False] * len1
    s2_matches = [False] * len2
    
    matches = 0
    transpositions = 0
    
    for i in range(len1):
        start = max(0, i - match_distance)
        end = min(len2, i + match_distance + 1)
        for j in range(start, end):
            if s2_matches[j]:
                continue
            if s1[i] == s2[j]:
                s1_matches[i] = True
                s2_matches[j] = True
                matches += 1
                break
                
    if matches == 0:
        return 0.0
        
    k = 0
    for i in range(len1):
        if not s1_matches[i]:
            continue
        while not s2_matches[k]:
            k += 1
        if s1[i] != s2[k]:
            transpositions += 1
        k += 1
        
    transpositions //= 2
    
    jaro = (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3.0
    
    # Winkler adjustment
    prefix_len = 0
    for i in range(min(4, min(len1, len2))):
        if s1[i] == s2[i]:
            prefix_len += 1
        else:
            break
            
    return jaro + prefix_len * 0.1 * (1.0 - jaro)

# Pure Python Soundex Function for Phonetic Matching
def soundex(name):
    if not name:
        return "0000"
    name = name.upper()
    first_char = name[0]
    
    mappings = {
        'B': '1', 'F': '1', 'P': '1', 'V': '1',
        'C': '2', 'G': '2', 'J': '2', 'K': '2', 'Q': '2', 'S': '2', 'X': '2', 'Z': '2',
        'D': '3', 'T': '3',
        'L': '4',
        'M': '5', 'N': '5',
        'R': '6'
    }
    
    soundex_digits = ""
    for char in name[1:]:
        digit = mappings.get(char, "")
        if digit:
            # Avoid repeating digits adjacent to each other
            if not soundex_digits or digit != soundex_digits[-1]:
                soundex_digits += digit
                
    # Remove vowels, H, W, Y is implicitly done by checking mappings
    soundex_digits = first_char + soundex_digits
    soundex_digits = soundex_digits.replace(" ", "")
    
    if len(soundex_digits) < 4:
        soundex_digits += "0" * (4 - len(soundex_digits))
    return soundex_digits[:4]

class DeduplicationEngine:
    def __init__(self, auto_threshold=0.85, review_threshold=0.50):
        self.auto_threshold = auto_threshold
        self.review_threshold = review_threshold
        self.audit_log = []

    def get_dob_score(self, dob1, dob2):
        if not dob1 or not dob2:
            return 0.0
        try:
            d1 = datetime.strptime(dob1, "%Y-%m-%d")
            d2 = datetime.strptime(dob2, "%Y-%m-%d")
            diff = abs((d1 - d2).days)
            if diff == 0:
                return 1.0
            if diff > 180:
                return 0.0
            # Decay score exponentially
            return math.exp(-diff / 30.0)
        except ValueError:
            return 0.0

    def compute_probabilistic_score(self, r1, r2):
        # Weights
        # first_name: 0.25, last_name: 0.20, mother_name: 0.15, dob: 0.15, phone: 0.10, sex: 0.05, household: 0.05, cluster: 0.05
        weights = {
            "first_name": 0.25,
            "last_name": 0.20,
            "mother_name": 0.15,
            "dob": 0.15,
            "phone": 0.10,
            "sex": 0.05,
            "household": 0.05,
            "cluster": 0.05
        }

        # Similarities
        sims = {}
        sims["first_name"] = jaro_winkler_similarity(r1.get("first_name", ""), r2.get("first_name", ""))
        sims["last_name"] = jaro_winkler_similarity(r1.get("last_name", ""), r2.get("last_name", ""))
        
        # Mother name match: If missing in one, score is 0.5 (neutral)
        m1, m2 = r1.get("mother_name", ""), r2.get("mother_name", "")
        if m1 and m2:
            sims["mother_name"] = jaro_winkler_similarity(m1, m2)
        else:
            sims["mother_name"] = 0.5
            
        sims["dob"] = self.get_dob_score(r1.get("dob", ""), r2.get("dob", ""))
        
        # Phone:
        p1, p2 = r1.get("phone", ""), r2.get("phone", "")
        if p1 and p2:
            sims["phone"] = 1.0 if p1 == p2 else 0.0
        else:
            sims["phone"] = 0.5 # missing phone is neutral
            
        # Sex: Mismatch is heavily penalized
        s1, s2 = r1.get("sex", ""), r2.get("sex", "")
        if s1 and s2:
            sims["sex"] = 1.0 if s1 == s2 else -1.0 # strong penalty for gender mismatch
        else:
            sims["sex"] = 0.5

        # Household:
        h1, h2 = r1.get("household_id", ""), r2.get("household_id", "")
        if h1 and h2:
            sims["household"] = 1.0 if h1 == h2 else 0.0
        else:
            sims["household"] = 0.5

        # Cluster:
        c1, c2 = r1.get("cluster_id", ""), r2.get("cluster_id", "")
        if c1 and c2:
            sims["cluster"] = 1.0 if c1 == c2 else -0.5 # penalty if different clusters
        else:
            sims["cluster"] = 0.5

        # Phonetic checks
        fn_soundex1 = soundex(r1.get("first_name", ""))
        fn_soundex2 = soundex(r2.get("first_name", ""))
        ln_soundex1 = soundex(r1.get("last_name", ""))
        ln_soundex2 = soundex(r2.get("last_name", ""))
        
        # If phonetic matches, give small boost
        phonetic_boost = 0.0
        if fn_soundex1 == fn_soundex2:
            phonetic_boost += 0.02
        if ln_soundex1 == ln_soundex2:
            phonetic_boost += 0.02

        # Weighted sum
        score = sum(sims[key] * weights[key] for key in weights) + phonetic_boost
        
        # Clip score between 0.0 and 1.0
        score = max(0.0, min(1.0, score))
        
        # Sibling Twin Guardrail: If first names are completely different (low Jaro-Winkler)
        # but DOB and household and phone match (siblings/twins), clamp score to reject or review
        if sims["first_name"] < 0.60 and sims["sex"] == -1.0:
            score = min(score, 0.40) # Mismatching genders and different names = Reject
        elif sims["first_name"] < 0.60 and sims["dob"] > 0.90:
            score = min(score, 0.55) # Same age, same household, but different name = review/reject
            
        return score, sims

    def deduplicate(self, records):
        self.audit_log = []
        n = len(records)
        
        # Mapping from child_id -> representative child_id (merged parent)
        # Initially, each record is its own representative
        parent = {r["child_id"]: r["child_id"] for r in records}
        
        def find(cid):
            path = []
            while parent[cid] != cid:
                path.append(cid)
                cid = parent[cid]
            for node in path:
                parent[node] = cid
            return cid
            
        def union(cid1, cid2):
            root1 = find(cid1)
            root2 = find(cid2)
            if root1 != root2:
                parent[root2] = root1
                return True
            return False

        # Blocking strategy: only compare records sharing:
        # - same household_id
        # - OR same phone
        # - OR same cluster_id AND same first letter of first name
        # This reduces comparison search space significantly.
        blocks = {}
        for r in records:
            keys = set()
            if r.get("household_id"):
                keys.add(f"hh_{r['household_id']}")
            if r.get("phone"):
                keys.add(f"phone_{r['phone']}")
            if r.get("cluster_id") and r.get("first_name"):
                first_letter = r["first_name"][0].upper() if len(r["first_name"]) > 0 else "?"
                keys.add(f"cluster_first_{r['cluster_id']}_{first_letter}")
                
            for k in keys:
                if k not in blocks:
                    blocks[k] = []
                blocks[k].append(r)

        # Generate candidate pairs to compare
        candidate_pairs = set()
        for key, block_records in blocks.items():
            m = len(block_records)
            for i in range(m):
                for j in range(i + 1, m):
                    id1 = block_records[i]["child_id"]
                    id2 = block_records[j]["child_id"]
                    if id1 < id2:
                        candidate_pairs.add((id1, id2))
                    else:
                        candidate_pairs.add((id2, id1))

        # Perform matches on candidate pairs
        review_queue = []
        
        # Convert list to dict for fast access
        records_dict = {r["child_id"]: r for r in records}
        
        for id1, id2 in sorted(candidate_pairs):
            r1 = records_dict[id1]
            r2 = records_dict[id2]
            
            # Deterministic Check
            # e.g., if we had a national ID, we'd use it.
            # Here: if same household, same first name, same last name, same sex, same DOB -> Auto-merge
            if (r1.get("household_id") == r2.get("household_id") and
                r1.get("first_name", "").strip().lower() == r2.get("first_name", "").strip().lower() and
                r1.get("last_name", "").strip().lower() == r2.get("last_name", "").strip().lower() and
                r1.get("dob") == r2.get("dob") and
                r1.get("sex") == r2.get("sex") and 
                r1.get("dob") is not None):
                
                union(id1, id2)
                self.audit_log.append({
                    "record_1": id1,
                    "record_2": id2,
                    "score": 1.0,
                    "decision": "AUTO_MERGE_DETERMINISTIC",
                    "reason": "Exact match on demographics (name, DOB, household, sex)"
                })
                continue

            # Probabilistic scoring
            score, sims = self.compute_probabilistic_score(r1, r2)
            
            if score >= self.auto_threshold:
                # Merge
                union(id1, id2)
                self.audit_log.append({
                    "record_1": id1,
                    "record_2": id2,
                    "score": score,
                    "decision": "AUTO_MERGE_PROBABILISTIC",
                    "reason": f"Probabilistic score {score:.2f} >= {self.auto_threshold}",
                    "details": sims
                })
            elif score >= self.review_threshold:
                # Add to review queue
                review_queue.append({
                    "record_1": r1,
                    "record_2": r2,
                    "score": score,
                    "details": sims,
                    "status": "PENDING"
                })
                self.audit_log.append({
                    "record_1": id1,
                    "record_2": id2,
                    "score": score,
                    "decision": "FLAGGED_FOR_REVIEW",
                    "reason": f"Score {score:.2f} in range [{self.review_threshold}, {self.auto_threshold})",
                    "details": sims
                })
            else:
                self.audit_log.append({
                    "record_1": id1,
                    "record_2": id2,
                    "score": score,
                    "decision": "REJECT",
                    "reason": f"Score {score:.2f} < {self.review_threshold}",
                    "details": sims
                })

        # Build groupings
        clusters_reconciled = {}
        for r in records:
            root = find(r["child_id"])
            if root not in clusters_reconciled:
                clusters_reconciled[root] = []
            clusters_reconciled[root].append(r["child_id"])
            
        return parent, clusters_reconciled, review_queue

# Conflict Resolution Helper
def resolve_conflicting_events(events):
    # events is a list of event dictionaries, e.g. [{"vaccine": "BCG", "date": "2024-01-05", ...}]
    # Group by vaccine type, take earliest date if duplicate dose events exist for the same vaccine
    resolved = []
    by_vaccine = {}
    for ev in events:
        vac = ev["vaccine"]
        if vac not in by_vaccine:
            by_vaccine[vac] = ev
        else:
            # Conflict resolution: earliest date wins
            d1 = datetime.strptime(by_vaccine[vac]["date_administered"], "%Y-%m-%d")
            d2 = datetime.strptime(ev["date_administered"], "%Y-%m-%d")
            if d2 < d1:
                by_vaccine[vac] = ev
    return list(by_vaccine.values())
