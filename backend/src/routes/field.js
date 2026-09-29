import { Router } from 'express';
import { mockDB } from '../lib/mockDB.js';

const router = Router();

// GET /api/field/verify?q=&role=
router.get('/verify', (req, res) => {
  const { q } = req.query;
  const userRole = req.headers['x-user-role'];

  if (userRole !== 'field_worker') {
    return res.status(403).json({
      error: 'Forbidden: Detailed PII query is restricted to authorized field workers (X-User-Role: field_worker).',
    });
  }

  if (!q) return res.status(400).json({ error: 'Query parameter q is required' });

  const query = q.toLowerCase().trim();
  const results = [];

  mockDB.demographics.forEach((d) => {
    const fullName = `${d.first_name} ${d.last_name}`.toLowerCase();
    if (query.length < 2) return;
    if (!fullName.includes(query) && !(d.phone || '').includes(query) && !(d.dob || '').includes(query)) return;

    const pid = mockDB.parentMapping[d.child_id] || d.child_id;
    const linked = Object.keys(mockDB.parentMapping).filter(
      (k) => mockDB.parentMapping[k] === pid && k !== d.child_id
    );

    // Gather immunizations
    const childIds = [d.child_id, ...linked];
    const events = mockDB.serviceEvents
      .filter((ev) => childIds.includes(ev.child_id))
      .map((ev) => ({
        event_id: ev.event_id,
        vaccine: ev.vaccine,
        date_administered: ev.date_administered,
        facility_id: ev.facility_id,
      }));

    // Deduplicate by vaccine (earliest date wins)
    const byVax = {};
    events.forEach((ev) => {
      if (!byVax[ev.vaccine] || ev.date_administered < byVax[ev.vaccine].date_administered) {
        byVax[ev.vaccine] = ev;
      }
    });

    results.push({
      demographics: d,
      unified_parent_id: pid,
      linked_duplicates: linked,
      immunizations: Object.values(byVax),
    });
  });

  res.json({ count: results.length, results: results.slice(0, 10) });
});

export default router;
