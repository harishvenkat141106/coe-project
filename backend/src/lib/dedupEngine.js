/**
 * ShieldHealth Deduplication Engine (Node.js port of Python logic)
 * Fellegi-Sunter Probabilistic Record Linkage
 */

// ── Jaro-Winkler Similarity ──────────────────────────────────────────────────
function jaroWinklerSimilarity(s1, s2) {
  if (!s1 || !s2) return 0.0;
  s1 = s1.trim().toLowerCase();
  s2 = s2.trim().toLowerCase();
  if (s1 === s2) return 1.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);

  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(len2, i + matchDist + 1);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] === s2[j]) {
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0.0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  transpositions = Math.floor(transpositions / 2);

  const jaro =
    (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3.0;

  let prefixLen = 0;
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (s1[i] === s2[i]) prefixLen++;
    else break;
  }

  return jaro + prefixLen * 0.1 * (1.0 - jaro);
}

// ── Soundex ──────────────────────────────────────────────────────────────────
function soundex(name) {
  if (!name) return '0000';
  name = name.toUpperCase();
  const firstChar = name[0];
  const mappings = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6',
  };
  let digits = '';
  for (let i = 1; i < name.length; i++) {
    const c = name[i];
    if (mappings[c] && mappings[c] !== (digits.slice(-1) || mappings[firstChar] || '')) {
      digits += mappings[c];
    }
  }
  return (firstChar + digits + '000').slice(0, 4);
}

// ── DOB Temporal Similarity ───────────────────────────────────────────────────
function dobTemporalSimilarity(dob1, dob2) {
  if (!dob1 || !dob2) return 0.0;
  try {
    const d1 = new Date(dob1);
    const d2 = new Date(dob2);
    const diffDays = Math.abs((d1 - d2) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 1.0;
    if (diffDays <= 7) return 0.9;
    if (diffDays <= 30) return 0.7;
    if (diffDays <= 90) return 0.4;
    return Math.max(0, 1.0 - diffDays / 365.0);
  } catch {
    return 0.0;
  }
}

// ── Pair Scoring ──────────────────────────────────────────────────────────────
function scorePair(r1, r2) {
  const fnSim = jaroWinklerSimilarity(r1.first_name, r2.first_name);
  const lnSim = jaroWinklerSimilarity(r1.last_name, r2.last_name);
  const motherSim = jaroWinklerSimilarity(r1.mother_name, r2.mother_name);
  const dobSim = dobTemporalSimilarity(r1.dob, r2.dob);
  const phoneSim = r1.phone && r1.phone === r2.phone ? 1.0 : 0.0;
  const householdSim = r1.household_id && r1.household_id === r2.household_id ? 1.0 : 0.0;
  const soundexMatch = soundex(r1.first_name) === soundex(r2.first_name) ? 1.0 : 0.0;

  // Gender blocker
  const sexSim =
    r1.sex && r2.sex && r1.sex !== r2.sex ? -1.0 : (r1.sex === r2.sex ? 1.0 : 0.0);

  // Weighted Fellegi-Sunter composite
  const weights = {
    first_name: 0.25, last_name: 0.20, mother_name: 0.15,
    dob: 0.20, phone: 0.10, household: 0.05, soundex: 0.05,
  };
  const score =
    fnSim * weights.first_name +
    lnSim * weights.last_name +
    motherSim * weights.mother_name +
    dobSim * weights.dob +
    phoneSim * weights.phone +
    householdSim * weights.household +
    soundexMatch * weights.soundex;

  // Hard penalise mismatched sex (treat as blocker)
  const finalScore = sexSim === -1.0 ? score * 0.3 : score;

  return {
    score: Math.min(1.0, finalScore),
    similarities: {
      first_name: fnSim, last_name: lnSim, mother_name: motherSim,
      dob: dobSim, phone: phoneSim, household: householdSim,
      soundex: soundexMatch, sex: sexSim,
    },
  };
}

// ── Main Deduplication Engine ─────────────────────────────────────────────────
export function deduplicateRecords(
  demographics,
  autoThreshold = 0.85,
  reviewThreshold = 0.50
) {
  const parentMapping = {};
  const reviewQueue = [];

  // Initialise: each record is its own parent
  demographics.forEach((d) => (parentMapping[d.child_id] = d.child_id));

  const find = (id) => {
    while (parentMapping[id] !== id) id = parentMapping[id];
    return id;
  };
  const union = (a, b) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parentMapping[pb] = pa;
  };

  // O(n²) comparison — acceptable for demo scale
  for (let i = 0; i < demographics.length; i++) {
    for (let j = i + 1; j < demographics.length; j++) {
      const r1 = demographics[i];
      const r2 = demographics[j];

      // Bloom filter: skip obviously different clusters to speed up
      if (r1.cluster_id !== r2.cluster_id && r1.household_id !== r2.household_id) {
        const fnFirst = r1.first_name?.[0]?.toLowerCase();
        const fnSecond = r2.first_name?.[0]?.toLowerCase();
        if (fnFirst && fnSecond && fnFirst !== fnSecond) continue;
      }

      const { score, similarities } = scorePair(r1, r2);

      if (score >= autoThreshold) {
        union(r1.child_id, r2.child_id);
      } else if (score >= reviewThreshold) {
        const id1 = r1.child_id < r2.child_id ? r1.child_id : r2.child_id;
        const id2 = r1.child_id < r2.child_id ? r2.child_id : r1.child_id;
        reviewQueue.push({
          record_1: r1,
          record_2: r2,
          score,
          similarities,
          status: 'PENDING',
          pair_key: `${id1}|${id2}`,
        });
      }
    }
  }

  return { parentMapping, reviewQueue };
}

// ── Confidence Grade ─────────────────────────────────────────────────────────
export function getConfidenceGrade(score) {
  if (score >= 0.85) return 'HIGH CONFIDENCE (Auto-Merge Eligible)';
  if (score >= 0.70) return 'MODERATE CONFIDENCE (Strong Match Candidate)';
  if (score >= 0.50) return 'LOW-MODERATE CONFIDENCE (Ambiguous Match - Review Needed)';
  return 'VERY LOW CONFIDENCE (Likely Distinct Children)';
}

// ── Heuristic AI Explanation ──────────────────────────────────────────────────
export function generateHeuristicExplanation(r1, r2, score, sims) {
  const factors = [];
  const fnSim = sims.first_name || 0;
  const lnSim = sims.last_name || 0;

  if (fnSim >= 0.85 && lnSim >= 0.85)
    factors.push('Very high name similarity (likely phonetic misspelling or minor alias)');
  else if (fnSim >= 0.80)
    factors.push('Matching first name with variation in surname spelling');
  else if (fnSim < 0.60)
    factors.push('Mismatching first names (check for twin/sibling relationship)');

  const dobScore = sims.dob || 0;
  if (dobScore === 1.0) factors.push('Exact match on Date of Birth');
  else if (dobScore > 0.7) factors.push('Close Date of Birth (birth dates within a few weeks)');
  else factors.push('Significant birth date offset (>30 days)');

  if (sims.phone === 1.0) factors.push('Matching guardian contact phone number');
  if (sims.household === 1.0) factors.push('Registered in the same household unit');
  if (sims.sex === -1.0)
    factors.push('⚠️ Differing genders recorded (High probability of separate sibling records)');

  const reco =
    score >= 0.70
      ? 'Merge recommended if immunization cards match.'
      : 'Verify physical health record before merging.';

  return `AI Analysis (${(score * 100).toFixed(1)}% Match): ${factors.join('; ')}. ${reco}`;
}
