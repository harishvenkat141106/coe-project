import csv
import os
import random
from datetime import datetime, timedelta

class DataGenerator:
    def __init__(self, seed=42):
        random.seed(seed)
        self.clusters = [f"C-{i:02d}" for i in range(1, 11)]
        self.facilities = [
            {"id": "F-01", "name": "District Central Hospital", "cluster": "C-01", "pop": 500, "capacity": 1000, "schedule": "Mon-Fri"},
            {"id": "F-02", "name": "North Migrant Health Post", "cluster": "C-02", "pop": 300, "capacity": 500, "schedule": "Mon,Wed,Fri"},
            {"id": "F-03", "name": "East River Clinic", "cluster": "C-03", "pop": 250, "capacity": 400, "schedule": "Tue,Thu"},
            {"id": "F-04", "name": "Nomadic Outreach Station", "cluster": "C-04", "pop": 200, "capacity": 300, "schedule": "Seasonal"},
            {"id": "F-05", "name": "Highland Community Clinic", "cluster": "C-05", "pop": 15, "capacity": 50, "schedule": "Monthly"}
        ]
        
        self.first_names_boy = ["Muhammad", "David", "Emmanuel", "Ali", "Kwame", "Kofi", "John", "Moussa", "Ibrahim", "Samuel"]
        self.first_names_girl = ["Amina", "Sarah", "Fatoumata", "Mary", "Grace", "Mariam", "Aisha", "Esther", "Joy", "Elizabeth"]
        self.last_names = ["Kamara", "Mensah", "Osei", "Diallo", "Sow", "Keita", "Smith", "Johnson", "Ali", "Toure"]
        self.mobility_patterns = ["Settled", "Seasonal-Worker", "Nomadic", "Displaced", "Cross-Border"]

    def generate_phone(self):
        return f"+2332{random.randint(10000000, 99999999)}"

    def corrupt_name(self, name):
        if random.random() < 0.3:
            # Phonetic replacements or typos
            replacements = {"Muhammad": "Mohamed", "David": "Davidi", "Emmanuel": "Manuel", 
                            "Amina": "Aminat", "Sarah": "Sara", "Fatoumata": "Fatima",
                            "Mary": "Marie", "Kamara": "Camara", "Diallo": "Dalo", "Keita": "Keta"}
            for k, v in replacements.items():
                if k in name:
                    return name.replace(k, v)
        # Typo: insert/swap character
        if len(name) > 4 and random.random() < 0.2:
            idx = random.randint(1, len(name) - 2)
            name_list = list(name)
            name_list[idx], name_list[idx+1] = name_list[idx+1], name_list[idx]
            return "".join(name_list)
        return name

    def generate_all(self, output_dir="data/synthetic", facility_outage_id="F-03"):
        os.makedirs(output_dir, exist_ok=True)
        
        # 1. Generate Facilities
        facilities_file = os.path.join(output_dir, "facilities.csv")
        with open(facilities_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["facility_id", "name", "cluster_served", "catchment_population", "cold_chain_capacity", "outreach_schedule"])
            for fac in self.facilities:
                writer.writerow([fac["id"], fac["name"], fac["cluster"], fac["pop"], fac["capacity"], fac["schedule"]])

        # 2. Generate Households
        households_file = os.path.join(output_dir, "households.csv")
        households = []
        # Create about 350 households distributed across 10 clusters
        hh_id_counter = 1
        for cluster in self.clusters:
            # Assign mobility patterns
            if cluster in ["C-01", "C-06"]:
                patterns = ["Settled"]
                num_hh = 60
            elif cluster in ["C-02", "C-07"]:
                patterns = ["Seasonal-Worker", "Displaced"]
                num_hh = 45
            elif cluster in ["C-03", "C-08", "C-04"]:
                patterns = ["Nomadic", "Cross-Border"]
                num_hh = 35
            elif cluster == "C-05":
                # C-05 is a small cluster under k-anonymity
                patterns = ["Nomadic"]
                num_hh = 3
            else:
                patterns = ["Settled", "Seasonal-Worker"]
                num_hh = 40

            for _ in range(num_hh):
                hh_id = f"H-{hh_id_counter:04d}"
                hh_id_counter += 1
                mobility = random.choice(patterns)
                size = random.randint(3, 8)
                households.append({
                    "household_id": hh_id,
                    "cluster_id": cluster,
                    "mobility_pattern": mobility,
                    "last_known_location": f"Loc_{cluster}_{random.randint(1,10)}",
                    "household_size": size
                })
        
        with open(households_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["household_id", "cluster_id", "mobility_pattern", "last_known_location", "household_size"])
            for hh in households:
                writer.writerow([hh["household_id"], hh["cluster_id"], hh["mobility_pattern"], hh["last_known_location"], hh["household_size"]])

        # 3. Generate Demographics (Ground Truth Children) & Service Events
        demographics = []
        service_events = []
        
        # Ground truth structures
        gt_children = []
        child_id_counter = 1
        event_id_counter = 1
        
        # We target ~1000 ground truth children total
        # Distribute them across households
        total_children_target = 1000
        households_pool = list(households)
        
        # Map clusters to closer facilities for realistic registrations
        def get_facility_for_cluster(cluster):
            # mapping cluster to nearest facility
            num = int(cluster.split("-")[1])
            if num == 5: return "F-05"
            if num in [1, 6]: return "F-01"
            if num in [2, 7]: return "F-02"
            if num in [3, 8]: return "F-03"
            return "F-04"

        # Generate Ground Truth children
        for i in range(total_children_target):
            # Select household
            hh = random.choice(households_pool)
            cluster = hh["cluster_id"]
            
            gender = random.choice(["M", "F"])
            first_name = random.choice(self.first_names_boy if gender == "M" else self.first_names_girl)
            last_name = random.choice(self.last_names)
            mother_first = random.choice(self.first_names_girl)
            
            # Age distribution: 0 to 3 years old
            days_ago = random.randint(30, 1095)
            dob = datetime.now() - timedelta(days=days_ago)
            dob_str = dob.strftime("%Y-%m-%d")
            
            phone = self.generate_phone()
            fac_id = get_facility_for_cluster(cluster)
            reg_date = (dob + timedelta(days=random.randint(1, 15))).strftime("%Y-%m-%d")
            
            gt_children.append({
                "true_id": f"GT-{child_id_counter:04d}",
                "first_name": first_name,
                "last_name": last_name,
                "mother_name": f"{mother_first} {last_name}",
                "dob": dob_str,
                "sex": gender,
                "phone": phone,
                "household_id": hh["household_id"],
                "cluster_id": cluster,
                "facility_id": fac_id,
                "reg_date": reg_date,
                "vaccines": [] # Ground truth vaccines
            })
            child_id_counter += 1

        # Assign ground truth vaccines based on realistic rates
        # BCG: 90%, DTP1: 85%, DTP2: 80%, DTP3: 75%, MCV1: 80%, MCV2: 60%
        vaccines_schedule = [
            ("BCG", 0.90, 1),
            ("DTP1", 0.85, 42), # 6 weeks
            ("DTP2", 0.80, 70), # 10 weeks
            ("DTP3", 0.75, 98), # 14 weeks
            ("MCV1", 0.80, 270), # 9 months
            ("MCV2", 0.60, 540) # 18 months
        ]

        for child in gt_children:
            dob_dt = datetime.strptime(child["dob"], "%Y-%m-%d")
            child_age_days = (datetime.now() - dob_dt).days
            
            for vac, rate, min_age_days in vaccines_schedule:
                if child_age_days >= min_age_days:
                    if random.random() < rate:
                        vac_date = dob_dt + timedelta(days=min_age_days + random.randint(0, 30))
                        # Don't vaccinate in future
                        if vac_date < datetime.now():
                            child["vaccines"].append({
                                "vaccine": vac,
                                "date": vac_date.strftime("%Y-%m-%d")
                            })

        # Now, project the Ground Truth children into the actual noisy database
        # We will inject duplication (15% overall) and fragmentation
        raw_demographics = []
        raw_service_events = []
        
        # Track duplicate mappings for verification metrics
        true_duplicates_log = [] # tuple of (noisy_id1, noisy_id2, status)
        
        child_noisy_id_counter = 1
        
        for child in gt_children:
            # Determine if this child is duplicated/fragmented
            is_duplicate = random.random() < 0.15
            
            # Primary registration record
            c1_id = f"C-ID-{child_noisy_id_counter:04d}"
            child_noisy_id_counter += 1
            
            raw_demographics.append({
                "child_id": c1_id,
                "first_name": child["first_name"],
                "last_name": child["last_name"],
                "mother_name": child["mother_name"],
                "dob": child["dob"],
                "sex": child["sex"],
                "phone": child["phone"],
                "household_id": child["household_id"],
                "cluster_id": child["cluster_id"],
                "facility_id": child["facility_id"],
                "reg_date": child["reg_date"]
            })
            
            if is_duplicate:
                # Secondary registration record (simulates movement/fragmentation)
                c2_id = f"C-ID-{child_noisy_id_counter:04d}"
                child_noisy_id_counter += 1
                
                # Corrupt demographics
                c2_first = self.corrupt_name(child["first_name"])
                c2_last = self.corrupt_name(child["last_name"])
                # sometimes mother's name spelling varies or is missing first name
                c2_mother = self.corrupt_name(child["mother_name"]) if random.random() < 0.8 else ""
                
                # DOB modification: add/subtract up to 15 days or make approximate
                dob_dt = datetime.strptime(child["dob"], "%Y-%m-%d")
                dob_offset = random.randint(-15, 15)
                c2_dob = (dob_dt + timedelta(days=dob_offset)).strftime("%Y-%m-%d")
                
                # Phone: 30% chance of being missing or same, or reassigned
                c2_phone = child["phone"]
                if random.random() < 0.3:
                    c2_phone = "" # missing
                elif random.random() < 0.15:
                    c2_phone = self.generate_phone() # reassigned
                
                # Registered at a different facility (movement)
                other_facilities = [f["id"] for f in self.facilities if f["id"] != child["facility_id"]]
                c2_fac = random.choice(other_facilities)
                c2_reg_date = (dob_dt + timedelta(days=random.randint(40, 90))).strftime("%Y-%m-%d")
                
                raw_demographics.append({
                    "child_id": c2_id,
                    "first_name": c2_first,
                    "last_name": c2_last,
                    "mother_name": c2_mother,
                    "dob": c2_dob,
                    "sex": child["sex"],
                    "phone": c2_phone,
                    "household_id": child["household_id"], # same household
                    "cluster_id": child["cluster_id"],
                    "facility_id": c2_fac,
                    "reg_date": c2_reg_date
                })
                
                true_duplicates_log.append((c1_id, c2_id))
                
                # Split vaccine events between primary and secondary registrations
                # e.g., BCG, DTP1, DTP2 on record 1, DTP3, MCV1 on record 2
                for idx, vac in enumerate(child["vaccines"]):
                    linked_id = c1_id if idx < len(child["vaccines"]) / 2 else c2_id
                    raw_service_events.append({
                        "event_id": f"E-ID-{event_id_counter:05d}",
                        "child_id": linked_id,
                        "child_name": "", # Simulate that most have child_id
                        "vaccine": vac["vaccine"],
                        "date_administered": vac["date"],
                        "facility_id": child["facility_id"] if linked_id == c1_id else c2_fac
                    })
                    event_id_counter += 1
            else:
                # Write vaccines to primary registration
                for vac in child["vaccines"]:
                    # 5% chance of missing child_id in service log (requires fuzzy demographic matching)
                    missing_id = random.random() < 0.05
                    linked_id = "" if missing_id else c1_id
                    linked_name = f"{child['first_name']} {child['last_name']}" if missing_id else ""
                    
                    raw_service_events.append({
                        "event_id": f"E-ID-{event_id_counter:05d}",
                        "child_id": linked_id,
                        "child_name": linked_name,
                        "vaccine": vac["vaccine"],
                        "date_administered": vac["date"],
                        "facility_id": child["facility_id"]
                    })
                    event_id_counter += 1

        # 4. Sibling / Twin Injection (to test false positive matching)
        # Create 20 sibling cases: two children in same household, close DOB, similar phone, same last name, but distinct.
        for sib_idx in range(20):
            hh = random.choice(households)
            c1_id = f"C-ID-{child_noisy_id_counter:04d}"
            child_noisy_id_counter += 1
            c2_id = f"C-ID-{child_noisy_id_counter:04d}"
            child_noisy_id_counter += 1
            
            last_name = random.choice(self.last_names)
            mother_name = f"{random.choice(self.first_names_girl)} {last_name}"
            phone = self.generate_phone()
            
            # Sibling 1
            dob1 = datetime.now() - timedelta(days=random.randint(400, 800))
            raw_demographics.append({
                "child_id": c1_id,
                "first_name": random.choice(self.first_names_boy),
                "last_name": last_name,
                "mother_name": mother_name,
                "dob": dob1.strftime("%Y-%m-%d"),
                "sex": "M",
                "phone": phone,
                "household_id": hh["household_id"],
                "cluster_id": hh["cluster_id"],
                "facility_id": get_facility_for_cluster(hh["cluster_id"]),
                "reg_date": (dob1 + timedelta(days=10)).strftime("%Y-%m-%d")
            })
            
            # Sibling 2 (different name, different gender, slightly different birthdate or twin)
            # Twin: same birthdate, different first name/gender
            is_twin = random.random() < 0.5
            dob2 = dob1 if is_twin else (dob1 + timedelta(days=360))
            
            raw_demographics.append({
                "child_id": c2_id,
                "first_name": random.choice(self.first_names_girl),
                "last_name": last_name,
                "mother_name": mother_name,
                "dob": dob2.strftime("%Y-%m-%d"),
                "sex": "F",
                "phone": phone,
                "household_id": hh["household_id"],
                "cluster_id": hh["cluster_id"],
                "facility_id": get_facility_for_cluster(hh["cluster_id"]),
                "reg_date": (dob2 + timedelta(days=10)).strftime("%Y-%m-%d")
            })
            
            # Add some service events for siblings
            raw_service_events.append({
                "event_id": f"E-ID-{event_id_counter:05d}",
                "child_id": c1_id,
                "child_name": "",
                "vaccine": "BCG",
                "date_administered": (dob1 + timedelta(days=5)).strftime("%Y-%m-%d"),
                "facility_id": get_facility_for_cluster(hh["cluster_id"])
            })
            event_id_counter += 1
            raw_service_events.append({
                "event_id": f"E-ID-{event_id_counter:05d}",
                "child_id": c2_id,
                "child_name": "",
                "vaccine": "BCG",
                "date_administered": (dob2 + timedelta(days=5)).strftime("%Y-%m-%d"),
                "facility_id": get_facility_for_cluster(hh["cluster_id"])
            })
            event_id_counter += 1

        # 5. Inject Failure Case: Ambiguous match (Common names, same cluster, missing DOB)
        # Create two children with identical names in the same cluster, but missing DOB (or exact same DOB) and missing phone.
        c_amb1_id = f"C-ID-{child_noisy_id_counter:04d}"
        child_noisy_id_counter += 1
        c_amb2_id = f"C-ID-{child_noisy_id_counter:04d}"
        child_noisy_id_counter += 1
        
        raw_demographics.append({
            "child_id": c_amb1_id,
            "first_name": "Ali",
            "last_name": "Kamara",
            "mother_name": "Amina Kamara",
            "dob": "2024-01-01",
            "sex": "M",
            "phone": "",
            "household_id": "H-AMB1",
            "cluster_id": "C-01",
            "facility_id": "F-01",
            "reg_date": "2024-01-10"
        })
        raw_demographics.append({
            "child_id": c_amb2_id,
            "first_name": "Ali",
            "last_name": "Kamara",
            "mother_name": "Amina Kamara",
            "dob": "2024-01-01",
            "sex": "M",
            "phone": "",
            "household_id": "H-AMB2",
            "cluster_id": "C-01",
            "facility_id": "F-01",
            "reg_date": "2024-01-12"
        })
        # Note: Do not log them as true duplicates in true_duplicates_log, they are distinct children!

        # 6. Apply Facility Outage: If facility_outage_id is provided, omit its records from the files
        # We write them to a separate file so we can simulate an outage in the primary file, while keeping them for "ground truth".
        all_demographics = raw_demographics
        all_service_events = raw_service_events
        
        synced_demographics = [d for d in raw_demographics if d["facility_id"] != facility_outage_id]
        synced_service_events = [s for s in raw_service_events if s["facility_id"] != facility_outage_id]
        
        # Write to demographics.csv
        demographics_file = os.path.join(output_dir, "demographics.csv")
        with open(demographics_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["child_id", "first_name", "last_name", "mother_name", "dob", "sex", "phone", "household_id", "cluster_id", "facility_id", "reg_date"])
            for d in synced_demographics:
                writer.writerow([d["child_id"], d["first_name"], d["last_name"], d["mother_name"], d["dob"], d["sex"], d["phone"], d["household_id"], d["cluster_id"], d["facility_id"], d["reg_date"]])

        # Write to service_events.csv
        service_file = os.path.join(output_dir, "service_events.csv")
        with open(service_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["event_id", "child_id", "child_name", "vaccine", "date_administered", "facility_id"])
            for s in synced_service_events:
                writer.writerow([s["event_id"], s["child_id"], s["child_name"], s["vaccine"], s["date_administered"], s["facility_id"]])

        # Write ALL records (including outage) to an offline backup file for comparison
        all_demographics_file = os.path.join(output_dir, "all_demographics_backup.csv")
        with open(all_demographics_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["child_id", "first_name", "last_name", "mother_name", "dob", "sex", "phone", "household_id", "cluster_id", "facility_id", "reg_date"])
            for d in all_demographics:
                writer.writerow([d["child_id"], d["first_name"], d["last_name"], d["mother_name"], d["dob"], d["sex"], d["phone"], d["household_id"], d["cluster_id"], d["facility_id"], d["reg_date"]])

        all_service_file = os.path.join(output_dir, "all_service_events_backup.csv")
        with open(all_service_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["event_id", "child_id", "child_name", "vaccine", "date_administered", "facility_id"])
            for s in all_service_events:
                writer.writerow([s["event_id"], s["child_id"], s["child_name"], s["vaccine"], s["date_administered"], s["facility_id"]])

        # Write ground truth children for verification metrics
        gt_file = os.path.join(output_dir, "ground_truth.csv")
        with open(gt_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["true_id", "first_name", "last_name", "mother_name", "dob", "sex", "phone", "household_id", "cluster_id", "facility_id", "vaccines"])
            for gt in gt_children:
                vacs_str = "|".join([f"{v['vaccine']}:{v['date']}" for v in gt["vaccines"]])
                writer.writerow([gt["true_id"], gt["first_name"], gt["last_name"], gt["mother_name"], gt["dob"], gt["sex"], gt["phone"], gt["household_id"], gt["cluster_id"], gt["facility_id"], vacs_str])

        # Write duplicates mapping log
        dup_log_file = os.path.join(output_dir, "true_duplicates_log.csv")
        with open(dup_log_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["child_id1", "child_id2"])
            for c1, c2 in true_duplicates_log:
                writer.writerow([c1, c2])

        print(f"Synthetic data generation complete. Saved in {output_dir}")
        print(f"Generated {len(all_demographics)} records ({len(synced_demographics)} synced, {len(all_demographics)-len(synced_demographics)} offline in {facility_outage_id}).")
        print(f"Generated {len(all_service_events)} events ({len(synced_service_events)} synced).")

if __name__ == "__main__":
    dg = DataGenerator()
    dg.generate_all()
