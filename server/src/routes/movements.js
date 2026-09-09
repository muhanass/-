import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { itemType, movementType, from, to, limit } = req.query;
  const clauses = [];
  const params = [];
  if (itemType) {
    clauses.push('sm.item_type = ?');
    params.push(itemType);
  }
  if (movementType) {
    clauses.push('sm.movement_type = ?');
    params.push(movementType);
  }
  if (from) {
    clauses.push('sm.created_at >= ?');
    params.push(from);
  }
  if (to) {
    clauses.push('sm.created_at <= ?');
    params.push(to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT sm.*, u.name AS user_name,
        CASE WHEN sm.item_type = 'ingredient' THEN i.name_ar ELSE p.name_ar END AS item_name_ar,
        CASE WHEN sm.item_type = 'ingredient' THEN i.name_en ELSE p.name_en END AS item_name_en,
        CASE WHEN sm.item_type = 'ingredient' THEN i.unit ELSE p.unit END AS item_unit
       FROM stock_movements sm
       LEFT JOIN users u ON u.id = sm.user_id
       LEFT JOIN ingredients i ON sm.item_type = 'ingredient' AND i.id = sm.item_id
       LEFT JOIN products p ON sm.item_type = 'product' AND p.id = sm.item_id
       ${where}
       ORDER BY sm.id DESC
       LIMIT ?`
    )
    .all(...params, Number(limit) || 300);
  res.json(rows);
});

export default router;
