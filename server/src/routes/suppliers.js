import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM suppliers ORDER BY id DESC').all());
});

router.post('/', requireRole('admin', 'chef'), (req, res) => {
  const { name_ar, name_en, phone, notes } = req.body || {};
  if (!name_ar || !name_en) {
    return res.status(400).json({ error: 'name_ar and name_en are required' });
  }
  const info = db
    .prepare('INSERT INTO suppliers (name_ar, name_en, phone, notes) VALUES (?, ?, ?, ?)')
    .run(name_ar, name_en, phone || null, notes || null);
  res.status(201).json(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', requireRole('admin', 'chef'), (req, res) => {
  const { name_ar, name_en, phone, notes } = req.body || {};
  const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE suppliers SET name_ar = ?, name_en = ?, phone = ?, notes = ? WHERE id = ?').run(
    name_ar ?? existing.name_ar,
    name_en ?? existing.name_en,
    phone ?? existing.phone,
    notes ?? existing.notes,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
