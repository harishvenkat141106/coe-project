/**
 * Coverage Verifier — calculates naive vs. reconciled immunization coverage
 * with k-anonymity suppression
 */

const TRACKED_VACCINES = ['BCG', 'DTP1', 'DTP2', 'DTP3', 'OPV0', 'OPV1', 'OPV2', 'OPV3', 'MCV1', 'MCV2', 'HepB1', 'HepB2'];

export function calculateCoverage(demographics, serviceEvents, parentMapping, facilities, offlineFacilities, kThreshold = 10) {
  const facilityMap = {};
  facilities.forEach((f) => { facilityMap[f.facility_id] = f; });

  // Group children by cluster
  const clusterChildren = {};
  demographics.forEach((d) => {
    const clusterId = d.cluster_id;
    if (!clusterChildren[clusterId]) clusterChildren[clusterId] = new Set();
    // Use canonical (parent) ID for reconciled counts
    const canonicalId = parentMapping[d.child_id] || d.child_id;
    clusterChildren[clusterId].add(canonicalId);
  });

  // Index service events by child_id
  const eventsByChild = {};
  serviceEvents.forEach((ev) => {
    if (!eventsByChild[ev.child_id]) eventsByChild[ev.child_id] = [];
    eventsByChild[ev.child_id].push(ev);
  });

  const results = {};

  Object.entries(clusterChildren).forEach(([clusterId, canonicalIds]) => {
    const totalEligible = canonicalIds.size;
    const suppressed = totalEligible < kThreshold;

    // Find facilities serving this cluster
    const clusterFacilities = facilities.filter((f) => f.cluster_id === clusterId);
    const hasOutage = clusterFacilities.some((f) => offlineFacilities.has(f.facility_id));

    const vaccines = {};
    TRACKED_VACCINES.forEach((vax) => {
      let count = 0;
      canonicalIds.forEach((canonId) => {
        // Find all children with this canonical parent
        const childIds = Object.keys(parentMapping).filter(
          (cid) => (parentMapping[cid] || cid) === canonId
        );
        if (childIds.length === 0) childIds.push(canonId);

        const hasVax = childIds.some((cid) =>
          (eventsByChild[cid] || []).some((ev) => ev.vaccine === vax)
        );
        if (hasVax) count++;
      });

      vaccines[vax] = {
        count: suppressed ? null : count,
        rate: suppressed ? null : totalEligible > 0 ? count / totalEligible : 0,
        suppressed,
      };
    });

    results[clusterId] = {
      cluster_id: clusterId,
      total_eligible: suppressed ? null : totalEligible,
      suppressed,
      has_outage: hasOutage,
      confidence: hasOutage ? 'LOW_CONFIDENCE' : suppressed ? 'SUPPRESSED' : 'HIGH_CONFIDENCE',
      vaccines,
    };
  });

  return results;
}

export function calculateNaiveCoverage(demographics, serviceEvents, facilities) {
  // Naive: no deduplication — count each record as a separate child
  const naiveMapping = {};
  demographics.forEach((d) => (naiveMapping[d.child_id] = d.child_id));
  return calculateCoverage(demographics, serviceEvents, naiveMapping, facilities, new Set(), 0);
}

export function computeMetrics(groundTruth, trueDuplicates, parentMapping, demographics, serviceEvents, facilities, offlineFacilities) {
  // Build GT pairs
  const gtPairs = new Set();
  trueDuplicates.forEach(({ child_id1, child_id2 }) => {
    const k = child_id1 < child_id2 ? `${child_id1}|${child_id2}` : `${child_id2}|${child_id1}`;
    gtPairs.add(k);
  });

  // Build actual matched pairs from parentMapping
  const parentGroups = {};
  Object.entries(parentMapping).forEach(([cid, pid]) => {
    if (!parentGroups[pid]) parentGroups[pid] = [];
    parentGroups[pid].push(cid);
  });

  const actualPairs = new Set();
  Object.values(parentGroups).forEach((group) => {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [c1, c2] = [group[i], group[j]];
        actualPairs.add(c1 < c2 ? `${c1}|${c2}` : `${c2}|${c1}`);
      }
    }
  });

  const tp = [...gtPairs].filter((p) => actualPairs.has(p)).length;
  const fp = actualPairs.size - tp;
  const fn = gtPairs.size - tp;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 1.0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1.0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // Coverage comparison
  const naiveStats = calculateNaiveCoverage(demographics, serviceEvents, facilities);
  const reconciledStats = calculateCoverage(demographics, serviceEvents, parentMapping, facilities, offlineFacilities, 0);

  const sumRate = (stats, vax) => {
    let total = 0, count = 0;
    Object.values(stats).forEach((c) => {
      const v = c.vaccines?.[vax];
      if (v?.rate != null) { total += v.rate; count++; }
    });
    return count > 0 ? total / count : 0;
  };

  const gtVaxMap = {};
  groundTruth.forEach((g) => {
    (g.vaccines || '').split('|').forEach((v) => {
      gtVaxMap[v] = (gtVaxMap[v] || 0) + 1;
    });
  });
  const gtTotal = groundTruth.length;
  const gtDtp3Rate = (gtVaxMap['DTP3'] || 0) / (gtTotal || 1);
  const gtMcv1Rate = (gtVaxMap['MCV1'] || 0) / (gtTotal || 1);

  return {
    dedup_metrics: { true_positives: tp, false_positives: fp, false_negatives: fn, precision, recall, f1_score: f1 },
    coverage_metrics: {
      dtp3: {
        ground_truth_rate: gtDtp3Rate,
        naive_rate: sumRate(naiveStats, 'DTP3'),
        reconciled_rate: sumRate(reconciledStats, 'DTP3'),
      },
      mcv1: {
        ground_truth_rate: gtMcv1Rate,
        naive_rate: sumRate(naiveStats, 'MCV1'),
        reconciled_rate: sumRate(reconciledStats, 'MCV1'),
      },
    },
  };
}
