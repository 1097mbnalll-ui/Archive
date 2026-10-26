// السيرفر: يقدّم الموقع ولوحة الإدارة.
const path = require('node:path');
const express = require('express');
const { openDb } = require('./db');
const auth = require('./auth');

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

  const findUser = db.prepare('SELECT * FROM users WHERE username = ? AND deleted_at IS NULL');

  app.post('/login', (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const fail = (status, error) => res.status(status).render('login', { error, username, next: req.body.next });

    if (auth.isLocked(req, username)) {
      return fail(429, 'محاولات كثيرة غلط. انتظر ' + auth.LOCK_MINUTES + ' دقيقة وجرّب مرة ثانية.');
    }
    const user = username ? findUser.get(username) : null;
    const ok = auth.verifyPassword(password, user ? user.password_hash : auth.DUMMY_HASH) && Boolean(user);
    if (!ok) {
      auth.recordFailure(req, username);
      return fail(401, 'اسم المستخدم أو كلمة السر غلط');
    }
    auth.clearFailures(req, username);
    auth.endSession(db, req.sessionToken);
    auth.setSessionCookie(req, res, auth.createSession(db, user.id));
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
  adminRouter.use(auth.checkCsrf);
  adminRouter.use((req, res, next) => {
    res.locals.msg = req.query.msg;
    next();
  });

  adminRouter.get('/', (req, res) => res.render('dashboard'));
  adminRouter.use('/users', require('./routes/users')(db));

  app.use('/admin', adminRouter);

  // ---------- الموقع ----------

  app.use(express.static(path.join(ROOT, 'public')));

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
