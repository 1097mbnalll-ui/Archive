const { html } = require('../html');
const { hasRole, ROLES } = require('../auth');

// رسائل قصيرة تطلع فوق الصفحة بعد أي عملية. نستخدم مفاتيح ثابتة عشان ما نعرض نص من الرابط.
const MESSAGES = {
  'logged-in': 'أهلًا فيك',
  'user-added': 'تمت إضافة الفرد',
  'user-saved': 'تم حفظ التعديلات',
  'user-deleted': 'انتقل الفرد إلى سلة المحذوفات. تقدر ترجعه من هناك.',
  'restored': 'تم الاسترجاع',
  'collection-added': 'تمت الإضافة',
  'collection-saved': 'تم حفظ التعديلات',
  'collection-deleted': 'انتقل إلى سلة المحذوفات. الصور اللي فيه ما انحذفت.',
  'item-saved': 'تم حفظ التعديلات',
  'item-deleted': 'انتقلت الصورة إلى سلة المحذوفات. تقدر ترجعها من هناك.',
  'uploaded': 'تم حفظ الصور',
  'password-changed': 'تم تغيير كلمة السر'
};

const FONTS = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap';

function head(title, extraCss) {
  return html`<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${title} · أرشيف العائلة</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${FONTS}">
  <link rel="stylesheet" href="/admin/assets/admin.css">
  ${extraCss || ''}
</head>`;
}

// صفحة بسيطة بدون قائمة: للدخول والرسائل.
function plain({ title, body }) {
  return html`${head(title)}
<body class="plain">
  <main class="plain-main">${body}</main>
</body>
</html>`.toString();
}

const NAV = [
  { href: '/admin', key: 'home', label: 'الرئيسية', role: 'editor' },
  { href: '/admin/upload', key: 'upload', label: 'رفع صور', role: 'editor' },
  { href: '/admin/items', key: 'items', label: 'الصور', role: 'editor' },
  { href: '/admin/collections', key: 'collections', label: 'الألبومات والمناسبات', role: 'editor' },
  { href: '/admin/users', key: 'users', label: 'أفراد العائلة', role: 'admin' },
  { href: '/admin/trash', key: 'trash', label: 'المحذوفات', role: 'editor' }
];

function admin({ title, active, user, csrf, msg, body, scripts }) {
  const message = MESSAGES[msg];
  return html`${head(title)}
<body>
  <a class="skip" href="#main">تخطَّ إلى المحتوى</a>
  <header class="bar">
    <div class="bar-inner">
      <a class="brand" href="/admin">أرشيف العائلة</a>
      <nav class="nav" aria-label="القائمة الرئيسية">
        ${NAV.filter((n) => hasRole(user, n.role)).map((n) => html`
          <a href="${n.href}" ${n.key === active ? html`aria-current="page"` : ''}>${n.label}</a>`)}
      </nav>
      <div class="who">
        <span class="who-name" title="${user.displayName}">${user.displayName}</span>
        <span class="role role-${user.role}">${ROLES[user.role].label}</span>
        <a href="/">الموقع</a>
        <form method="post" action="/logout">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button type="submit" class="link">خروج</button>
        </form>
      </div>
    </div>
  </header>
  <main id="main" class="page">
    ${message ? html`<p class="flash" role="status">${message}</p>` : ''}
    ${body}
  </main>
  ${(scripts || []).map((src) => html`<script src="${src}"></script>`)}
</body>
</html>`.toString();
}

module.exports = { admin, plain, MESSAGES };
