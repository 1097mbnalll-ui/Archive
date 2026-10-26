// الدخول وكلمات السر والجلسات والصلاحيات.
const crypto = require('node:crypto');

const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 30;
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 };
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

const ROLES = {
  admin: { label: 'مدير', rank: 3 },
  editor: { label: 'محرر', rank: 2 },
  viewer: { label: 'زائر', rank: 1 }
};

// ---------- كلمات السر ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 128 * 1024 * 1024 });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

function verifyPassword(password, stored) {
  const [algo, N, r, p, salt, hash] = String(stored).split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 128 * 1024 * 1024 });
  return crypto.timingSafeEqual(actual, expected);
}

// يرجع رسالة خطأ لو كلمة السر ضعيفة، أو null لو مقبولة.
function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 8) return 'كلمة السر لازم تكون 8 أحرف أو أكثر';
  if (password.length > 200) return 'كلمة السر طويلة جدًا';
  return null;
}

// بصمة ثابتة نستخدمها لما يكون اسم المستخدم غلط، عشان وقت الرد يكون نفسه.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

// ---------- الجلسات ----------

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  db.prepare(`INSERT INTO sessions (token_hash, user_id, csrf, expires_at) VALUES (?, ?, ?, datetime('now', ?))`)
    .run(sha256(token), userId, csrf, '+' + SESSION_DAYS + ' days');
  return token;
}

function endSession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

function endUserSessions(db, userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > -1 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

function setSessionCookie(req, res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

// يقرأ الجلسة من الكوكي ويحط المستخدم في req.user (أو null).
function loadSession(db) {
  const find = db.prepare(`
    SELECT s.csrf, u.id, u.username, u.display_name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND u.deleted_at IS NULL`);
  return (req, res, next) => {
    req.user = null;
    req.sessionToken = readCookie(req, SESSION_COOKIE);
    if (req.sessionToken) {
      const row = find.get(sha256(req.sessionToken));
      if (row) {
        req.user = { id: row.id, username: row.username, displayName: row.display_name, role: row.role };
        req.csrf = row.csrf;
      }
    }
    res.locals.user = req.user;
    res.locals.csrf = req.csrf || '';
    next();
  };
}

function hasRole(user, role) {
  return Boolean(user) && ROLES[user.role].rank >= ROLES[role].rank;
}

// يمنع الصفحة عن اللي ما دخل، أو اللي صلاحيته أقل من المطلوب.
function requireRole(role) {
  return (req, res, next) => {
    const wantsJson = (req.headers.accept || '').includes('application/json');
    if (!req.user) {
      if (wantsJson) return res.status(401).json({ error: 'انتهت جلستك. ادخل من جديد.' });
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }
    if (!hasRole(req.user, role)) {
      if (wantsJson) return res.status(403).json({ error: 'صلاحيتك ما تسمح.' });
      return res.status(403).render('forbidden');
    }
    next();
  };
}

// كل طلب يغيّر شيء لازم يجي من نفس الموقع ومعه رمز الحماية.
function csrfValid(req) {
  const sent = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  return Boolean(req.csrf) && typeof sent === 'string' && sent.length === req.csrf.length &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(req.csrf));
}

const CSRF_MESSAGE = 'انتهت صلاحية الصفحة. ارجع وحدّثها وجرّب مرة ثانية.';

function checkCsrf(req, res, next) {
  if (req.method !== 'POST' || csrfValid(req)) return next();
  res.status(403).render('forbidden', { reason: CSRF_MESSAGE });
}

function checkOrigin(req, res, next) {
  if (req.method !== 'POST') return next();
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return res.status(403).send('Forbidden');
  next();
}

// ---------- منع تخمين كلمة السر ----------

const failures = new Map();

function lockKey(req, username) {
  return req.ip + '|' + String(username || '').toLowerCase();
}

function isLocked(req, username) {
  const entry = failures.get(lockKey(req, username));
  if (!entry || entry.count < MAX_FAILURES) return false;
  if (Date.now() - entry.last > LOCK_MINUTES * 60 * 1000) {
    failures.delete(lockKey(req, username));
    return false;
  }
  return true;
}

function recordFailure(req, username) {
  const key = lockKey(req, username);
  const entry = failures.get(key) || { count: 0, last: 0 };
  failures.set(key, { count: entry.count + 1, last: Date.now() });
}

function clearFailures(req, username) {
  failures.delete(lockKey(req, username));
}

module.exports = {
  ROLES, LOCK_MINUTES,
  hashPassword, verifyPassword, passwordProblem, DUMMY_HASH,
  createSession, endSession, endUserSessions, setSessionCookie, clearSessionCookie, loadSession,
  hasRole, requireRole, checkCsrf, csrfValid, CSRF_MESSAGE, checkOrigin,
  isLocked, recordFailure, clearFailures
};
