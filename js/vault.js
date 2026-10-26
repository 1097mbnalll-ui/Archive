// الخزنة: تقرأ الأرشيف المشفّر وتفكّه، وتشفّره وتحفظه على GitHub.
//
// الملفات على GitHub (كلها مشفّرة إلا keys.json، وهو فيه المفاتيح مقفولة بكلمات السر):
//   vault/keys.json            مفتاح "كل العائلة" ومفتاح "الخاص"، مقفولين بكلمة سر الزوار وكلمة سر المدير
//   vault/catalog-all.bin      الأشخاص والألبومات والمناسبات وصور "كل العائلة"
//   vault/catalog-private.bin  الصور الخاصة (للمدير بس)
//   vault/m/<id>-thumb.bin     صورة مصغّرة
//   vault/m/<id>-display.bin   صورة للعرض
import {
  PBKDF2_ITERATIONS, randomBytes, randomId, toBase64, fromBase64,
  keyFromPassword, newKey, encryptJson, decryptJson, encrypt, decrypt, wrapKey, unwrapKey, exportKey, importKey
} from './crypto.js';

export const PATHS = {
  keys: 'vault/keys.json',
  all: 'vault/catalog-all.bin',
  private: 'vault/catalog-private.bin',
  media: (mediaId, size) => 'vault/m/' + mediaId + '-' + size + '.bin'
};

const STARTER_PEOPLE = ['الجد', 'الجدة', 'الوالد', 'الوالدة', 'العم', 'العمة', 'الخال', 'الخالة'];
const SESSION_KEY = 'archive-session';
const encoder = new TextEncoder();

export class WrongPassword extends Error {}

export class Vault {
  constructor(config) {
    this.config = config;
    this.github = null;
    this.session = null;
    this.mediaCache = new Map();
  }

  // ---------- القراءة ----------

  // الزوار يقرون من الموقع نفسه. المدير يقرأ من GitHub مباشرة عشان يشوف آخر نسخة.
  async read(path) {
    if (this.github) return this.github.readFile(path);
    const res = await fetch(path + '?v=' + Date.now(), { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('تعذّر تحميل ' + path);
    return new Uint8Array(await res.arrayBuffer());
  }

  async readKeys() {
    const bytes = await this.read(PATHS.keys);
    return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null;
  }

  async isSetUp() {
    return Boolean(await this.readKeys());
  }

  // ---------- الدخول ----------

  async login(password) {
    const keys = await this.readKeys();
    if (!keys) throw new Error('الأرشيف ما تجهّز بعد');
    const [visitorKey, adminKey] = await Promise.all([
      keyFromPassword(password, fromBase64(keys.visitor.salt), keys.iterations),
      keyFromPassword(password, fromBase64(keys.admin.salt), keys.iterations)
    ]);
    let session = null;
    try {
      session = { role: 'admin', all: await unwrapKey(adminKey, keys.admin.all), private: await unwrapKey(adminKey, keys.admin.private) };
    } catch (e) {
      try {
        session = { role: 'visitor', all: await unwrapKey(visitorKey, keys.visitor.all), private: null };
      } catch (e2) {
        throw new WrongPassword('كلمة السر غلط');
      }
    }
    session.code = toBase64(randomBytes(4)).replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
    this.session = session;
    await this.saveSession();
    return session;
  }

  // الجلسة تنحفظ في التبويب بس، وتروح لما تسكّره.
  async saveSession() {
    const s = this.session;
    const stored = { role: s.role, code: s.code, all: toBase64(await exportKey(s.all)), private: s.private ? toBase64(await exportKey(s.private)) : null };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored)); } catch (e) { /* يكمّل بدون حفظ */ }
  }

  async restoreSession() {
    let stored = null;
    try { stored = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { stored = null; }
    if (!stored) return null;
    this.session = {
      role: stored.role, code: stored.code,
      all: await importKey(fromBase64(stored.all)),
      private: stored.private ? await importKey(fromBase64(stored.private)) : null
    };
    return this.session;
  }

  logout() {
    this.session = null;
    this.github = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* لا شي */ }
    for (const url of this.mediaCache.values()) url.then((u) => u && URL.revokeObjectURL(u));
    this.mediaCache.clear();
  }

  // ---------- الأرشيف ----------

  async loadCatalog() {
    const allBytes = await this.read(PATHS.all);
    const all = allBytes ? await decryptJson(this.session.all, allBytes) : { people: [], collections: [], items: [] };
    let privateItems = [];
    if (this.session.private) {
      const bytes = await this.read(PATHS.private);
      if (bytes) privateItems = (await decryptJson(this.session.private, bytes)).items;
    }
    return { people: all.people, collections: all.collections, items: all.items.concat(privateItems) };
  }

  // يشفّر الأرشيف ويحفظه مع أي ملفات صور، في حفظ واحد على GitHub.
  async save(catalog, extraFiles = {}, message = 'تحديث الأرشيف', onProgress) {
    if (!this.github || this.session.role !== 'admin') throw new Error('الحفظ للمدير بس');
    const allPart = { people: catalog.people, collections: catalog.collections, items: catalog.items.filter((i) => i.privacy !== 'family') };
    const privatePart = { items: catalog.items.filter((i) => i.privacy === 'family') };
    const files = {
      ...extraFiles,
      [PATHS.all]: await encryptJson(this.session.all, allPart),
      [PATHS.private]: await encryptJson(this.session.private, privatePart)
    };
    return this.github.commit(files, message, onProgress);
  }

  // ---------- الصور ----------

  mediaKey(privacy) {
    return privacy === 'family' ? this.session.private : this.session.all;
  }

  async encryptMedia(privacy, bytes) {
    return encrypt(this.mediaKey(privacy), bytes);
  }

  // يجيب الصورة المشفّرة، ويفكها، ويرجع رابط مؤقت داخل المتصفح.
  mediaUrl(item, size) {
    const cacheKey = item.media + '-' + size;
    if (!this.mediaCache.has(cacheKey)) {
      this.mediaCache.set(cacheKey, (async () => {
        const bytes = await this.read(PATHS.media(item.media, size));
        if (!bytes) return null;
        const plain = await decrypt(this.mediaKey(item.privacy), bytes);
        return URL.createObjectURL(new Blob([plain], { type: 'image/jpeg' }));
      })().catch(() => null));
    }
    return this.mediaCache.get(cacheKey);
  }

  // يغيّر خصوصية صورة: يعيد تشفيرها بالمفتاح الثاني، باسم ملف جديد، ويشيل القديم.
  async reencryptMedia(item, newPrivacy) {
    const files = {};
    const newMedia = randomId();
    for (const size of ['thumb', 'display']) {
      const bytes = await this.read(PATHS.media(item.media, size));
      if (!bytes) continue;
      const plain = await decrypt(this.mediaKey(item.privacy), bytes);
      files[PATHS.media(newMedia, size)] = await encrypt(this.mediaKey(newPrivacy), plain);
      files[PATHS.media(item.media, size)] = null;
    }
    return { files, media: newMedia };
  }

  // ---------- التجهيز وكلمات السر ----------

  // أول مرة: يسوي المفاتيح ويقفلها بكلمتي السر، ويحفظ أرشيف فاضي.
  async setup(github, visitorPassword, adminPassword) {
    const all = await newKey();
    const priv = await newKey();
    const vSalt = randomBytes(16);
    const aSalt = randomBytes(16);
    const vKey = await keyFromPassword(visitorPassword, vSalt);
    const aKey = await keyFromPassword(adminPassword, aSalt);
    const keys = {
      version: 1,
      iterations: PBKDF2_ITERATIONS,
      visitor: { salt: toBase64(vSalt), all: await wrapKey(vKey, all) },
      admin: { salt: toBase64(aSalt), all: await wrapKey(aKey, all), private: await wrapKey(aKey, priv) }
    };
    this.github = github;
    this.session = { role: 'admin', all, private: priv, code: 'SETUP' };
    const catalog = {
      people: STARTER_PEOPLE.map((name) => ({ id: randomId(), name })),
      collections: [],
      items: []
    };
    await this.save(catalog, { [PATHS.keys]: encoder.encode(JSON.stringify(keys, null, 2)) }, 'تجهيز الأرشيف المشفّر');
    await this.saveSession();
  }

  // يغيّر كلمة سر: يقفل نفس المفاتيح بالكلمة الجديدة.
  async changePassword(which, password) {
    const keys = await this.readKeys();
    const salt = randomBytes(16);
    const key = await keyFromPassword(password, salt, keys.iterations);
    if (which === 'visitor') {
      keys.visitor = { salt: toBase64(salt), all: await wrapKey(key, this.session.all) };
    } else {
      keys.admin = { salt: toBase64(salt), all: await wrapKey(key, this.session.all), private: await wrapKey(key, this.session.private) };
    }
    await this.github.commit({ [PATHS.keys]: encoder.encode(JSON.stringify(keys, null, 2)) }, which === 'visitor' ? 'تغيير كلمة سر الزوار' : 'تغيير كلمة سر المدير');
  }

  // يتأكد إن كلمة السر الجديدة مو نفس الثانية.
  async isOtherPassword(which, password) {
    const keys = await this.readKeys();
    const other = which === 'visitor' ? keys.admin : keys.visitor;
    try {
      await unwrapKey(await keyFromPassword(password, fromBase64(other.salt), keys.iterations), other.all);
      return true;
    } catch (e) {
      return false;
    }
  }
}
