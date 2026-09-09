import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { type } = req.query;
  const rows = type
    ? db.prepare('SELECT * FROM categories WHERE type = ? ORDER BY id').all(type)
    : db.prepare('SELECT * FROM categories ORDER BY id').all();
  res.json(rows);
});

router.post('/', requireRole('admin'), (req, res) => {
  const { name_ar, name_en, type } = req.body || {};
  if (!name_ar || !name_en || !['ingredient', 'product'].includes(type)) {
    return res.status(400).json({ error: 'name_ar, name_en and a valid type are required' });
  }
  const info = db
    .prepare('INSERT INTO categories (name_ar, name_en, type) VALUES (?, ?, ?)')
    .run(name_ar, name_en, type);
  res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
