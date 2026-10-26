// أدوات مساعدة للاختبارات: سيرفر مؤقت بقاعدة بيانات فاضية، ومتصفح بسيط يحفظ الكوكيز.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/index');
const { hashPassword } = require('../server/auth');

async function startServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-test-'));
  const app = createApp({ dataDir });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const db = app.get('db');
  return {
    base, db, dataDir,
    addUser(username, role, password = 'password-123', displayName = username) {
      return db.prepare('INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)')
        .run(username, displayName, hashPassword(password), role).lastInsertRowid;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
      db.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

class Client {
  constructor(base) { this.base = base; this.cookies = new Map(); }

  async request(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => k + '=' + v).join('; ');
    const res = await fetch(this.base + url, { redirect: 'manual', ...options, headers });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const [name, ...rest] = pair.split('=');
      const value = rest.join('=');
      if (!value || /Expires=Thu, 01 Jan 1970/i.test(line)) this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), value);
    }
    res.text_ = await res.text();
    return res;
  }

  get(url) { return this.request(url); }

  post(url, fields) {
    return this.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString()
    });
  }

  async login(username, password = 'password-123') {
    return this.post('/login', { username, password });
  }

  // يقرأ رمز الحماية من أي صفحة في اللوحة.
  async csrf(url = '/admin') {
    const res = await this.get(url);
    const match = res.text_.match(/name="_csrf" value="([^"]+)"/);
    return match && match[1];
  }
}

module.exports = { startServer, Client };
