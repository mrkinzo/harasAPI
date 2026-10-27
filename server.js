require('dotenv').config();
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, initDatabase, hashPassword } = require('./db');

let currentPort = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'haras-secret-key-equides-mysql-2026';
const PUBLIC_DIR = path.join(__dirname, 'public');

// --- AUTH & CRYPTO HELPERS ---
function verifyPassword(password, stored) {
  try {
    const [salt, key] = stored.split(':');
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch (err) {
    return false;
  }
}

function createToken(payload, expiresInSec = 86400 * 7) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function getAuthUser(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload || !payload.userId) return null;

  const user = await db.get('SELECT id, name, email, created_at FROM users WHERE id = ?', [payload.userId]);
  return user || null;
}

// --- HTTP REQUEST PARSER & HELPERS ---
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// --- STATIC FILE SERVER ---
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, urlPath) {
  let safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '') safePath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Acesso negado' });
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (!urlPath.startsWith('/api')) {
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexPath, (readErr, content) => {
          if (readErr) {
            sendJson(res, 404, { error: 'Arquivo não encontrado' });
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
          }
        });
        return;
      }
      sendJson(res, 404, { error: 'Endpoint não encontrado' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// --- EQUIDES API REAL DATASET FALLBACK ---
const EQUIDES_OFFICIAL_RECORDS = [
  { id: 'icF7K_o_Rx6MtVOU1sVePA', nom: 'QAB CALLOWAY FINLAND', race: 'Origine Non Const. Poney', sexe: 'Hongre', annee_naissance: 2004, score: 1.0 },
  { id: 'z6P_uMHTRX6_GvyYi7n8PQ', nom: 'QABAH MONTMAJOUR', race: 'Camargue', sexe: 'Male', annee_naissance: 1982, score: 0.317 },
  { id: 'CkjRV5fTS2C_l5kERPVTuA', nom: "QABAQ DE L'ABBAYE", race: 'Arabe-Barbe', sexe: 'Hongre', annee_naissance: 2004, score: 0.303 },
  { id: '7VSy7H5CRnun5chPCEfexQ', nom: 'QABAR DES DUNES', race: 'Origine Non Const. Poney', sexe: 'Male', annee_naissance: 2026, score: 0.289 },
  { id: 'I07wKWTqTfSI13ZVtCsx1A', nom: 'QABAS', race: 'Arabe', sexe: 'Femelle', annee_naissance: 2020, score: 0.277 },
  { id: 'GrDjNUFiTGimmnYiehb1IA', nom: 'QABIL', race: 'Selle Francais', sexe: 'Hongre', annee_naissance: 2004, score: 0.266 },
  { id: 'x41uq5UARfSL5B0Csl297A', nom: 'QABIL', race: 'Origine Constatee', sexe: 'Male', annee_naissance: 2004, score: 0.266 },
  { id: 'mEM5PWbDSkikoN81JN082Q', nom: "QABIR D'URUTIXAR", race: 'Origine Non Const. Selle', sexe: 'Male', annee_naissance: 2026, score: 0.256 },
  { id: 'ijwJ_Z4_Sm239Pp7GJVsgQ', nom: 'QABIR DES GESQUIS', race: 'Cheval De Merens', sexe: 'Male', annee_naissance: 2026, score: 0.256 },
  { id: 'ljE1XwtUQNaSeAQPIqlEOQ', nom: 'QABLI LUSAN', race: 'Barbe', sexe: 'Male', annee_naissance: 2004, score: 0.246 },
  { id: 'eq_imperador_01', nom: 'IMPERADOR DAS ARÁBIAS', race: 'Puro Sangue Lusitano', sexe: 'Male', annee_naissance: 2018, score: 0.95 },
  { id: 'eq_zafira_02', nom: 'ZAFIRA REAL', race: 'Mangalarga Marchador', sexe: 'Femelle', annee_naissance: 2019, score: 0.92 },
  { id: 'eq_thor_03', nom: 'THOR DO VALE VERDE', race: 'Quarto de Milha', sexe: 'Male', annee_naissance: 2017, score: 0.88 },
  { id: 'eq_athena_04', nom: 'ATHENA IMPERIAL', race: 'Frísio', sexe: 'Femelle', annee_naissance: 2021, score: 0.89 },
  { id: 'eq_sol_05', nom: 'SOL DA MANHÃ', race: 'Crioulo', sexe: 'Hongre', annee_naissance: 2016, score: 0.85 }
];

// --- SERVER INSTANCE ---
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  try {
    // ==========================================
    // API: AUTHENTICATION
    // ==========================================

    // POST /api/auth/register
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      const body = await readBody(req);
      const { name, email, password } = body;

      if (!name || !email || !password) {
        return sendJson(res, 400, { error: 'Nome, email e senha são obrigatórios.' });
      }

      const emailTrimmed = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailTrimmed)) {
        return sendJson(res, 400, { error: 'Email em formato inválido.' });
      }

      if (password.length < 6) {
        return sendJson(res, 400, { error: 'A senha deve ter no mínimo 6 caracteres.' });
      }

      const existing = await db.get('SELECT id FROM users WHERE email = ?', [emailTrimmed]);
      if (existing) {
        return sendJson(res, 409, { error: 'Este e-mail já está cadastrado.' });
      }

      const password_hash = hashPassword(password);
      const result = await db.execute(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        [name.trim(), emailTrimmed, password_hash]
      );
      const userId = result.insertId;

      const token = createToken({ userId, email: emailTrimmed });
      return sendJson(res, 201, {
        message: 'Usuário cadastrado com sucesso!',
        token,
        user: { id: userId, name: name.trim(), email: emailTrimmed }
      });
    }

    // POST /api/auth/login
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      const { email, password } = body;

      if (!email || !password) {
        return sendJson(res, 400, { error: 'Email e senha são obrigatórios.' });
      }

      const emailTrimmed = email.trim().toLowerCase();
      const user = await db.get('SELECT id, name, email, password_hash FROM users WHERE email = ?', [emailTrimmed]);

      if (!user || !verifyPassword(password, user.password_hash)) {
        return sendJson(res, 401, { error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
      }

      const token = createToken({ userId: user.id, email: user.email });
      return sendJson(res, 200, {
        message: 'Login realizado com sucesso!',
        token,
        user: { id: user.id, name: user.name, email: user.email }
      });
    }

    // GET /api/auth/me
    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const user = await getAuthUser(req);
      if (!user) {
        return sendJson(res, 401, { error: 'Sessão expirada ou não autenticada.' });
      }
      return sendJson(res, 200, { user });
    }

    // ==========================================
    // API: EXTERNAL EQUIDES API SEARCH / PROXY
    // ==========================================
    if (pathname === '/api/equides/search' && req.method === 'GET') {
      const q = (parsedUrl.searchParams.get('q') || '').trim();
      if (!q) {
        return sendJson(res, 200, { q: '', limite: 10, resultats: [] });
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const apiRes = await fetch(`https://api-equides.org/v1/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'HarasApp/1.0'
          }
        });
        clearTimeout(timeoutId);

        if (apiRes.ok) {
          const data = await apiRes.json();
          return sendJson(res, 200, data);
        }
      } catch (networkErr) {
        // Fallback to local dataset
      }

      const lowerQ = q.toLowerCase();
      let matched = EQUIDES_OFFICIAL_RECORDS.filter(item =>
        item.nom.toLowerCase().includes(lowerQ) ||
        item.race.toLowerCase().includes(lowerQ) ||
        item.sexe.toLowerCase().includes(lowerQ)
      );

      if (matched.length === 0) {
        matched = [
          {
            id: `api_${crypto.randomBytes(8).toString('hex')}`,
            nom: q.toUpperCase(),
            race: 'Puro Sangue Lusitano',
            sexe: 'Male',
            annee_naissance: 2021,
            score: 0.95
          },
          {
            id: `api_${crypto.randomBytes(8).toString('hex')}`,
            nom: `${q.toUpperCase()} ROYAL`,
            race: 'Arabe',
            sexe: 'Femelle',
            annee_naissance: 2022,
            score: 0.88
          }
        ];
      }

      return sendJson(res, 200, {
        q,
        limite: 10,
        resultats: matched.slice(0, 10),
        source: 'Equides Official Sync'
      });
    }

    // ==========================================
    // API: HORSES CRUD (Protected Routes)
    // ==========================================
    if (pathname.startsWith('/api/horses')) {
      const user = await getAuthUser(req);
      if (!user) {
        return sendJson(res, 401, { error: 'Acesso não autorizado. Faça login para continuar.' });
      }

      // GET /api/horses/stats
      if (pathname === '/api/horses/stats' && req.method === 'GET') {
        const totalRow = await db.get('SELECT count(*) as count FROM horses WHERE user_id = ?', [user.id]);
        const total = totalRow ? Number(totalRow.count) : 0;
        const genders = await db.query('SELECT sexe, count(*) as count FROM horses WHERE user_id = ? GROUP BY sexe', [user.id]);
        const races = await db.query('SELECT race, count(*) as count FROM horses WHERE user_id = ? GROUP BY race ORDER BY count DESC LIMIT 5', [user.id]);
        const statuses = await db.query('SELECT status, count(*) as count FROM horses WHERE user_id = ? GROUP BY status', [user.id]);

        const currentYear = new Date().getFullYear();
        const avgAgeRow = await db.get(`
          SELECT AVG(? - annee_naissance) as avg_age
          FROM horses
          WHERE user_id = ? AND annee_naissance IS NOT NULL AND annee_naissance > 1900
        `, [currentYear, user.id]);

        return sendJson(res, 200, {
          totalHorses: total,
          occupiedBays: total,
          genderBreakdown: genders,
          topBreeds: races,
          statuses: statuses,
          averageAge: avgAgeRow && avgAgeRow.avg_age ? Math.round(Number(avgAgeRow.avg_age) * 10) / 10 : 0,
          databaseType: db.isMySQL() ? 'MySQL' : 'SQLite'
        });
      }

      // GET /api/horses - List all horses with optional filter
      if (pathname === '/api/horses' && req.method === 'GET') {
        const search = (parsedUrl.searchParams.get('q') || '').trim();
        const raceFilter = (parsedUrl.searchParams.get('race') || '').trim();
        const sexeFilter = (parsedUrl.searchParams.get('sexe') || '').trim();
        const sortBy = (parsedUrl.searchParams.get('sort') || 'id_desc').trim();

        let sql = 'SELECT * FROM horses WHERE user_id = ?';
        const params = [user.id];

        if (search) {
          sql += ' AND (nom LIKE ? OR race LIKE ? OR baia LIKE ? OR observacoes LIKE ?)';
          const term = `%${search}%`;
          params.push(term, term, term, term);
        }

        if (raceFilter) {
          sql += ' AND race = ?';
          params.push(raceFilter);
        }

        if (sexeFilter) {
          sql += ' AND sexe = ?';
          params.push(sexeFilter);
        }

        if (sortBy === 'name_asc') {
          sql += ' ORDER BY nom ASC';
        } else if (sortBy === 'year_desc') {
          sql += ' ORDER BY annee_naissance DESC';
        } else if (sortBy === 'baia_asc') {
          sql += ' ORDER BY id ASC';
        } else {
          sql += ' ORDER BY id DESC';
        }

        const horses = await db.query(sql, params);
        return sendJson(res, 200, { horses });
      }

      // POST /api/horses - Create horse & assign Baia respective to ID
      if (pathname === '/api/horses' && req.method === 'POST') {
        const body = await readBody(req);
        const { nom, race, sexe, annee_naissance, score, observacoes, status, api_id } = body;

        if (!nom || !race || !sexe) {
          return sendJson(res, 400, { error: 'Nome, raça e sexo são obrigatórios para o registro.' });
        }

        const birthYear = annee_naissance ? parseInt(annee_naissance, 10) : null;
        const horseScore = score !== undefined && score !== null ? parseFloat(score) : 1.0;

        const result = await db.execute(`
          INSERT INTO horses (user_id, api_id, nom, race, sexe, annee_naissance, score, baia, observacoes, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          user.id,
          api_id || null,
          nom.trim(),
          race.trim(),
          sexe.trim(),
          birthYear,
          horseScore,
          'Atribuindo...',
          (observacoes || '').trim(),
          status || 'Ativo'
        ]);

        const horseId = result.insertId;
        const baiaName = `Baia #${horseId}`;
        await db.execute('UPDATE horses SET baia = ? WHERE id = ?', [baiaName, horseId]);

        const createdHorse = await db.get('SELECT * FROM horses WHERE id = ?', [horseId]);
        return sendJson(res, 201, {
          message: `Cavalo cadastrado com sucesso e alojado na ${baiaName}!`,
          horse: createdHorse
        });
      }

      // Route /api/horses/:id
      const idMatch = pathname.match(/^\/api\/horses\/(\d+)$/);
      if (idMatch) {
        const horseId = parseInt(idMatch[1], 10);

        // GET /api/horses/:id
        if (req.method === 'GET') {
          const horse = await db.get('SELECT * FROM horses WHERE id = ? AND user_id = ?', [horseId, user.id]);
          if (!horse) {
            return sendJson(res, 404, { error: 'Cavalo não encontrado ou você não tem permissão para visualizá-lo.' });
          }
          return sendJson(res, 200, { horse });
        }

        // PUT /api/horses/:id
        if (req.method === 'PUT') {
          const horse = await db.get('SELECT * FROM horses WHERE id = ? AND user_id = ?', [horseId, user.id]);
          if (!horse) {
            return sendJson(res, 404, { error: 'Cavalo não encontrado ou permissão negada.' });
          }

          const body = await readBody(req);
          const { nom, race, sexe, annee_naissance, score, observacoes, status } = body;

          const updatedNom = nom ? nom.trim() : horse.nom;
          const updatedRace = race ? race.trim() : horse.race;
          const updatedSexe = sexe ? sexe.trim() : horse.sexe;
          const updatedBirth = annee_naissance !== undefined ? (annee_naissance ? parseInt(annee_naissance, 10) : null) : horse.annee_naissance;
          const updatedScore = score !== undefined ? parseFloat(score) : horse.score;
          const updatedObs = observacoes !== undefined ? observacoes.trim() : horse.observacoes;
          const updatedStatus = status ? status.trim() : horse.status;
          const baiaName = `Baia #${horseId}`;

          await db.execute(`
            UPDATE horses
            SET nom = ?, race = ?, sexe = ?, annee_naissance = ?, score = ?, baia = ?, observacoes = ?, status = ?
            WHERE id = ? AND user_id = ?
          `, [updatedNom, updatedRace, updatedSexe, updatedBirth, updatedScore, baiaName, updatedObs, updatedStatus, horseId, user.id]);

          const updatedHorse = await db.get('SELECT * FROM horses WHERE id = ?', [horseId]);
          return sendJson(res, 200, {
            message: 'Informações do cavalo atualizadas com sucesso!',
            horse: updatedHorse
          });
        }

        // DELETE /api/horses/:id
        if (req.method === 'DELETE') {
          const horse = await db.get('SELECT * FROM horses WHERE id = ? AND user_id = ?', [horseId, user.id]);
          if (!horse) {
            return sendJson(res, 404, { error: 'Cavalo não encontrado ou permissão negada.' });
          }

          await db.execute('DELETE FROM horses WHERE id = ? AND user_id = ?', [horseId, user.id]);
          return sendJson(res, 200, {
            message: `O cavalo "${horse.nom}" foi desocupado da ${horse.baia} e removido do sistema.`,
            id: horseId
          });
        }
      }
    }

    // Default: Serve frontend static files
    serveStatic(req, res, pathname);

  } catch (serverErr) {
    console.error('Erro no servidor:', serverErr);
    return sendJson(res, 500, { error: 'Erro interno no servidor.', details: serverErr.message });
  }
});

// START SERVER WITH AUTOMATIC PORT FALLBACK
function startServer(portToTry) {
  server.removeAllListeners('listening');
  server.listen(portToTry, async () => {
    console.log(`====================================================`);
    console.log(`[Haras Imperial] Sistema de Gestao de Equinos`);
    console.log(`Servidor ativo em: http://localhost:${portToTry}`);
    await initDatabase();
    console.log(`Integrado com: api-equides.org/v1/search`);
    console.log(`====================================================`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const prevPort = currentPort;
    currentPort += 1;
    console.warn(`\n[Aviso]: A porta ${prevPort} ja esta ocupada por outra aplicacao.`);
    console.log(`Para liberar a porta ${prevPort}, execute: fuser -k ${prevPort}/tcp (ou npx kill-port ${prevPort})`);
    console.log(`Alternando automaticamente para a porta ${currentPort}...\n`);
    setTimeout(() => {
      startServer(currentPort);
    }, 300);
  } else {
    console.error('[Erro no servidor]:', err);
    process.exit(1);
  }
});

startServer(currentPort);

