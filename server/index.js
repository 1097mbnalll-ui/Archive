// السيرفر: يقدّم الموقع ولوحة الإدارة.
const path = require('node:path');
const express = require('express');
const { openDb } = require('./db');
const auth = require('./auth');
const { uploadDirs, mediaPath } = require('./items');

const ROOT = path.join(__dirname, '..');

function createApp({ dataDir = path.join(ROOT, 'data') } = {}) {
  const db = openDb(dataDir);
  const app = express();

  app.set('db', db);
  app.set('dataDir', dataDir);
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'js');
  app.engine('js', (file, locals, done) => {
    try { done(null, require(file)(locals)); } catch (err) { done(err); }
  });
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': [
        "default-src 'self'",
        "img-src 'self' blob: data:",
        "style-src 'self' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "script-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "base-uri 'none'"
      ].join('; ')
    });
    next();
  });

  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(auth.loadSession(db));
  app.use(auth.checkOrigin);

  // ---------- الدخول والخروج ----------

  // يرجع رابط داخلي آمن فقط، عشان ما أحد يستغل الدخول ويحوّلك لموقع ثاني.
  const safeNext = (value, user) => {
    if (typeof value === 'string' && /^\/(?!\/)[\w\-/?=&%.]*$/.test(value)) return value;
    return user && auth.hasRole(user, 'editor') ? '/admin' : '/';
  };

  app.get('/login', (req, res) => {
    if (req.user) return res.redirect(safeNext(req.query.next, req.user));
    res.render('login', { next: req.query.next });
  });

  const findUser = db.prepare('SELECT * FROM users WHERE username = ? AND deleted_at IS NULL AND shared IS NULL');
  const sharedAccounts = db.prepare("SELECT * FROM users WHERE shared IS NOT NULL AND deleted_at IS NULL AND password_hash != 'disabled'");

  // طريقتين للدخول: كلمة سر مشتركة بدون اسم (للزوار أو المدير)، أو حساب خاص باسم وكلمة سر.
  app.post('/login', (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const withAccount = req.body.mode === 'account';
    const fail = (status, error) => res.status(status).render('login', { error, username, next: req.body.next, withAccount });

    const lockName = withAccount ? username : '*shared*';
    if (auth.isLocked(req, lockName)) {
      return fail(429, 'محاولات كثيرة غلط. انتظر ' + auth.LOCK_MINUTES + ' دقيقة وجرّب مرة ثانية.');
    }
    let user = null;
    if (withAccount) {
      const found = username ? findUser.get(username) : null;
      if (auth.verifyPassword(password, found ? found.password_hash : auth.DUMMY_HASH) && found) user = found;
    } else if (password) {
      user = sharedAccounts.all().find((a) => auth.verifyPassword(password, a.password_hash)) || null;
      if (!user) auth.verifyPassword(password, auth.DUMMY_HASH);
    }
    if (!user) {
      auth.recordFailure(req, lockName);
      return fail(401, withAccount ? 'اسم المستخدم أو كلمة السر غلط' : 'كلمة السر غلط');
    }
    auth.clearFailures(req, lockName);
    auth.endSession(db, req.sessionToken);
    auth.setSessionCookie(req, res, auth.createSession(db, user.id, req));
    const target = safeNext(req.body.next, { role: user.role });
    res.redirect(target === '/admin' ? '/admin?msg=logged-in' : target);
  });

  app.post('/logout', auth.checkCsrf, (req, res) => {
    auth.endSession(db, req.sessionToken);
    auth.clearSessionCookie(res);
    res.redirect('/login');
  });

  // ---------- لوحة الإدارة ----------

  app.use('/admin/assets', express.static(path.join(__dirname, 'assets'), { maxAge: '1h' }));

  const adminRouter = express.Router();
  adminRouter.use(auth.requireRole('editor'));
  // الرفع يتحقق من رمز الحماية بنفسه بعد قراءة الملفات.
  adminRouter.use((req, res, next) => (req.is('multipart/form-data') ? next() : auth.checkCsrf(req, res, next)));
  adminRouter.use((req, res, next) => {
    res.locals.msg = req.query.msg;
    next();
  });

  const count = (sql) => db.prepare(sql).get().n;
  const latestItems = db.prepare(`
    SELECT i.id, i.title, i.privacy, u.display_name AS uploader
    FROM items i LEFT JOIN users u ON u.id = i.uploaded_by
    WHERE i.deleted_at IS NULL ORDER BY i.created_at DESC, i.id DESC LIMIT 8`);
  adminRouter.get('/', (req, res) => res.render('dashboard', {
    stats: {
      photos: count("SELECT COUNT(*) AS n FROM items WHERE deleted_at IS NULL AND kind = 'photo'"),
      documents: count("SELECT COUNT(*) AS n FROM items WHERE deleted_at IS NULL AND kind = 'document'"),
      public: count("SELECT COUNT(*) AS n FROM items WHERE deleted_at IS NULL AND privacy = 'family'"),
      albums: count("SELECT COUNT(*) AS n FROM collections WHERE deleted_at IS NULL AND kind = 'album'"),
      occasions: count("SELECT COUNT(*) AS n FROM collections WHERE deleted_at IS NULL AND kind = 'occasion'"),
      users: auth.hasRole(req.user, 'admin') ? count('SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL AND shared IS NULL') : null
    },
    latest: latestItems.all()
  }));
  adminRouter.use('/users', require('./routes/users')(db));
  adminRouter.use('/access', require('./routes/access')(db));
  adminRouter.use('/trash', require('./routes/trash')(db));
  adminRouter.use('/collections', require('./routes/collections')(db));
  adminRouter.use('/', require('./routes/items')(db, dataDir));

  app.use('/admin', adminRouter);

  // ---------- ملفات الصور ----------
  // الصور ما تنعرض مباشرة من المجلد: كل طلب يمر على فحص الخصوصية.

  const dirs = uploadDirs(dataDir);
  const mediaItem = db.prepare('SELECT id, file_name, mime, privacy, deleted_at FROM items WHERE id = ?');
  app.get('/media/:id/:size', (req, res, next) => {
    const size = req.params.size;
    if (!req.user || !['thumb', 'display', 'original'].includes(size)) return next();
    const item = mediaItem.get(Number(req.params.id));
    const isEditor = auth.hasRole(req.user, 'editor');
    const canSee = item && (isEditor || (!item.deleted_at && auth.canSeeItem(req.user, item)));
    if (!canSee || (size === 'original' && !isEditor)) return next();
    // الزائر ما يقدر يفتح الصورة لحالها في صفحة جديدة عشان يحفظها، ولا تنحفظ في ذاكرة المتصفح.
    if (!isEditor && req.headers['sec-fetch-dest'] === 'document') return next();
    res.set('Cache-Control', isEditor ? 'private, max-age=3600' : 'private, no-store');
    res.type(size === 'original' ? item.mime : 'image/webp');
    res.sendFile(mediaPath(dirs, item, size), (err) => { if (err && !res.headersSent) next(); });
  });

  // ---------- الموقع ----------
  // الموقع كامل مقفول: ما ينفتح شي بدون كلمة سر.

  app.use((req, res, next) => {
    if (req.user) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'ادخل أول' });
    if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html'))) return res.redirect('/login');
    next();
  });

  app.use('/api/archive', require('./routes/archive-api')(db));

  app.use((req, res, next) => (req.user ? next() : res.status(404).render('not-found')));
  app.use(express.static(path.join(ROOT, 'public'), { setHeaders: (res) => res.set('Cache-Control', 'private, no-store') }));

  app.use((req, res) => res.status(404).render('not-found'));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('صار خطأ في السيرفر');
  });

  return app;
}

module.exports = { createApp };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log('الأرشيف شغّال على http://localhost:' + port));
}
