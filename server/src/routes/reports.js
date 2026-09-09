import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/summary', (req, res) => {
  const ingredients = db.prepare('SELECT * FROM ingredients WHERE active = 1').all();
  const products = db.prepare('SELECT * FROM products WHERE active = 1').all();

  const lowStockIngredients = ingredients.filter((i) => i.stock_qty <= i.min_qty);
  const lowStockProducts = products.filter((p) => p.stock_qty <= p.min_qty);

  const ingredientValue = ingredients.reduce((sum, i) => sum + i.stock_qty * i.cost_per_unit, 0);
  const productValue = products.reduce((sum, p) => sum + p.stock_qty * p.selling_price, 0);

  const todayMovements = db
    .prepare(
      `SELECT movement_type, item_type, COUNT(*) AS count, SUM(quantity) AS total
       FROM stock_movements
       WHERE date(created_at) = date('now')
       GROUP BY movement_type, item_type`
    )
    .all();

  const topProducedThisWeek = db
    .prepare(
      `SELECT p.name_ar, p.name_en, SUM(pr.quantity) AS total
       FROM production_runs pr
       JOIN products p ON p.id = pr.product_id
       WHERE pr.created_at >= datetime('now', '-7 days')
       GROUP BY pr.product_id
       ORDER BY total DESC
       LIMIT 5`
    )
    .all();

  res.json({
    counts: {
      ingredients: ingredients.length,
      products: products.length,
      lowStockIngredients: lowStockIngredients.length,
      lowStockProducts: lowStockProducts.length,
    },
    inventoryValue: {
      ingredients: ingredientValue,
      products: productValue,
      total: ingredientValue + productValue,
    },
    lowStockIngredients,
    lowStockProducts,
    todayMovements,
    topProducedThisWeek,
  });
});

export default router;
