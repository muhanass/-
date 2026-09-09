# نظام إدارة مخزون المطبخ | Kitchen Inventory Management System

نظام لإدارة مخزون المطاعم والمقاهي التي تُصنّع منتجاتها بنفسها (عن طريق الشيف)، مع دعم كامل للغتين العربية والإنجليزية.

A bilingual (Arabic/English) inventory management system for food & beverage shops that manufacture their own products in-house (chef-made items).

---

## بالعربي

### ما الذي يقدمه البرنامج؟

- **المواد الخام**: تسجيل كل مادة خام (طحين، حليب، قهوة...) مع الكمية المتوفرة والحد الأدنى المسموح.
- **المنتجات والوصفات**: لكل منتج (كرواسون، كيكة، لاتيه...) تحدد "وصفة" — أي كمية من كل مادة خام يحتاجها الشيف لتصنيع وحدة واحدة.
- **التصنيع**: عندما يصنّع الشيف كمية من منتج معين، يقوم النظام تلقائياً بخصم المواد الخام المستخدمة وإضافة الكمية المصنّعة إلى مخزون المنتج، مع معاينة قبل التأكيد للتأكد من توفر المواد.
- **البيع / الاستخدام**: تسجيل بيع أو استخدام المنتجات النهائية.
- **الهدر**: تسجيل أي تلف أو هدر في المواد الخام أو المنتجات.
- **حركة المخزون**: سجل كامل بكل عملية (شراء، تصنيع، بيع، هدر، تعديل) مع التاريخ والمستخدم.
- **تنبيهات النقص**: لوحة تحكم تُظهر أي مادة أو منتج وصل إلى الحد الأدنى.
- **صلاحيات المستخدمين**: مدير (كل الصلاحيات)، شيف (تصنيع وإدارة المخزون)، موظف (بيع واستلام وتسجيل هدر فقط).
- **لغتان**: يمكن لأي موظف التبديل بين العربية والإنجليزية بضغطة زر، والواجهة تتغير اتجاهها تلقائياً (RTL/LTR).

### طريقة التشغيل (خطوة بخطوة)

يتكون البرنامج من جزئين: **الخادم (server)** الذي يخزن البيانات، و**الواجهة (client)** التي يستخدمها الموظفون.

1. افتح الطرفية (Terminal) داخل مجلد المشروع.
2. لتشغيل الخادم:
   ```
   cd server
   npm install
   npm start
   ```
   سيعمل الخادم على العنوان: `http://localhost:4000`

3. افتح نافذة طرفية جديدة، ولتشغيل الواجهة:
   ```
   cd client
   npm install
   npm run dev
   ```
   سيعطيك رابطاً مثل: `http://localhost:5173` — افتحه في المتصفح.

4. سجّل الدخول بأحد الحسابات التجريبية الظاهرة في صفحة الدخول:
   - مدير: `admin@shop.com` / `admin123`
   - شيف: `chef@shop.com` / `chef123`
   - موظف: `staff@shop.com` / `staff123`

**مهم**: عند أول تشغيل، يقوم النظام تلقائياً بإنشاء قاعدة بيانات تجريبية (مواد خام ومنتجات ووصفات جاهزة) لتجربة النظام مباشرة. يمكنك لاحقاً حذف هذه البيانات وإدخال بياناتك الحقيقية من نفس الواجهة.

---

## English

### Features

- **Ingredients**: track every raw material (flour, milk, coffee...) with current stock and a minimum threshold.
- **Products & Recipes**: each finished product (croissant, cake, latte...) has a recipe defining exactly how much of each ingredient the chef needs to make one unit.
- **Production**: when the chef produces a batch, the system automatically deducts the ingredients used and adds the produced quantity to the product's stock — with a live preview to confirm enough stock is available before committing.
- **Sales / Usage**: record when a finished product is sold or used.
- **Waste tracking**: log spoilage/waste for ingredients or products.
- **Stock movement log**: a full audit trail of every purchase, production, sale, waste, and manual adjustment, with date and user.
- **Low-stock alerts**: a dashboard highlighting anything at or below its minimum threshold.
- **Role-based access**: Admin (full control), Chef (production + inventory management), Staff (sell/receive/waste only).
- **Two languages**: any employee can switch between Arabic and English with one click; the layout automatically mirrors (RTL/LTR).

### Running it (step by step)

The app has two parts: the **server** (stores the data) and the **client** (the interface employees use).

1. Open a terminal in the project folder.
2. Start the server:
   ```
   cd server
   npm install
   npm start
   ```
   It runs at `http://localhost:4000`.

3. Open a second terminal and start the client:
   ```
   cd client
   npm install
   npm run dev
   ```
   It will print a URL like `http://localhost:5173` — open that in your browser.

4. Sign in with one of the demo accounts shown on the login page:
   - Admin: `admin@shop.com` / `admin123`
   - Chef: `chef@shop.com` / `chef123`
   - Staff: `staff@shop.com` / `staff123`

**Note**: on first run, the server automatically seeds a demo database (sample ingredients, products, and recipes) so you can try the system immediately. You can later remove the demo data and enter your real inventory from the same interface.

### Tech stack

- **Backend**: Node.js, Express, SQLite (better-sqlite3), JWT authentication.
- **Frontend**: React (Vite), react-i18next for translations, react-router-dom.
