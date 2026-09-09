import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Used by the barcode-scan input in the UI: given a scanned code, find the
// matching ingredient or product (barcode is optional so most rows have none).
router.get('/barcode/:code', (req, res) => {
  const code = req.params.code;
  const ingredient = db
    .prepare('SELECT * FROM ingredients WHERE barcode = ? AND active = 1')
    .get(code);
  if (ingredient) return res.json({ type: 'ingredient', item: ingredient });

  const product = db.prepare('SELECT * FROM products WHERE barcode = ? AND active = 1').get(code);
  if (product) return res.json({ type: 'product', item: product });

  res.status(404).json({ error: 'No item found with this barcode' });
});

export default router;
