// يحدد كلمة السر المشتركة. الاستخدام: npm run set-password -- visitor   أو   npm run set-password -- admin
const path = require('node:path');
const readline = require('node:readline');
const { openDb } = require('./db');
const { hashPassword, passwordProblem, endUserSessions } = require('./auth');

const LABELS = { visitor: 'كلمة سر الزوار', admin: 'كلمة سر المدير' };

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(text); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

async function main() {
  const which = process.argv[2];
  if (!LABELS[which]) {
    console.log('الاستخدام: npm run set-password -- visitor   أو   npm run set-password -- admin');
    process.exit(1);
  }
  const db = openDb(path.join(__dirname, '..', 'data'));
  const password = process.env.SHARED_PASSWORD || await askHidden(LABELS[which] + ': ');
  const problem = passwordProblem(password);
  if (problem) {
    console.log(problem);
    process.exit(1);
  }
  const row = db.prepare('SELECT id FROM users WHERE shared = ?').get(which);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), row.id);
  endUserSessions(db, row.id);
  console.log('تم حفظ ' + LABELS[which] + '.');
}

main();
