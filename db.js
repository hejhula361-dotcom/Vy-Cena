import sqlite3pkg from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const sqlite3 = sqlite3pkg.verbose();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// univerzální cesta k databázi (funguje lokálně i na Renderu)
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'eurobrokers.db');

export async function initDB() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
      console.error('❌ Chyba při připojování k databázi:', err.message);
    } else {
      console.log(`✅ Databáze připojena: ${DB_FILE}`);
    }
  });

  // vytvoření tabulek, pokud neexistují
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        city TEXT NOT NULL,
        psc TEXT NOT NULL,
        type TEXT NOT NULL,
        area REAL NOT NULL,
        layout TEXT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        contacted INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // po vytvoření tabulek:
db.run(`ALTER TABLE leads ADD COLUMN balcony TEXT`, () => {});
db.run(`ALTER TABLE leads ADD COLUMN condition TEXT`, () => {});

  });

  // vlastní Promise-based API
  return {
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve(this);
        });
      });
    },
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    },
  };
}
