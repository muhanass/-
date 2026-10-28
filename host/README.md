# التشغيل على دومينك الخاص — Self-hosting on your own domain

<div dir="rtl">

## وش هذا؟

هذا السيرفر يشغّل **نفس** صفحة `web/kitchen-stock.html` اللي تستخدمها، لكن على
دومينك أنت. ما فيه نسخة ثانية من البرنامج تحتاج تتابعها — نفس الملف، يُقدَّم من
مكانين:

| | على claude.ai | على دومينك |
|---|---|---|
| الرابط | `claude.ai/artifact/...` | `yourshop.com` |
| يحتاج حساب Claude | نعم، لكل موظف | **لا** |
| مكان البيانات | قاعدة بيانات Claude | ملف على سيرفرك |
| فحص كلمة المرور | داخل المتصفح (تنظيمي) | **على السيرفر** (حقيقي) |
| الكاميرا والباركود | يعمل | يعمل (مع HTTPS) |

الفرق المهم: على سيرفرك **كلمة المرور تُفحص على السيرفر** بـ scrypt، والمتصفح
ما يستلم أبداً النسخة المحفوظة منها. يعني مين ما وصل للصفحة ما يقدر يهاجم كلمات
مرور موظفينك.

## التجربة على جهازك أول (خمس دقائق)

```bash
cd host
npm install
npm start
```

افتح `http://localhost:3000` → يطلب منك إنشاء حساب المدير. البيانات تنزل في
`host/data/kitchen-stock.db`.

## المتغيرات

| المتغير | الافتراضي | وش يسوي |
|---|---|---|
| `PORT` | `3000` | المنفذ |
| `DATA_DIR` | `host/data` | مجلد قاعدة البيانات |
| `SECURE_COOKIES` | مفعّل | خلّه `0` فقط للتجربة على `localhost` بدون HTTPS |
| `SESSION_DAYS` | `30` | كم يوم يبقى الموظف داخل قبل ما يُطلب منه الدخول مرة ثانية |
| `PAGE_FILE` | `../web/kitchen-stock.html` | مكان الصفحة |

> **مهم:** لا تخلّي `SECURE_COOKIES=0` على دومين حقيقي. على HTTPS خلّه مفعّل
> (يعني لا تضبطه أصلاً).

---

## الطريقة أ — سيرفر صغير تستأجره (الأرخص والأوضح في الفاتورة)

التكلفة تقريباً: **دومين ~١٥ دولار بالسنة + سيرفر ~٥ يورو بالشهر.** تحقق من
الأسعار الحالية بنفسك، فهي تتغير.

**١. اشترِ الدومين** من أي مزوّد (Namecheap، Cloudflare، GoDaddy، أو مزوّد محلي).

**٢. استأجر سيرفر** صغير بنظام Ubuntu — أرخص خطة تكفي تماماً لمحل واحد.
احفظ عنوان IP اللي يعطونك.

**٣. وجّه الدومين للسيرفر:** في إعدادات الدومين أضف سجل `A` يشير لعنوان IP.
انتظر من دقائق إلى ساعة.

**٤. ثبّت البرنامج** — ادخل على السيرفر (`ssh root@عنوان-IP`) ونفّذ:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git
git clone https://github.com/muhanass/-.git /opt/kitchen-stock
cd /opt/kitchen-stock/host && npm ci --omit=dev
```

**٥. شغّله كخدمة دائمة** حتى يرجع لحاله بعد أي إعادة تشغيل:

```bash
cat > /etc/systemd/system/kitchen-stock.service <<'UNIT'
[Unit]
Description=Kitchen Stock
After=network.target

[Service]
WorkingDirectory=/opt/kitchen-stock/host
ExecStart=/usr/bin/node server.js
Environment=PORT=3000
Environment=DATA_DIR=/var/lib/kitchen-stock
Restart=always
User=root

[Install]
WantedBy=multi-user.target
UNIT
mkdir -p /var/lib/kitchen-stock
systemctl enable --now kitchen-stock
systemctl status kitchen-stock --no-pager
```

**٦. HTTPS تلقائي** — Caddy يجيب الشهادة ويجدّدها وحده:

```bash
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

cat > /etc/caddy/Caddyfile <<'CADDY'
yourshop.com {
    reverse_proxy 127.0.0.1:3000
}
CADDY
systemctl reload caddy
```

بدّل `yourshop.com` بدومينك. الكاميرا وقراءة الباركود ما تعمل إلا على HTTPS،
وهذي الخطوة هي اللي توفره.

**٧. افتح دومينك** → الصفحة تطلب إنشاء حساب المدير. خلاص، البرنامج صار لك.

**٨. نسخة احتياطية كل ليلة** — هذا الملف هو كل سجلات محلك:

```bash
echo '0 2 * * * cd /opt/kitchen-stock/host && DATA_DIR=/var/lib/kitchen-stock /usr/bin/node backup.mjs >> /var/log/kitchen-backup.log 2>&1' | crontab -
```

النسخ تنزل في `/opt/kitchen-stock/host/backups/`. انقلها لمكان خارج السيرفر من
وقت لوقت — نسخة احتياطية على نفس السيرفر ما تنفع لو ضاع السيرفر نفسه.

---

## الطريقة ب — منصة جاهزة (بدون إدارة سيرفر)

في `Dockerfile` جاهز في جذر المستودع. على أي منصة تقبل Docker (Fly.io، Render،
Railway) الخطوات هي نفسها:

1. اربط المستودع بالمنصة، وخلّها تبني من `Dockerfile` في الجذر.
2. **اربط قرصاً دائماً على `/data`** — هذي أهم خطوة. بدونه تُمسح بياناتك مع كل
   تحديث، لأن المنصات تبدأ من صورة نظيفة كل مرة.
3. اضبط `PORT` على المنفذ اللي تطلبه المنصة (غالباً `3000` أو `8080`).
4. أضف دومينك من إعدادات المنصة — HTTPS يجي معها.

> نبّهك: هذا `Dockerfile` **لم يُبنَ ولم يُختبر** هنا، لأن بيئة العمل ما فيها
> Docker يعمل. السيرفر نفسه مختبر كامل (٣١ فحصاً على متصفح حقيقي وقاعدة بيانات
> حقيقية)، لكن أول بناء للصورة قد يحتاج تعديل بسيط. قل لي إذا واجهت خطأ.

---

## ملاحظات

- **قراءة البيانات من الصورة (OCR)** تحمّل محرّك القراءة من الإنترنت أول مرة
  تستخدمها. يعمل عادي، لكن أول استخدام يحتاج اتصال.
- **التحديثات:** `cd /opt/kitchen-stock && git pull && systemctl restart kitchen-stock`.
- **الموظفين:** ما يحتاجون أي حساب خارجي — أنت تنشئ لهم حسابات من داخل
  الصفحة، صفحة الإعدادات.
- **تغيير كلمة مرور موظف** يطرد أجهزته من الجلسة فوراً.
- **تعطيل حساب** يأخذ أثره في نفس اللحظة على كل الأجهزة، لأن الصلاحيات تُقرأ من
  قاعدة البيانات مع كل طلب.

</div>

---

## English

This server runs the **same** `web/kitchen-stock.html` you already use, from
your own domain. There is no second copy of the app to keep in step: one file,
served from two places.

On claude.ai the page gets its data store and its file-saving from the platform
and checks passwords in the browser. Here, a small Express server gives it the
same two abilities over SQLite, and **checks passwords on the server** with
scrypt — the browser is never handed a stored derivation, so whoever reaches
the page cannot attack your staff's passwords offline.

### Try it locally

```bash
cd host && npm install && npm start      # http://localhost:3000
```

### Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `DATA_DIR` | `host/data` | Where the SQLite file lives |
| `SECURE_COOKIES` | on | Set `0` **only** for plain-HTTP localhost testing |
| `SESSION_DAYS` | `30` | How long a signed-in device stays signed in |
| `PAGE_FILE` | `../web/kitchen-stock.html` | The page to serve |

### Deploying

Two paths, both detailed in Arabic above:

- **A rented VPS** (~€5/month) with Caddy in front for automatic HTTPS, the app
  under systemd, and a nightly `backup.mjs` in cron. Cheapest, and the bill does
  not move.
- **A Docker platform** (Fly.io, Render, Railway) using the `Dockerfile` at the
  repository root. **Attach a persistent volume at `/data`** — without one, every
  deploy starts from a clean image and the shop's records are gone.

HTTPS is not optional: the camera, the barcode scanner and the service worker
all need it, and both paths provide it.

### Backups

`host/backup.mjs` writes a consistent copy using SQLite's own backup API, so it
is safe to run while the shop is open. Copy the result somewhere off the server.

### How it fits together

- `server.js` serves the page, wrapping the fragment in a document skeleton and
  injecting a boot record plus `public/claude-shim.js` ahead of the page's own
  script.
- `public/claude-shim.js` provides `window.claude.use("db")` and
  `use("downloads")` over this host's API, and installs `window.KS_HOST_AUTH`,
  which is how the page knows to send passwords to the server instead of
  checking them itself. On claude.ai that global does not exist and the page
  behaves exactly as published.
- Account documents are filtered on the way out and refused on the way in: only
  `POST /api/accounts` ever sees a password, and `salt`/`hash` live in a separate
  table that no API returns.
