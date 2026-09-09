import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function attachRecipe(product) {
  const recipe = db
    .prepare(
      `SELECT ri.id, ri.ingredient_id, ri.quantity,
              i.name_ar AS ingredient_name_ar, i.name_en AS ingredient_name_en, i.unit AS ingredient_unit,
              i.stock_qty AS ingredient_stock_qty
       FROM recipe_items ri
       JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE ri.product_id = ?`
    )
    .all(product.id);
  return { ...product, recipe };
}

router.get('/', (req, res) => {
  const { lowStock } = req.query;
  let rows = db
    .prepare(
      `SELECT p.*, c.name_ar AS category_name_ar, c.name_en AS category_name_en
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.active = 1
       ORDER BY p.id DESC`
    )
    .all();
  if (lowStock === 'true') rows = rows.filter((r) => r.stock_qty <= r.min_qty);
  res.json(rows.map(attachRecipe));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(attachRecipe(row));
});

router.post('/', requireRole('admin', 'chef'), (req, res) => {
  const { name_ar, name_en, unit, category_id, min_qty, selling_price, barcode, recipe } = req.body || {};
  if (!name_ar || !name_en || !unit) {
    return res.status(400).json({ error: 'name_ar, name_en and unit are required' });
  }
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO products (name_ar, name_en, unit, category_id, min_qty, selling_price, barcode)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name_ar,
        name_en,
        unit,
        category_id || null,
        Number(min_qty) || 0,
        Number(selling_price) || 0,
        barcode ? String(barcode).trim() : null
      );
    const productId = info.lastInsertRowid;
    if (Array.isArray(recipe)) {
      const insertRecipe = db.prepare(
        'INSERT INTO recipe_items (product_id, ingredient_id, quantity) VALUES (?, ?, ?)'
      );
      for (const item of recipe) {
        if (item.ingredient_id && Number(item.quantity) > 0) {
          insertRecipe.run(productId, item.ingredient_id, Number(item.quantity));
        }
      }
    }
    return productId;
  });
  try {
    const productId = tx();
    res.status(201).json(attachRecipe(db.prepare('SELECT * FROM products WHERE id = ?').get(productId)));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'This barcode is already used by another item' });
    }
    throw e;
  }
});

router.put('/:id', requireRole('admin', 'chef'), (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { name_ar, name_en, unit, category_id, min_qty, selling_price, barcode, recipe } = req.body || {};

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE products SET name_ar = ?, name_en = ?, unit = ?, category_id = ?, min_qty = ?, selling_price = ?, barcode = ?
       WHERE id = ?`
    ).run(
      name_ar ?? existing.name_ar,
      name_en ?? existing.name_en,
      unit ?? existing.unit,
      category_id ?? existing.category_id,
      min_qty ?? existing.min_qty,
      selling_price ?? existing.selling_price,
      barcode === undefined ? existing.barcode : barcode ? String(barcode).trim() : null,
      req.params.id
    );
    if (Array.isArray(recipe)) {
      db.prepare('DELETE FROM recipe_items WHERE product_id = ?').run(req.params.id);
      const insertRecipe = db.prepare(
        'INSERT INTO recipe_items (product_id, ingredient_id, quantity) VALUES (?, ?, ?)'
      );
      for (const item of recipe) {
        if (item.ingredient_id && Number(item.quantity) > 0) {
          insertRecipe.run(req.params.id, item.ingredient_id, Number(item.quantity));
        }
      }
    }
  });
  try {
    tx();
    res.json(attachRecipe(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'This barcode is already used by another item' });
    }
    throw e;
  }
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// Sell / use product (deduct finished-good stock)
router.post('/:id/sale', requireRole('admin', 'chef', 'staff'), (req, res) => {
  const { quantity, note } = req.body || {};
  const qty = Number(quantity);
  if (!qty || qty <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  if (product.stock_qty < qty) return res.status(400).json({ error: 'Insufficient product stock' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?').run(qty, req.params.id);
    db.prepare(
      `INSERT INTO stock_movements (item_type, item_id, movement_type, quantity, note, user_id)
       VALUES ('product', ?, 'sale_out', ?, ?, ?)`
    ).run(req.params.id, qty, note || null, req.user.id);
  });
  tx();
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

router.post('/:id/waste', requireRole('admin', 'chef', 'staff'), (req, res) => {
  const { quantity, note } = req.body || {};
  const qty = Number(quantity);
  if (!qty || qty <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  if (product.stock_qty < qty) return res.status(400).json({ error: 'Insufficient product stock' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?').run(qty, req.params.id);
    db.prepare(
      `INSERT INTO stock_movements (item_type, item_id, movement_type, quantity, note, user_id)
       VALUES ('product', ?, 'waste', ?, ?, ?)`
    ).run(req.params.id, qty, note || null, req.user.id);
  });
  tx();
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

export default router;
