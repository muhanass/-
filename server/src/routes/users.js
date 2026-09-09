import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  res.json(
    db.prepare('SELECT id, name, email, role, active, created_at FROM users ORDER BY id').all()
  );
});

router.post('/', (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password || !['admin', 'chef', 'staff'].includes(role)) {
    return res.status(400).json({ error: 'name, email, password and a valid role are required' });
  }
  try {
    const info = db
      .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(name, email, bcrypt.hashSync(password, 8), role);
    res.status(201).json(
      db.prepare('SELECT id, name, email, role, active FROM users WHERE id = ?').get(info.lastInsertRowid)
    );
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { name, role, active, password } = req.body || {};
  db.prepare('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?').run(
    name ?? existing.name,
    role ?? existing.role,
    active === undefined ? existing.active : active ? 1 : 0,
    req.params.id
  );
  if (password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 8), req.params.id);
  }
  res.json(db.prepare('SELECT id, name, email, role, active FROM users WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
