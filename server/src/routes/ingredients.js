import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { lowStock } = req.query;
  let rows = db
    .prepare(
      `SELECT i.*, c.name_ar AS category_name_ar, c.name_en AS category_name_en,
              s.name_ar AS supplier_name_ar, s.name_en AS supplier_name_en
       FROM ingredients i
       LEFT JOIN categories c ON c.id = i.category_id
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       WHERE i.active = 1
       ORDER BY i.id DESC`
    )
    .all();
  if (lowStock === 'true') rows = rows.filter((r) => r.stock_qty <= r.min_qty);
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', requireRole('admin', 'chef'), (req, res) => {
  const { name_ar, name_en, unit, category_id, supplier_id, stock_qty, min_qty, cost_per_unit, barcode } =
    req.body || {};
  if (!name_ar || !name_en || !unit) {
    return res.status(400).json({ error: 'name_ar, name_en and unit are required' });
  }
  try {
    const info = db
      .prepare(
        `INSERT INTO ingredients (name_ar, name_en, unit, category_id, supplier_id, stock_qty, min_qty, cost_per_unit, barcode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name_ar,
        name_en,
        unit,
        category_id || null,
        supplier_id || null,
        Number(stock_qty) || 0,
        Number(min_qty) || 0,
        Number(cost_per_unit) || 0,
        barcode ? String(barcode).trim() : null
      );
    res.status(201).json(db.prepare('SELECT * FROM ingredients WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'This barcode is already used by another item' });
    }
    throw e;
  }
});

router.put('/:id', requireRole('admin', 'chef'), (req, res) => {
  const existing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { name_ar, name_en, unit, category_id, supplier_id, min_qty, cost_per_unit, barcode } = req.body || {};
  try {
    db.prepare(
      `UPDATE ingredients SET name_ar = ?, name_en = ?, unit = ?, category_id = ?, supplier_id = ?,
       min_qty = ?, cost_per_unit = ?, barcode = ? WHERE id = ?`
    ).run(
      name_ar ?? existing.name_ar,
      name_en ?? existing.name_en,
      unit ?? existing.unit,
      category_id ?? existing.category_id,
      supplier_id ?? existing.supplier_id,
      min_qty ?? existing.min_qty,
      cost_per_unit ?? existing.cost_per_unit,
      barcode === undefined ? existing.barcode : barcode ? String(barcode).trim() : null,
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'This barcode is already used by another item' });
    }
    throw e;
  }
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('UPDATE ingredients SET active = 0 WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// Stock-in: receive a purchase from a supplier
router.post('/:id/purchase', requireRole('admin', 'chef', 'staff'), (req, res) => {
  const { quantity, note } = req.body || {};
  const qty = Number(quantity);
  if (!qty || qty <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });
  const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
  if (!ingredient) return res.status(404).json({ error: 'Not found' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE ingredients SET stock_qty = stock_qty + ? WHERE id = ?').run(qty, req.params.id);
    db.prepare(
      `INSERT INTO stock_movements (item_type, item_id, movement_type, quantity, note, user_id)
       VALUES ('ingredient', ?, 'purchase_in', ?, ?, ?)`
    ).run(req.params.id, qty, note || null, req.user.id);
  });
  tx();
  res.json(db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id));
});

// Waste / spoilage
router.post('/:id/waste', requireRole('admin', 'chef', 'staff'), (req, res) => {
  const { quantity, note } = req.body || {};
  const qty = Number(quantity);
  if (!qty || qty <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });
  const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
  if (!ingredient) return res.status(404).json({ error: 'Not found' });
  if (ingredient.stock_qty < qty) return res.status(400).json({ error: 'Insufficient stock' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE ingredients SET stock_qty = stock_qty - ? WHERE id = ?').run(qty, req.params.id);
    db.prepare(
      `INSERT INTO stock_movements (item_type, item_id, movement_type, quantity, note, user_id)
       VALUES ('ingredient', ?, 'waste', ?, ?, ?)`
    ).run(req.params.id, qty, note || null, req.user.id);
  });
  tx();
  res.json(db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id));
});

// Manual adjustment (correction), can be positive or negative
router.post('/:id/adjust', requireRole('admin', 'chef'), (req, res) => {
  const { quantity, note } = req.body || {};
  const qty = Number(quantity);
  if (!qty) return res.status(400).json({ error: 'quantity is required (can be negative)' });
  const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
  if (!ingredient) return res.status(404).json({ error: 'Not found' });
  if (ingredient.stock_qty + qty < 0) return res.status(400).json({ error: 'Resulting stock cannot be negative' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE ingredients SET stock_qty = stock_qty + ? WHERE id = ?').run(qty, req.params.id);
    db.prepare(
      `INSERT INTO stock_movements (item_type, item_id, movement_type, quantity, note, user_id)
       VALUES ('ingredient', ?, 'adjustment', ?, ?, ?)`
    ).run(req.params.id, qty, note || null, req.user.id);
  });
  tx();
  res.json(db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id));
});

export default router;
