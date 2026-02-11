
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_FILE = 'database.sqlite';

async function createDatabase() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      password TEXT,
      profile TEXT
    );
  `);

  db.run(`
    CREATE TABLE comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT
    );
  `);

  const stmt = db.prepare("INSERT INTO users (username, password, profile) VALUES (?, ?, ?)");
  stmt.run('admin', 'password123', 'This is the admin profile.');
  stmt.run('user1', 'user1pass', 'This is user1 profile.');
  stmt.run('user2', 'user2pass', 'This is user2 profile.');
  stmt.free();

  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
  return db;
}

async function getDatabase() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    return new SQL.Database(fileBuffer);
  } else {
    return createDatabase();
  }
}

function saveDatabase(db) {
    const data = db.export();
    fs.writeFileSync(DB_FILE, Buffer.from(data));
}

module.exports = { getDatabase, saveDatabase };
