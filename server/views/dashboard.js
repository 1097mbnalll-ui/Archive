const { html } = require('../html');
const { admin } = require('./layout');

module.exports = (locals) => {
  const { stats, latest } = locals;
  const tiles = [
    { num: stats.photos, what: 'صورة', href: '/admin/items' },
    { num: stats.documents, what: 'مستند', href: '/admin/items' },
    { num: stats.public, what: 'خاصة بأصحاب الحسابات', href: '/admin/items?privacy=family' },
    { num: stats.albums, what: 'ألبوم', href: '/admin/collections' },
    { num: stats.occasions, what: 'مناسبة', href: '/admin/collections' }
  ];
  if (stats.users !== null) tiles.push({ num: stats.users, what: 'فرد له حساب', href: '/admin/users' });

  return admin({
    ...locals,
    title: 'الرئيسية',
    active: 'home',
    body: html`
    <div class="page-head">
      <div>
        <h1>أهلًا <bdi>${locals.user.displayName}</bdi></h1>
        <p>هذي نظرة سريعة على الأرشيف.</p>
      </div>
      <a class="btn" href="/admin/upload">رفع صور</a>
    </div>

    <section aria-labelledby="stats-title" class="section">
      <h2 id="stats-title" class="sr-only">الأرقام</h2>
      <div class="stats">
        ${tiles.map((t) => html`
        <a class="stat" href="${t.href}"><span class="num">${t.num.toLocaleString('ar-SA')}</span><span class="what">${t.what}</span></a>`)}
      </div>
    </section>

    <section aria-labelledby="latest-title" class="section">
      <div class="page-head">
        <h2 id="latest-title">آخر الإضافات</h2>
        ${latest.length ? html`<a href="/admin/items">كل الصور</a>` : ''}
      </div>
      ${latest.length === 0 ? html`
        <div class="empty">
          <h3>الأرشيف فاضي</h3>
          <p class="note">ارفع أول صور، وبتطلع هنا.</p>
          <a class="btn" href="/admin/upload">رفع صور</a>
        </div>` : html`
        <ul class="grid" role="list">
          ${latest.map((it) => html`
          <li>
            <a class="tile" href="/admin/items/${it.id}/edit">
              <img src="/media/${it.id}/thumb" alt="" loading="lazy" decoding="async">
              <span class="meta">
                <span class="title" title="${it.title || ''}">${it.title || 'بدون عنوان'}</span>
                <span class="sub">
                  <span class="privacy privacy-${it.privacy}">${it.privacy === 'family' ? 'خاصة' : 'الكل'}</span>
                  <span class="clip">${it.uploader ? 'رفعها ' + it.uploader : ''}</span>
                </span>
              </span>
            </a>
          </li>`)}
        </ul>`}
    </section>`
  });
};
