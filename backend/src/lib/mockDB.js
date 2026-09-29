/**
 * In-memory mock database for local development (when Supabase is not configured)
 */
import { v4 as uuidv4 } from 'uuid';

// ── Synthetic Data Generator ──────────────────────────────────────────────────
const FIRST_NAMES = ['Aarav', 'Priya', 'Ravi', 'Meena', 'Arjun', 'Kavya', 'Vikram', 'Lakshmi',
  'Suresh', 'Ananya', 'Kiran', 'Divya', 'Rahul', 'Nisha', 'Ajay', 'Pooja',
  'Sanjay', 'Rekha', 'Deepak', 'Usha', 'Rajesh', 'Geetha', 'Mohan', 'Latha'];
const LAST_NAMES = ['Kumar', 'Sharma', 'Patel', 'Singh', 'Reddy', 'Nair', 'Iyer', 'Rao',
  'Joshi', 'Mishra', 'Pillai', 'Menon', 'Agarwal', 'Gupta', 'Shah', 'Verma'];
const VACCINES = ['BCG', 'OPV0', 'HepB1', 'DTP1', 'OPV1', 'HepB2', 'DTP2', 'OPV2', 'DTP3', 'OPV3', 'MCV1', 'MCV2'];
const CLUSTERS = ['C-01', 'C-02', 'C-03', 'C-04', 'C-05'];
const FACILITIES = [
  { facility_id: 'F-01', name: 'Primary Health Centre Alpha', cluster_id: 'C-01' },
  { facility_id: 'F-02', name: 'Community Clinic Beta', cluster_id: 'C-02' },
  { facility_id: 'F-03', name: 'Outreach Post Gamma', cluster_id: 'C-03' },
  { facility_id: 'F-04', name: 'Sub-Centre Delta', cluster_id: 'C-04' },
  { facility_id: 'F-05', name: 'Urban Health Post Epsilon', cluster_id: 'C-05' },
];

function randItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randDate(startYear = 2021, endYear = 2024) {
  const y = randInt(startYear, endYear);
  const m = String(randInt(1, 12)).padStart(2, '0');
  const d = String(randInt(1, 28)).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function fuzzName(name) {
  const variants = [
    (n) => n,                         // original
    (n) => n.replace(/a/gi, 'e'),     // vowel swap
    (n) => n.slice(0, -1),            // drop last char
    (n) => n + n.slice(-1),           // double last char
    (n) => n.split('').reverse().slice(2).reverse().join(''), // truncate
  ];
  return randItem(variants)(name);
}

export function generateSyntheticData(seed = 42, count = 80) {
  // Simple seeded random (xmur3)
  let s = seed;
  const rng = () => { s = (s ^ (s << 13)); s = (s ^ (s >> 17)); s = (s ^ (s << 5)); return ((s >>> 0) / 4294967295); };

  const demographics = [];
  const serviceEvents = [];
  const households = [];
  const groundTruth = [];
  const trueDuplicates = [];

  // Generate households
  for (let h = 0; h < 30; h++) {
    households.push({
      household_id: `HH-${String(h + 1).padStart(3, '0')}`,
      cluster_id: CLUSTERS[h % CLUSTERS.length],
      address: `Settlement ${h + 1}`,
      phone: `98${String(randInt(10000000, 99999999))}`,
    });
  }

  // Generate children
  for (let i = 0; i < count; i++) {
    const hh = households[i % households.length];
    const fn = FIRST_NAMES[i % FIRST_NAMES.length];
    const ln = LAST_NAMES[i % LAST_NAMES.length];
    const dob = randDate();
    const sex = i % 2 === 0 ? 'M' : 'F';
    const childId = `CH-${String(i + 1).padStart(4, '0')}`;

    demographics.push({
      child_id: childId,
      first_name: fn,
      last_name: ln,
      dob,
      sex,
      cluster_id: hh.cluster_id,
      household_id: hh.household_id,
      mother_name: `${FIRST_NAMES[(i + 3) % FIRST_NAMES.length]} ${ln}`,
      phone: hh.phone,
    });

    // Vaccines: assign 3-6 random vaccines per child
    const numVax = randInt(3, 7);
    const childVax = VACCINES.slice(0, numVax);
    childVax.forEach((vax, vi) => {
      serviceEvents.push({
        event_id: `EV-${String(i * 10 + vi + 1).padStart(5, '0')}`,
        child_id: childId,
        vaccine: vax,
        date_administered: randDate(2022, 2025),
        facility_id: FACILITIES[(i + vi) % FACILITIES.length].facility_id,
      });
    });

    groundTruth.push({ child_id: childId, vaccines: childVax.join('|') });
  }

  // Inject 12 synthetic duplicates (slightly fuzzed)
  const dupCount = 12;
  for (let d = 0; d < dupCount; d++) {
    const original = demographics[d * 6];
    const dupId = `CH-DUP-${String(d + 1).padStart(3, '0')}`;
    demographics.push({
      ...original,
      child_id: dupId,
      first_name: fuzzName(original.first_name),
      last_name: fuzzName(original.last_name),
    });
    trueDuplicates.push({ child_id1: original.child_id, child_id2: dupId });
  }

  return { demographics, serviceEvents, facilities: FACILITIES, households, groundTruth, trueDuplicates };
}

// ── In-Memory State (mock DB) ─────────────────────────────────────────────────
class MockDB {
  constructor() {
    this.reset();
  }

  reset() {
    const generated = generateSyntheticData();
    this.demographics = generated.demographics;
    this.serviceEvents = generated.serviceEvents;
    this.facilities = generated.facilities;
    this.households = generated.households;
    this.groundTruth = generated.groundTruth;
    this.trueDuplicates = generated.trueDuplicates;
    this.manualDecisions = {}; // key: "id1|id2", value: "MERGE"|"SPLIT"
    this.offlineFacilities = new Set(['F-03']);
    this.kThreshold = parseInt(process.env.DEFAULT_K_ANONYMITY_THRESHOLD || '10', 10);
    this.parentMapping = {};
    this.reviewQueue = [];
  }
}

export const mockDB = new MockDB();
