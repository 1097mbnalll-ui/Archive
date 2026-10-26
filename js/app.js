// بداية الموقع: الدخول، والتجهيز أول مرة، والتنقل بين صفحات العرض ولوحة الإدارة.
import { el } from './dom.js';
import { Vault, WrongPassword } from './vault.js';
import { GitHub } from './github.js';
import { createViewer } from './viewer.js';
import { createAdmin, savedToken } from './admin.js';

const config = window.ARCHIVE_CONFIG;
const vault = new Vault(config);
const root = document.getElementById('root');
const protect = window.ArchiveProtect;
let catalog = null;
let adminFresh = false;

const ATTEMPT_KEY = 'archive-attempts';

// ---------- صفحات بسيطة ----------

function plain(content) {
  document.body.classList.remove('viewer');
  protect.removeWatermark();
  root.replaceChildren(el('main', { class: 'plain-main' }, el('section', { class: 'login' }, content)));
}

function field(id, label, input, hint) {
  input.id = id;
  if (hint) input.setAttribute('aria-describedby', id + '-hint');
  return el('div', { class: 'field' }, [el('label', { for: id }, label), input, hint ? el('span', { class: 'hint', id: id + '-hint' }, hint) : null]);
}

// تخمين كلمة السر: بعد 5 محاولات غلط ننتظر 15 دقيقة في هذا المتصفح.
// (التشفير نفسه يخلي التخمين بطيء جدًا حتى لو أحد حاول من برّا الموقع.)
function attempts() {
  try { return JSON.parse(localStorage.getItem(ATTEMPT_KEY)) || { count: 0, at: 0 }; } catch (e) { return { count: 0, at: 0 }; }
}
function setAttempts(value) { try { localStorage.setItem(ATTEMPT_KEY, JSON.stringify(value)); } catch (e) { /* لا شي */ } }

function loginPage(error) {
  document.title = 'الدخول · أرشيف العائلة';
  const password = el('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true, maxlength: 200, autofocus: true });
  const errorSlot = el('div', null, error ? el('p', { class: 'error', role: 'alert' }, error) : null);
  const btn = el('button', { class: 'btn', type: 'submit' }, 'ادخل');
  plain([
    el('h1', null, 'أرشيف العائلة'),
    el('p', null, 'الأرشيف خاص بالعائلة ومشفّر. اكتب كلمة السر عشان تدخل.'),
    errorSlot,
    el('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      errorSlot.replaceChildren();
      const a = attempts();
      if (a.count >= 5 && Date.now() - a.at < 15 * 60 * 1000) {
        errorSlot.append(el('p', { class: 'error', role: 'alert' }, 'محاولات كثيرة غلط. انتظر 15 دقيقة وجرّب مرة ثانية.'));
        return;
      }
      btn.disabled = true;
      btn.textContent = 'نفتح الأرشيف…';
      try {
        await vault.login(password.value);
        setAttempts({ count: 0, at: 0 });
        await start();
      } catch (err) {
        if (err instanceof WrongPassword) setAttempts({ count: (a.count >= 5 ? 0 : a.count) + 1, at: Date.now() });
        btn.disabled = false;
        btn.textContent = 'ادخل';
        errorSlot.append(el('p', { class: 'error', role: 'alert' }, err.message));
        password.select();
      }
    } }, [field('password', 'كلمة السر', password), btn])
  ]);
  password.focus();
}

// أول مرة: المدير يربط GitHub ويحدد كلمتي السر.
function setupPage() {
  document.title = 'تجهيز الأرشيف';
  const token = el('input', { type: 'password', autocomplete: 'off', dir: 'ltr', required: true });
  const visitor = el('input', { type: 'password', autocomplete: 'new-password', required: true, maxlength: 200 });
  const admin = el('input', { type: 'password', autocomplete: 'new-password', required: true, maxlength: 200 });
  const errorSlot = el('div');
  const btn = el('button', { class: 'btn', type: 'submit' }, 'جهّز الأرشيف');
  plain([
    el('h1', null, 'تجهيز الأرشيف'),
    el('p', null, 'هذي أول مرة. حدد كلمتي السر، واربط GitHub عشان ينحفظ الأرشيف المشفّر.'),
    errorSlot,
    el('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      errorSlot.replaceChildren();
      const fail = (t) => errorSlot.append(el('p', { class: 'error', role: 'alert' }, t));
      if (visitor.value.length < 8 || admin.value.length < 8) return fail('كل كلمة سر لازم تكون 8 أحرف أو أكثر');
      if (visitor.value === admin.value) return fail('كلمة سر الزوار لازم تكون مختلفة عن كلمة سر المدير');
      btn.disabled = true;
      btn.textContent = 'نجهّز…';
      try {
        const gh = new GitHub(config, token.value.trim());
        await gh.check();
        if (await gh.readFile('vault/keys.json')) throw new Error('الأرشيف متجهّز من قبل. حدّث الصفحة وادخل.');
        await vault.setup(gh, visitor.value, admin.value);
        try { localStorage.setItem('archive-github-token', token.value.trim()); } catch (err) { /* لا شي */ }
        location.hash = '#/admin';
        await start();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'جهّز الأرشيف';
        fail(err.message);
      }
    } }, [
      field('setup-visitor', 'كلمة سر الزوار', visitor, 'تعطيها للعائلة. 8 أحرف أو أكثر.'),
      field('setup-admin', 'كلمة سر المدير', admin, 'لك أنت بس. مختلفة عن كلمة سر الزوار.'),
      field('setup-token', 'مفتاح GitHub', token, 'يبدأ بـ github_pat_. الخطوات في ملف README.'),
      btn
    ])
  ]);
}

function logout() {
  vault.logout();
  catalog = null;
  adminFresh = false;
  location.hash = '#/';
  loginPage();
}

// ---------- التنقل ----------

let viewerRoute = null;
let adminRoute = null;

function viewerFrame() {
  document.body.classList.add('viewer');
  const app = el('main', { id: 'app' });
  const crumbs = el('nav', { class: 'crumbs', 'aria-label': 'مكانك الحالي' });
  const account = el('div', { class: 'account' }, [
    el('span', { class: 'viewer-name' }, vault.session.role === 'admin' ? 'المدير' : 'زائر العائلة'),
    vault.session.role === 'admin' ? el('a', { href: '#/admin' }, 'لوحة الإدارة') : null,
    el('button', { type: 'button', class: 'linklike', onclick: logout }, 'خروج')
  ]);
  root.replaceChildren(
    el('header', { class: 'topbar' }, el('div', { class: 'topbar-inner' }, [el('a', { class: 'brand', href: '#/' }, 'أرشيف العائلة'), crumbs, account])),
    app
  );
  protect.watermark({ name: vault.session.role === 'admin' ? 'المدير' : 'زائر العائلة', code: vault.session.code });
  return createViewer({ app, crumbs, vault, catalog });
}

async function route() {
  const [path, query] = location.hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'admin') {
    if (vault.session.role !== 'admin') {
      plain([el('h1', null, 'هذي الصفحة للمدير'), el('p', null, 'ادخل بكلمة سر المدير عشان تفتح لوحة الإدارة.'), el('a', { class: 'btn', href: '#/' }, 'رجوع للأرشيف')]);
      return;
    }
    document.body.classList.remove('viewer');
    protect.removeWatermark();
    if (!adminRoute) {
      adminRoute = createAdmin({ root, vault, config, getCatalog: () => catalog, setCatalog: (c) => { catalog = c; viewerRoute = null; }, onLogout: logout });
    }
    // أول ما يفتح المدير اللوحة، نجيب آخر نسخة من GitHub مباشرة.
    if (!adminFresh && savedToken()) {
      vault.github = vault.github || new GitHub(config, savedToken());
      try { catalog = await vault.loadCatalog(); adminFresh = true; viewerRoute = null; } catch (e) { /* نكمل بالنسخة اللي عندنا */ }
    }
    adminRoute(parts, query);
    return;
  }
  if (!viewerRoute || !document.getElementById('app')) viewerRoute = viewerFrame();
  viewerRoute(parts, query);
  window.scrollTo(0, 0);
}

async function start() {
  catalog = await vault.loadCatalog();
  viewerRoute = null;
  await route();
}

window.addEventListener('hashchange', () => { if (vault.session && catalog) route(); });

(async function boot() {
  if (!window.crypto || !crypto.subtle) {
    plain([el('h1', null, 'المتصفح ما يدعم التشفير'), el('p', null, 'افتح الموقع من رابط يبدأ بـ https، أو حدّث المتصفح.')]);
    return;
  }
  try {
    if (await vault.restoreSession()) return await start();
    if (!(await vault.isSetUp())) return setupPage();
    loginPage();
  } catch (err) {
    plain([el('h1', null, 'ما قدرنا نفتح الأرشيف'), el('p', null, 'تأكد من الإنترنت وحدّث الصفحة.'), el('p', { class: 'note' }, String(err.message || err))]);
  }
})();
