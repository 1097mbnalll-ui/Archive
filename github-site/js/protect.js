// حماية الصور من النسخ والحفظ.
// ملاحظة صريحة: ما فيه موقع يقدر يمنع تصوير الشاشة كليًا (ولا التصوير بجوال ثاني).
// هذي الطبقة تسكّر الطرق السهلة، والعلامة المائية تخلي أي تصوير يفضح صاحبه.
(function () {
  const body = document.body;
  // الحماية تشتغل في صفحات العرض بس، مو في لوحة الإدارة.
  const active = () => body.classList.contains('viewer');

  // ---------- منع النسخ والحفظ والسحب والقائمة ----------

  const block = (event) => { if (active()) event.preventDefault(); };
  ['contextmenu', 'dragstart', 'copy', 'cut', 'selectstart'].forEach((type) => document.addEventListener(type, block));

  document.addEventListener('keydown', (event) => {
    if (!active()) return;
    const key = event.key.toLowerCase();
    const mod = event.ctrlKey || event.metaKey;
    // حفظ، طباعة، نسخ، تحديد الكل، عرض المصدر
    if (mod && ['s', 'p', 'c', 'a', 'u'].includes(key)) event.preventDefault();
    // أدوات التصوير المعروفة في ويندوز وماك
    if (key === 'printscreen' || (mod && event.shiftKey && ['3', '4', '5', 's'].includes(key))) {
      event.preventDefault();
      shield(true);
      setTimeout(() => shield(false), 1500);
    }
  });

  // زر Print Screen في ويندوز: نمسح اللي انحفظ في الحافظة.
  document.addEventListener('keyup', (event) => {
    if (event.key === 'PrintScreen' && active()) {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText('').catch(() => {});
      shield(true);
      setTimeout(() => shield(false), 1500);
    }
  });

  // ---------- تغطية الصور لما تطلع من الصفحة ----------
  // أدوات التصوير في الكمبيوتر، وقائمة التطبيقات في الجوال، تاخذ لقطة لما تطلع من الصفحة.

  const cover = document.createElement('div');
  cover.className = 'shield';
  cover.setAttribute('aria-hidden', 'true');
  cover.textContent = 'رجع للصفحة عشان تشوف الصور';
  body.append(cover);

  function shield(on) { body.classList.toggle('shielded', on && active()); }

  document.addEventListener('visibilitychange', () => shield(document.hidden));
  window.addEventListener('blur', () => shield(true));
  window.addEventListener('focus', () => shield(false));
  window.addEventListener('pagehide', () => shield(true));

  // ---------- العلامة المائية ----------
  // اسم الداخل ورمز جلسته والتاريخ، فوق كل الصفحة.

  const xml = (text) => String(text).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

  let layer = null;
  function watermark(viewer) {
    if (layer) layer.remove();
    const date = new Date().toISOString().slice(0, 10);
    // \u2066…\u2069 يعزل الرمز الإنجليزي والتاريخ عشان ما يتلخبط ترتيبهم وسط العربي.
    const iso = (text) => '\u2066' + text + '\u2069';
    const line = 'أرشيف العائلة · ' + viewer.name + ' · ' + iso(viewer.code) + ' · ' + iso(date);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220">' +
      '<text x="210" y="110" text-anchor="middle" direction="rtl" transform="rotate(-24 210 110)" ' +
      'font-family="Noto Naskh Arabic, Tahoma, sans-serif" font-size="17" fill="#3A2A1C" fill-opacity="0.18" ' +
      'stroke="#FBF5E9" stroke-opacity="0.22" stroke-width="2.5" paint-order="stroke">' + xml(line) + '</text></svg>';
    layer = document.createElement('div');
    layer.className = 'watermark';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.backgroundImage = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
    body.append(layer);
  }

  function removeWatermark() { if (layer) layer.remove(); layer = null; }

  window.ArchiveProtect = { watermark, removeWatermark };
})();
