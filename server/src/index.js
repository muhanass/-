import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import categoryRoutes from './routes/categories.js';
import supplierRoutes from './routes/suppliers.js';
import ingredientRoutes from './routes/ingredients.js';
import productRoutes from './routes/products.js';
import productionRoutes from './routes/production.js';
import movementRoutes from './routes/movements.js';
import reportRoutes from './routes/reports.js';
import userRoutes from './routes/users.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/ingredients', ingredientRoutes);
app.use('/api/products', productRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/movements', movementRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Inventory API listening on port ${PORT}`);
});
