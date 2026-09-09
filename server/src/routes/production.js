import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT pr.*, p.name_ar AS product_name_ar, p.name_en AS product_name_en, p.unit AS product_unit,
              u.name AS user_name
       FROM production_runs pr
       JOIN products p ON p.id = pr.product_id
       LEFT JOIN users u ON u.id = pr.user_id
       ORDER BY pr.id DESC
       LIMIT 200`
    )
    .all();
  res.json(rows);
});

// Preview how much of each ingredient a production run would consume,
// and whether stock is sufficient (used by the UI before confirming).
router.get('/:productId/preview', (req, res) => {
  const { quantity } = req.query;
  const qty = Number(quantity) || 0;
  const recipe = db
    .prepare(
      `SELECT ri.ingredient_id, ri.quantity AS per_unit, i.name_ar, i.name_en, i.unit, i.stock_qty
       FROM recipe_items ri
       JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE ri.product_id = ?`
    )
    .all(req.params.productId);
  const lines = recipe.map((r) => ({
    ingredient_id: r.ingredient_id,
    name_ar: r.name_ar,
    name_en: r.name_en,
    unit: r.unit,
    required: r.per_unit * qty,
    available: r.stock_qty,
    sufficient: r.stock_qty >= r.per_unit * qty,
  }));
  res.json({ lines, canProduce: lines.length > 0 && lines.every((l) => l.sufficient) });
});

// Chef produces N units of a product: deducts each recipe ingredient,
// adds finished-good stock, all inside one atomic transaction.
router.post('/', requireRole('admin', 'chef'), (req, res) => {
  const { product_id, quantity, note } = req.body || {};
  const qty = Number(quantity);
  if (!product_id || !qty || qty <= 0) {
    return res.status(400).json({ error: 'product_id and a positive quantity are required' });
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const recipe = db.prepare('SELECT * FROM recipe_items WHERE product_id = ?').all(product_id);
  if (recipe.length === 0) {
    return res.status(400).json({ error: 'This product has no recipe defined yet' });
  }

  const shortages = [];
  for (const item of recipe) {
    const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(item.ingredient_id);
    const required = item.quantity * qty;
    if (ingredient.stock_qty < required) {
      shortages.push({
        ingredient_id: ingredient.id,
        name_ar: ingredient.name_ar,
        name_en: ingredient.name_en,
        required,
        available: ingredient.stock_qty,
      });
    }
  }
  if (shortages.length > 0) {
    return res.status(400).json({ error: 'Insufficient ingredient stock', shortages });
  }

  const tx = db.transaction(() => {
    for (const item of recipe) {
      const required = item.quantity * qty;
      db.prepare('UPDATE ingredients SET stock_qty = stock_qty - ? WHERE id = ?').run(
        required,
        item.ingredient_id
      );
      db.prepare(
        `INSERT INTO stock_movements (item_type, item_id, movement_type, quantity, note, user_id)
         VALUES ('ingredient', ?, 'production_out', ?, ?, ?)`
      ).run(item.ingredient_id, required, note || `Used to produce ${qty} x ${product.name_en}`, req.user.id);
    }
    db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?').run(qty, product_id);
    db.prepare(
      `INSERT INTO stock_movements (item_type, item_id, movement_type, quantity, note, user_id)
       VALUES ('product', ?, 'production_in', ?, ?, ?)`
    ).run(product_id, qty, note || null, req.user.id);
    const runInfo = db
      .prepare(
        'INSERT INTO production_runs (product_id, quantity, user_id, note) VALUES (?, ?, ?, ?)'
      )
      .run(product_id, qty, req.user.id, note || null);
    return runInfo.lastInsertRowid;
  });

  const runId = tx();
  res.status(201).json({
    run: db.prepare('SELECT * FROM production_runs WHERE id = ?').get(runId),
    product: db.prepare('SELECT * FROM products WHERE id = ?').get(product_id),
  });
});

export default router;
