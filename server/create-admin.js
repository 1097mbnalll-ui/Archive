// ينشئ حساب مدير. الاستخدام: npm run create-admin -- <اسم-المستخدم> "<الاسم الظاهر>"
// يسألك عن كلمة السر بدون ما تطلع على الشاشة.
const path = require('node:path');
const readline = require('node:readline');
const { openDb } = require('./db');
const { hashPassword, passwordProblem } = require('./auth');

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(text); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

async function main() {
  const [username, displayName] = process.argv.slice(2);
  if (!username) {
    console.log('الاستخدام: npm run create-admin -- <اسم-المستخدم> "<الاسم الظاهر>"');
    process.exit(1);
  }
  const db = openDb(path.join(__dirname, '..', 'data'));
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    console.log('اسم المستخدم هذا موجود من قبل.');
    process.exit(1);
  }
  const password = process.env.ADMIN_PASSWORD || await askHidden('كلمة السر: ');
  const problem = passwordProblem(password);
  if (problem) {
    console.log(problem);
    process.exit(1);
  }
  db.prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, 'admin')")
    .run(username, displayName || username, hashPassword(password));
  console.log('تم إنشاء حساب المدير: ' + username);
}

main();
