import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const insertUser = db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    );
    insertUser.run('Admin', 'admin@shop.com', bcrypt.hashSync('admin123', 8), 'admin');
    insertUser.run('Chef Ahmad', 'chef@shop.com', bcrypt.hashSync('chef123', 8), 'chef');
    insertUser.run('Staff Member', 'staff@shop.com', bcrypt.hashSync('staff123', 8), 'staff');
  }

  const catCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  if (catCount === 0) {
    const insertCat = db.prepare(
      'INSERT INTO categories (name_ar, name_en, type) VALUES (?, ?, ?)'
    );
    const catIds = {};
    catIds.dairy = insertCat.run('ألبان', 'Dairy', 'ingredient').lastInsertRowid;
    catIds.produce = insertCat.run('خضار وفواكه', 'Produce', 'ingredient').lastInsertRowid;
    catIds.dryGoods = insertCat.run('مواد جافة', 'Dry Goods', 'ingredient').lastInsertRowid;
    catIds.beverages = insertCat.run('مشروبات', 'Beverages', 'ingredient').lastInsertRowid;
    catIds.pastries = insertCat.run('معجنات', 'Pastries', 'product').lastInsertRowid;
    catIds.drinks = insertCat.run('مشروبات جاهزة', 'Drinks', 'product').lastInsertRowid;

    const insertIng = db.prepare(`INSERT INTO ingredients
      (name_ar, name_en, unit, category_id, stock_qty, min_qty, cost_per_unit)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const ing = {};
    ing.flour = insertIng.run('طحين', 'Flour', 'kg', catIds.dryGoods, 50, 10, 3.5).lastInsertRowid;
    ing.sugar = insertIng.run('سكر', 'Sugar', 'kg', catIds.dryGoods, 30, 8, 4).lastInsertRowid;
    ing.milk = insertIng.run('حليب', 'Milk', 'l', catIds.dairy, 20, 10, 6).lastInsertRowid;
    ing.butter = insertIng.run('زبدة', 'Butter', 'kg', catIds.dairy, 8, 5, 22).lastInsertRowid;
    ing.eggs = insertIng.run('بيض', 'Eggs', 'pcs', catIds.dairy, 120, 30, 0.6).lastInsertRowid;
    ing.coffee = insertIng.run('قهوة', 'Coffee Beans', 'kg', catIds.beverages, 10, 3, 45).lastInsertRowid;
    ing.chocolate = insertIng.run('شوكولاتة', 'Chocolate', 'kg', catIds.dryGoods, 6, 2, 30).lastInsertRowid;

    const insertProd = db.prepare(`INSERT INTO products
      (name_ar, name_en, unit, category_id, stock_qty, min_qty, selling_price)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const prod = {};
    prod.croissant = insertProd.run('كرواسون', 'Croissant', 'pcs', catIds.pastries, 0, 10, 6).lastInsertRowid;
    prod.cake = insertProd.run('كيكة شوكولاتة', 'Chocolate Cake', 'pcs', catIds.pastries, 0, 3, 45).lastInsertRowid;
    prod.latte = insertProd.run('لاتيه', 'Latte', 'cup', catIds.drinks, 0, 5, 14).lastInsertRowid;

    const insertRecipe = db.prepare(`INSERT INTO recipe_items
      (product_id, ingredient_id, quantity) VALUES (?, ?, ?)`);
    // Croissant: per 1 pc
    insertRecipe.run(prod.croissant, ing.flour, 0.08);
    insertRecipe.run(prod.croissant, ing.butter, 0.03);
    insertRecipe.run(prod.croissant, ing.eggs, 0.5);
    // Chocolate cake: per 1 pc
    insertRecipe.run(prod.cake, ing.flour, 0.4);
    insertRecipe.run(prod.cake, ing.sugar, 0.3);
    insertRecipe.run(prod.cake, ing.eggs, 3);
    insertRecipe.run(prod.cake, ing.chocolate, 0.25);
    insertRecipe.run(prod.cake, ing.butter, 0.15);
    // Latte: per 1 cup
    insertRecipe.run(prod.latte, ing.coffee, 0.02);
    insertRecipe.run(prod.latte, ing.milk, 0.2);
  }
}

seed();

export default db;
