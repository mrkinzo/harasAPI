/**
 * Database Module - MySQL Connection & Auto-Setup
 * Uses mysql2/promise with connection pooling.
 * Automatically checks and initializes tables and seed data.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'haras_db';

let pool = null;
let isUsingMySQL = false;
let sqliteDb = null;

// Initial sample horses from Equides API
const INITIAL_DEMO_HORSES = [
  {
    api_id: 'icF7K_o_Rx6MtVOU1sVePA',
    nom: 'QAB CALLOWAY FINLAND',
    race: 'Origine Non Const. Poney',
    sexe: 'Hongre',
    annee_naissance: 2004,
    score: 1.0,
    observacoes: 'Campeão de salto categoria pony master. Temperamento dócil.',
    status: 'Ativo'
  },
  {
    api_id: 'z6P_uMHTRX6_GvyYi7n8PQ',
    nom: 'QABAH MONTMAJOUR',
    race: 'Camargue',
    sexe: 'Male',
    annee_naissance: 1982,
    score: 0.317,
    observacoes: 'Linhagem pura Camargue, garanhão fundador registrado.',
    status: 'Ativo'
  },
  {
    api_id: 'CkjRV5fTS2C_l5kERPVTuA',
    nom: "QABAQ DE L'ABBAYE",
    race: 'Arabe-Barbe',
    sexe: 'Hongre',
    annee_naissance: 2004,
    score: 0.303,
    observacoes: 'Excelente resistência física e conformação atlética.',
    status: 'Treinamento'
  },
  {
    api_id: 'I07wKWTqTfSI13ZVtCsx1A',
    nom: 'QABAS',
    race: 'Arabe',
    sexe: 'Femelle',
    annee_naissance: 2020,
    score: 0.278,
    observacoes: 'Matriz jovem com pedigree excepcional de adestramento.',
    status: 'Reprodução'
  }
];

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function initDatabase() {
  try {
    // 1. First connect without database selected to ensure database exists
    const rootConn = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD
    });

    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await rootConn.end();

    // 2. Connect pool directly to haras_db
    pool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // 3. Create tables in MySQL if not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(180) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS horses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        api_id VARCHAR(100) NULL,
        nom VARCHAR(150) NOT NULL,
        race VARCHAR(120) NOT NULL,
        sexe VARCHAR(50) NOT NULL,
        annee_naissance INT NULL,
        score DECIMAL(6, 4) DEFAULT 1.0000,
        baia VARCHAR(50) NOT NULL,
        observacoes TEXT NULL,
        status VARCHAR(50) DEFAULT 'Ativo',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_horses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Seed demo user if table is empty
    const [userRows] = await pool.query('SELECT COUNT(*) as total FROM users');
    if (userRows[0].total === 0) {
      const demoHash = hashPassword('haras123');
      const [uRes] = await pool.query(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        ['Comendador Haras Imperial', 'demo@haras.com', demoHash]
      );
      const demoUserId = uRes.insertId;

      for (const h of INITIAL_DEMO_HORSES) {
        const [hRes] = await pool.query(`
          INSERT INTO horses (user_id, api_id, nom, race, sexe, annee_naissance, score, baia, observacoes, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [demoUserId, h.api_id, h.nom, h.race, h.sexe, h.annee_naissance, h.score, 'Temp', h.observacoes, h.status]);
        
        const hId = hRes.insertId;
        await pool.query('UPDATE horses SET baia = ? WHERE id = ?', [`Baia #${hId}`, hId]);
      }
      console.log('[MySQL]: Banco e dados iniciais de demonstracao criados com sucesso.');
    }

    isUsingMySQL = true;
    console.log(`[MySQL]: Conexao estabelecida com sucesso no banco: ${DB_NAME} (${DB_HOST}:${DB_PORT})`);
  } catch (err) {
    console.warn(`\n[MySQL Aviso]: Nao foi possivel conectar ao servidor MySQL (${DB_HOST}:${DB_PORT}): ${err.message}`);
    console.log('Dica: Inicie seu servico MySQL ou execute o script schema.sql.');
    console.log('Inicializando fallback resiliente (SQLite local) para garantir que o sistema funcione sem interrupcoes.\n');
    initSqliteFallback();
  }
}

function initSqliteFallback() {
  const DB_PATH = path.join(__dirname, 'haras.db');
  sqliteDb = new DatabaseSync(DB_PATH);
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS horses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      api_id TEXT,
      nom TEXT NOT NULL,
      race TEXT NOT NULL,
      sexe TEXT NOT NULL,
      annee_naissance INTEGER,
      score REAL DEFAULT 1.0,
      baia TEXT NOT NULL,
      observacoes TEXT,
      status TEXT DEFAULT 'Ativo',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const countUsers = sqliteDb.prepare('SELECT count(*) as total FROM users').get().total;
  if (countUsers === 0) {
    const demoHash = hashPassword('haras123');
    const uRes = sqliteDb.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run('Comendador Haras Imperial', 'demo@haras.com', demoHash);
    const demoUserId = uRes.lastInsertRowid;

    for (const h of INITIAL_DEMO_HORSES) {
      const hRes = sqliteDb.prepare(`
        INSERT INTO horses (user_id, api_id, nom, race, sexe, annee_naissance, score, baia, observacoes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(demoUserId, h.api_id, h.nom, h.race, h.sexe, h.annee_naissance, h.score, 'Temp', h.observacoes, h.status);
      const hId = hRes.lastInsertRowid;
      sqliteDb.prepare('UPDATE horses SET baia = ? WHERE id = ?').run(`Baia #${hId}`, hId);
    }
  }
}

// Unified Database Access Helpers
const db = {
  isMySQL() {
    return isUsingMySQL;
  },

  async query(sql, params = []) {
    if (isUsingMySQL) {
      const [rows] = await pool.query(sql, params);
      return rows;
    } else {
      const stmt = sqliteDb.prepare(sql);
      return stmt.all(...params);
    }
  },

  async get(sql, params = []) {
    if (isUsingMySQL) {
      const [rows] = await pool.query(sql, params);
      return rows[0] || null;
    } else {
      const stmt = sqliteDb.prepare(sql);
      return stmt.get(...params) || null;
    }
  },

  async execute(sql, params = []) {
    if (isUsingMySQL) {
      const [result] = await pool.query(sql, params);
      return {
        insertId: result.insertId,
        affectedRows: result.affectedRows
      };
    } else {
      const stmt = sqliteDb.prepare(sql);
      const result = stmt.run(...params);
      return {
        insertId: Number(result.lastInsertRowid),
        affectedRows: result.changes
      };
    }
  }
};

module.exports = {
  db,
  initDatabase,
  hashPassword
};
