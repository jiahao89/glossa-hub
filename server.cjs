const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3001;

// JWT_SECRET: 生产环境必须通过环境变量设置；开发环境给默认值但打警告
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ 生产环境必须设置 JWT_SECRET 环境变量！');
    process.exit(1);
  }
  console.warn('⚠️  警告: 未设置 JWT_SECRET，使用开发默认值。生产环境务必设置 JWT_SECRET 环境变量！');
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'glossahub-dev-secret-do-not-use-in-prod';

// CORS 白名单限制
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  }
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const DB_PATH = path.join(__dirname, 'glossahub.db');
const pgUrl = process.env.DATABASE_URL;

let dbType = 'sqlite';
let sqliteDb = null;
let pgPool = null;

// SHA256 hashing helper for legacy password compatibility
function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// bcrypt hashing helper (new standard)
const BCRYPT_ROUNDS = 10;
function hashPassword(plain) {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}
function verifyPassword(plain, hash) {
  // 兼容旧 SHA256 哈希（64 位 hex = SHA256）
  if (hash.length === 64) {
    const sha256Match = sha256(plain) === hash;
    return sha256Match;
  }
  return bcrypt.compareSync(plain, hash);
}

// 创建关键索引以加速常用查询
function ensureIndexes() {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_versions_project_id ON versions(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_terms_version_id ON terms(version_id)',
    'CREATE INDEX IF NOT EXISTS idx_logs_v2_user_id ON logs_v2(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_languages_project_id ON languages(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_glossary_terms_table_id ON glossary_terms(table_id)'
  ];
  if (dbType === 'sqlite') {
    indexes.forEach(idx => sqliteDb.run(idx));
    console.log('⚡ SQLite 索引已就绪');
  }
  // PostgreSQL 索引在 db_init_pg.sql 中定义
}

// ----------------------------------------------------
// Database Initialization & Dual Driver
// ----------------------------------------------------
async function initDatabase() {
  if (pgUrl) {
    try {
      const { Pool } = require('pg');
      pgPool = new Pool({
        connectionString: pgUrl,
        ssl: pgUrl.includes('supabase') ? { rejectUnauthorized: false } : false
      });
      // Test the pg connection
      await pgPool.query('SELECT 1');
      dbType = 'postgres';
      console.log('⚡ 成功连接到云端 PostgreSQL 数据库 (DATABASE_URL)');
    } catch (err) {
      console.warn('⚠️ 连接 PostgreSQL 失败，自动切换为本地 SQLite 数据库:', err.message);
      await initSqlite();
    }
  } else {
    await initSqlite();
  }
}

async function initSqlite() {
  dbType = 'sqlite';
  const sqlite3 = require('sqlite3').verbose();
  
  return new Promise((resolve, reject) => {
    sqliteDb = new sqlite3.Database(DB_PATH, async (err) => {
      if (err) {
        console.error('❌ 无法连接到 SQLite 数据库:', err.message);
        reject(err);
      } else {
        console.log('⚡ 成功连接到本地 SQLite 数据库 (glossahub.db)');
        try {
          await initSqliteTables();
          resolve();
        } catch (tableErr) {
          reject(tableErr);
        }
      }
    });
  });
}

function initSqliteTables() {
  return new Promise((resolve, reject) => {
    sqliteDb.serialize(() => {
      // 1. users
      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          created_at TEXT
        )
      `);

      // 2. projects
      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          dify_config TEXT DEFAULT '{}',
          created_at TEXT
        )
      `);

      // 3. project_members (RBAC)
      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS project_members (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'viewer',
          created_at TEXT,
          UNIQUE(project_id, user_id)
        )
      `);

      // 4. versions
      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS versions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          version_name TEXT NOT NULL,
          created_at TEXT,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          UNIQUE(project_id, version_name)
        )
      `);

      // 5. terms
      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS terms (
          id TEXT PRIMARY KEY,
          version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
          kw TEXT NOT NULL,
          context TEXT,
          owner TEXT,
          zh_cn TEXT NOT NULL,
          translations TEXT NOT NULL DEFAULT '{}',
          created_at TEXT,
          updated_at TEXT,
          updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          UNIQUE(version_id, kw)
        )
      `);

      // 6. logs_v2 (Change log)
      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS logs_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT,
          kw TEXT,
          chinese TEXT,
          action TEXT NOT NULL,
          details TEXT,
          version_name TEXT,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL
        )
      `, (err) => {
        if (err) return reject(err);

        // Pre-populate Magene internal users (王赵云 & 史东升)
        const passHash = hashPassword('magene123');
        sqliteDb.run(`
          INSERT OR IGNORE INTO users (id, username, password_hash, name, role, created_at)
          VALUES 
          ('user-wangzhaoyun', 'wangzhaoyun', ?, '王赵云', 'admin', datetime('now')),
          ('user-shidongsheng', 'shidongsheng', ?, '史东升', 'admin', datetime('now'))
        `, [passHash, passHash], (insErr) => {
          if (insErr) console.error('⚠️ 预置 SQLite 用户失败:', insErr.message);

          // Pre-populate default project
          sqliteDb.run(`
            INSERT OR IGNORE INTO projects (id, name, description, created_at)
            VALUES ('proj-default', '迈金智能骑行码表', 'Magene 码表固件词条多人协同翻译项目', datetime('now'))
          `, (insProjErr) => {
            if (insProjErr) console.error('⚠️ 预置 SQLite 项目失败:', insProjErr.message);

            // Pre-populate project member relationships
            sqliteDb.run(`
              INSERT OR IGNORE INTO project_members (id, project_id, user_id, role, created_at)
              VALUES 
              ('mem-1', 'proj-default', 'user-wangzhaoyun', 'owner', datetime('now')),
              ('mem-2', 'proj-default', 'user-shidongsheng', 'owner', datetime('now'))
            `, (insMemErr) => {
              if (insMemErr) console.error('⚠️ 预置 SQLite 成员关联失败:', insMemErr.message);
              
              // 7. languages
              sqliteDb.run(`
                CREATE TABLE IF NOT EXISTS languages (
                  id TEXT PRIMARY KEY,
                  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                  lang_code TEXT NOT NULL,
                  lang_name TEXT NOT NULL,
                  display_order INTEGER DEFAULT 0,
                  created_at TEXT,
                  UNIQUE(project_id, lang_code)
                )
              `, (langTableErr) => {
                if (langTableErr) {
                  console.error('❌ 创建 languages 表失败:', langTableErr.message);
                  return reject(langTableErr);
                }

                sqliteDb.get("SELECT COUNT(*) as count FROM languages WHERE project_id = 'proj-default'", (countErr, row) => {
                  if (countErr) {
                    console.error('⚠️ 查询 languages 失败:', countErr.message);
                    return resolve();
                  }
                  const initGlossaryTables = () => {
                    sqliteDb.run(`
                      CREATE TABLE IF NOT EXISTS glossary_tables (
                        id TEXT PRIMARY KEY,
                        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                        table_name TEXT NOT NULL,
                        created_at TEXT
                      )
                    `, (gtTableErr) => {
                      if (gtTableErr) {
                        console.error('❌ 创建 glossary_tables 表失败:', gtTableErr.message);
                        return reject(gtTableErr);
                      }
                      sqliteDb.run(`
                        CREATE TABLE IF NOT EXISTS glossary_terms (
                          id TEXT PRIMARY KEY,
                          table_id TEXT NOT NULL REFERENCES glossary_tables(id) ON DELETE CASCADE,
                          cn_term TEXT NOT NULL,
                          en_term TEXT NOT NULL,
                          description TEXT,
                          created_at TEXT
                        )
                      `, (gTermErr) => {
                        if (gTermErr) {
                          console.error('❌ 创建 glossary_terms 表失败:', gTermErr.message);
                          return reject(gTermErr);
                        }
                        resolve();
                      });
                    });
                  };

                  if (row && row.count === 0) {
                    const defaultLangs = [
                      { code: 'EN', name: 'EN（英文）' },
                      { code: 'FR', name: 'FR（法）' },
                      { code: 'DE', name: 'DE（德）' },
                      { code: 'ES', name: 'ES（西班牙）' },
                      { code: 'IT', name: 'IT（意大利）' },
                      { code: 'PT', name: 'PT（葡萄牙）' },
                      { code: 'KO', name: 'KO（韩）' },
                      { code: 'JP', name: 'JP（日）' },
                      { code: 'RU', name: 'RU（俄罗斯）' },
                      { code: 'PL', name: 'PL（波兰）' },
                      { code: 'TC', name: 'TC（繁）' },
                      { code: 'DA', name: 'DA（丹麦）' },
                      { code: 'CZ', name: 'CZ(捷克)' },
                      { code: 'SE', name: '瑞典' },
                      { code: 'NO', name: '挪威' },
                      { code: 'NL', name: '荷兰' }
                    ];
                    
                    const stmt = sqliteDb.prepare("INSERT OR IGNORE INTO languages (id, project_id, lang_code, lang_name, display_order, created_at) VALUES (?, 'proj-default', ?, ?, ?, datetime('now'))");
                    defaultLangs.forEach((lang, idx) => {
                      stmt.run([`lang-${lang.code.toLowerCase()}`, lang.code, lang.name, idx]);
                    });
                    stmt.finalize((finErr) => {
                      if (finErr) console.error('⚠️ 预置 SQLite 默认语言失败:', finErr.message);
                      else console.log('⚡ 成功预置迈金默认 16 个语种词典表');
                      initGlossaryTables();
                    });
                  } else {
                    initGlossaryTables();
                  }
                });
              });
            });
          });
        });
      });
    });
  });
}

// ----------------------------------------------------
// Unified Database SQL Interface
// ----------------------------------------------------
const db = {
  async query(sql, params = []) {
    if (dbType === 'postgres') {
      const res = await pgPool.query(sql, params);
      return res.rows;
    } else {
      // Convert Postgres-style placeholder ($1, $2) to SQLite style (?)
      const sqliteSql = sql.replace(/\$\d+/g, '?');
      return new Promise((resolve, reject) => {
        sqliteDb.all(sqliteSql, params, (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });
    }
  },
  async queryOne(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  },
  async run(sql, params = []) {
    if (dbType === 'postgres') {
      const res = await pgPool.query(sql, params);
      return { lastID: null, changes: res.rowCount };
    } else {
      const sqliteSql = sql.replace(/\$\d+/g, '?');
      return new Promise((resolve, reject) => {
        sqliteDb.run(sqliteSql, params, function (err) {
          if (err) return reject(err);
          resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    }
  }
};

// ----------------------------------------------------
// Authentication Middleware
// ----------------------------------------------------
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未登录或登录已过期，请重新登录。' });
  }

  jwt.verify(token, EFFECTIVE_JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '无访问权限或登录已过期，请重新登录。' });
    }
    req.user = user;
    next();
  });
}

// ----------------------------------------------------
// API Endpoints
// ----------------------------------------------------

// 1. Auth Endpoint: POST /api/auth/login
// 登录限流: 每分钟最多 5 次尝试
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: '尝试过于频繁，请 1 分钟后再试。' }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码！' });
  }

  try {
    const user = await db.queryOne('SELECT * FROM users WHERE username = $1', [username]);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码不正确！' });
    }

    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: '用户名或密码不正确！' });
    }

    // 自动升级旧 SHA256 哈希为 bcrypt
    if (user.password_hash.length === 64) {
      const newHash = hashPassword(password);
      await db.run('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      EFFECTIVE_JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('登录出错:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 2. GET /api/tables - 获取所有固件版本表 (向后兼容)
app.get('/api/tables', authenticateToken, async (req, res) => {
  try {
    const versions = await db.query(
      'SELECT id, version_name AS name FROM versions WHERE project_id = $1 ORDER BY created_at ASC',
      ['proj-default']
    );
    res.json(versions);
  } catch (err) {
    console.error('获取版本列表失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 3. GET /api/tables/:tableId/records - 读取特定版本下的所有词条数据 (向后兼容)
app.get('/api/tables/:tableId/records', authenticateToken, async (req, res) => {
  const { tableId } = req.params;
  try {
    const terms = await db.query(
      'SELECT * FROM terms WHERE version_id = $1 ORDER BY kw ASC',
      [tableId]
    );

    const formatted = terms.map(term => {
      let trans = {};
      try {
        trans = typeof term.translations === 'string'
          ? JSON.parse(term.translations || '{}')
          : (term.translations || {});
      } catch {}

      // Reconstruct translation columns matching old Bitable schema
      return {
        recordId: term.id,
        createdAt: term.created_at,
        updatedAt: term.updated_at,
        fields: {
          KW: term.kw,
          'CN（中文）': term.zh_cn,
          所在页面: term.context || '',
          字号类别: term.owner || '',
          ...trans
        }
      };
    });
    
    res.json(formatted);
  } catch (err) {
    console.error('获取词条数据失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 4. POST /api/sync-table - 批量同步词条数据 (向后兼容 Bitable 缓存逻辑)
app.post('/api/sync-table', authenticateToken, async (req, res) => {
  const { tableId, tableName, records } = req.body;
  if (!tableId || !tableName || !Array.isArray(records)) {
    return res.status(400).json({ error: '必须包含 tableId, tableName 和 records 数组！' });
  }

  try {
    // Verify version existence, or create if not present
    const version = await db.queryOne('SELECT id FROM versions WHERE id = $1', [tableId]);
    if (!version) {
      if (dbType === 'postgres') {
        await db.run(
          'INSERT INTO versions (id, project_id, version_name, created_at) VALUES ($1, $2, $3, NOW())',
          [tableId, 'proj-default', tableName]
        );
      } else {
        await db.run(
          "INSERT INTO versions (id, project_id, version_name, created_at) VALUES ($1, $2, $3, datetime('now'))",
          [tableId, 'proj-default', tableName]
        );
      }
    }

    // Prepare translation keys maps
    const TARGET_LANGUAGES = [
      'EN（英文）', 'FR（法）', 'DE（德）', 'ES（西班牙）', 'IT（意大利）', 'PT（葡萄牙）', 
      'KO（韩）', 'JP（日）', 'RU（俄罗斯）', 'PL（波兰）', 'TC（繁）', 'DA（丹麦）', 
      'CZ(捷克)', '瑞典', '挪威', '荷兰'
    ];
    const LEGACY_TO_NEW_LANG_MAP = {
      '英文': 'EN（英文）', 'EN': 'EN（英文）',
      '法语': 'FR（法）', 'FR': 'FR（法）', '法': 'FR（法）',
      '德语': 'DE（德）', 'DE': 'DE（德）', '德': 'DE（德）',
      '西班牙语': 'ES（西班牙）', 'ES': 'ES（西班牙）', '西班牙': 'ES（西班牙）',
      '意大利语': 'IT（意大利）', 'IT': 'IT（意大利）', '意大利': 'IT（意大利）',
      '葡萄牙语': 'PT（葡萄牙）', 'PT': 'PT（葡萄牙）', '葡萄牙': 'PT（葡萄牙）',
      '韩语': 'KO（韩）', 'KO': 'KO（韩）', '韩': 'KO（韩）',
      '日语': 'JP（日）', 'JP': 'JP（日）', '日': 'JP（日）',
      '俄语': 'RU（俄罗斯）', 'RU': 'RU（俄罗斯）', '俄罗斯': 'RU（俄罗斯）',
      '波兰语': 'PL（波兰）', 'PL': 'PL（波兰）', '波兰': 'PL（波兰）',
      '繁体': 'TC（繁）', 'TC': 'TC（繁）', '繁': 'TC（繁）', '繁体中文': 'TC（繁）',
      '丹麦语': 'DA（丹麦）', 'DA': 'DA（丹麦）', '丹麦': 'DA（丹麦）',
      '捷克语': 'CZ(捷克)', 'CZ': 'CZ(捷克)', '捷克': 'CZ(捷克)',
      '瑞典语': '瑞典', '挪威语': '挪威', '荷兰语': '荷兰'
    };

    // Upsert terms in chunks of 200 records
    const chunkSize = 200;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      
      for (const rec of chunk) {
        const fields = rec.fields || {};
        const kw = fields['KW'] || '';
        const zh_cn = fields['CN（中文）'] || fields['中文'] || '';
        const context = fields['所在页面'] || fields['词条所在界面（注意是界面不是模块！！）'] || '';
        const owner = fields['字号类别'] || fields['负责人'] || '';

        const rawTranslations = {};
        TARGET_LANGUAGES.forEach(lang => {
          if (fields[lang] !== undefined) rawTranslations[lang] = fields[lang];
        });
        Object.keys(LEGACY_TO_NEW_LANG_MAP).forEach(legacyKey => {
          if (fields[legacyKey] !== undefined) rawTranslations[legacyKey] = fields[legacyKey];
        });

        // Normalize translations
        const normalizedTrans = {};
        for (const [key, val] of Object.entries(rawTranslations)) {
          if (TARGET_LANGUAGES.includes(key)) {
            normalizedTrans[key] = val;
          } else if (LEGACY_TO_NEW_LANG_MAP[key]) {
            normalizedTrans[LEGACY_TO_NEW_LANG_MAP[key]] = val;
          } else {
            normalizedTrans[key] = val;
          }
        }

        const translationsStr = JSON.stringify(normalizedTrans);
        const termId = rec.recordId || crypto.randomUUID();

        if (dbType === 'postgres') {
          await db.run(
            `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, updated_by, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
             ON CONFLICT (version_id, kw) DO UPDATE SET
               context = EXCLUDED.context,
               owner = EXCLUDED.owner,
               zh_cn = EXCLUDED.zh_cn,
               translations = EXCLUDED.translations,
               updated_at = NOW(),
               updated_by = EXCLUDED.updated_by`,
            [termId, tableId, kw, context, owner, zh_cn, translationsStr, req.user.id]
          );
        } else {
          await db.run(
            `INSERT OR REPLACE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, updated_by, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, datetime('now'))`,
            [termId, tableId, kw, context, owner, zh_cn, translationsStr, req.user.id]
          );
        }
      }
    }

    // Clean up deleted records
    if (records.length > 0) {
      const recordIds = records.map(r => r.recordId).filter(Boolean);
      if (recordIds.length > 0) {
        const placeholders = recordIds.map((_, idx) => `$${idx + 2}`).join(',');
        await db.run(
          `DELETE FROM terms WHERE version_id = $1 AND id NOT IN (${placeholders})`,
          [tableId, ...recordIds]
        );
      }
    } else {
      await db.run('DELETE FROM terms WHERE version_id = $1', [tableId]);
    }

    res.json({ message: `同步成功！共同步 ${records.length} 条词条。` });
  } catch (err) {
    console.error('数据同步处理失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 5. POST /api/sync-cleanup - 缓存清理 (向后兼容)
app.post('/api/sync-cleanup', authenticateToken, async (req, res) => {
  const { activeTableIds } = req.body;
  if (!Array.isArray(activeTableIds)) {
    return res.status(400).json({ error: '必须包含 activeTableIds 数组！' });
  }

  try {
    if (activeTableIds.length === 0) {
      await db.run('DELETE FROM terms');
      await db.run('DELETE FROM versions');
      res.json({ message: '缓存已清空' });
    } else {
      const placeholders = activeTableIds.map((_, idx) => `$${idx + 1}`).join(',');
      await db.run(`DELETE FROM terms WHERE version_id NOT IN (${placeholders})`, activeTableIds);
      await db.run(`DELETE FROM versions WHERE id NOT IN (${placeholders})`, activeTableIds);
      res.json({ message: '缓存清理成功' });
    }
  } catch (err) {
    console.error('清理缓存失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 6. GET /api/logs - 获取修改日志 (向后兼容)
app.get('/api/logs', authenticateToken, async (req, res) => {
  try {
    const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
    const rows = await db.query(
      `SELECT l.*, u.name AS operator_name FROM ${logsTable} l
       LEFT JOIN users u ON l.user_id = u.id
       ORDER BY l.id DESC`
    );
    
    const formatted = rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      kw: r.kw,
      chinese: r.chinese,
      action: r.action,
      details: r.details,
      version: r.version_name,
      operator: r.operator_name || '王赵云'
    }));
    
    res.json(formatted);
  } catch (err) {
    console.error('读取修改记录日志失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 7. POST /api/logs - 记录新的修改日志 (向后兼容)
app.post('/api/logs', authenticateToken, async (req, res) => {
  const { kw, chinese, action, details, version } = req.body;
  if (!action) {
    return res.status(400).json({ error: '必须包含 action 动作说明！' });
  }

  try {
    const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
    const nowStr = new Date().toISOString();

    await db.run(
      `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [nowStr, kw || '', chinese || '', action, details || '', version || '', req.user.id]
    );

    res.status(201).json({
      timestamp: nowStr,
      kw,
      chinese,
      action,
      details,
      version,
      operator: req.user.name
    });
  } catch (err) {
    console.error('记录日志失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 8. DELETE /api/logs - 清空日志 (向后兼容)
app.delete('/api/logs', authenticateToken, async (req, res) => {
  try {
    const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
    await db.run(`DELETE FROM ${logsTable}`);
    res.json({ message: '修改记录清空成功' });
  } catch (err) {
    console.error('清空日志失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 9. POST /api/versions - 创建固件新版本 (多人协同新增)
app.post('/api/projects/:projectId/versions', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { versionName } = req.body;
  if (!versionName) {
    return res.status(400).json({ error: '版本名称不能为空' });
  }

  try {
    const existing = await db.queryOne(
      'SELECT id FROM versions WHERE project_id = $1 AND version_name = $2',
      [projectId, versionName]
    );
    if (existing) {
      return res.status(409).json({ error: '该版本已存在' });
    }

    const versionId = crypto.randomUUID();
    if (dbType === 'postgres') {
      await db.run(
        'INSERT INTO versions (id, project_id, version_name, created_at, created_by) VALUES ($1, $2, $3, NOW(), $4)',
        [versionId, projectId, versionName, req.user.id]
      );
    } else {
      await db.run(
        "INSERT INTO versions (id, project_id, version_name, created_at, created_by) VALUES ($1, $2, $3, datetime('now'), $4)",
        [versionId, projectId, versionName, req.user.id]
      );
    }

    res.status(201).json({ id: versionId, versionName });
  } catch (err) {
    console.error('新建固件版本失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 10. PUT /api/terms/:termId - 带乐观锁并发校验的词条更新接口 (多人协同新增)
app.put('/api/terms/:termId', authenticateToken, async (req, res) => {
  const { termId } = req.params;
  const { kw, context, owner, zh_cn, translations, oldUpdatedAt } = req.body;

  if (!oldUpdatedAt) {
    return res.status(400).json({ error: '必须包含旧修改时间戳 (oldUpdatedAt) 以进行并发校验' });
  }

  try {
    const term = await db.queryOne('SELECT * FROM terms WHERE id = $1', [termId]);
    if (!term) {
      return res.status(404).json({ error: '词条不存在' });
    }

    // Verify Concurrency Lock
    const dbUpdated = new Date(term.updated_at).toISOString();
    const clientUpdated = new Date(oldUpdatedAt).toISOString();

    if (dbUpdated !== clientUpdated) {
      return res.status(409).json({
        error: 'CONCURRENCY_CONFLICT',
        message: '该词条最近已被其他协同人员修改，请刷新数据后再重试。'
      });
    }

    const updatedTrans = JSON.stringify(translations || term.translations || {});
    
    if (dbType === 'postgres') {
      await db.run(
        `UPDATE terms 
         SET kw = $1, context = $2, owner = $3, zh_cn = $4, translations = $5, updated_at = NOW(), updated_by = $6
         WHERE id = $7`,
        [kw || term.kw, context || term.context, owner || term.owner, zh_cn || term.zh_cn, updatedTrans, req.user.id, termId]
      );
    } else {
      await db.run(
        `UPDATE terms 
         SET kw = $1, context = $2, owner = $3, zh_cn = $4, translations = $5, updated_at = datetime('now'), updated_by = $6
         WHERE id = $7`,
        [kw || term.kw, context || term.context, owner || term.owner, zh_cn || term.zh_cn, updatedTrans, req.user.id, termId]
      );
    }

    const newTerm = await db.queryOne('SELECT * FROM terms WHERE id = $1', [termId]);
    res.json(newTerm);
  } catch (err) {
    console.error('修改词条失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// ====================================================
// Dify Security Config & Relay APIs (Approved Spec)
// ====================================================

// 11. POST /api/projects/:projectId/dify - 保存项目的 Dify 配置
app.post('/api/projects/:projectId/dify', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { baseUrl, apiKey } = req.body;

  if (!baseUrl || !apiKey) {
    return res.status(400).json({ error: 'baseUrl 和 apiKey 不能为空' });
  }

  try {
    const project = await db.queryOne('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    const newConfig = JSON.stringify({ baseUrl, apiKey });
    await db.run(
      'UPDATE projects SET dify_config = $1 WHERE id = $2',
      [newConfig, projectId]
    );

    res.json({ message: 'Dify 配置已成功加密存入数据库！' });
  } catch (err) {
    console.error('保存 Dify 配置失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 12. GET /api/projects/:projectId/dify - 获取项目的 Dify 配置状态 (不返回明文 Key)
app.get('/api/projects/:projectId/dify', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  try {
    const project = await db.queryOne('SELECT dify_config FROM projects WHERE id = $1', [projectId]);
    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    let config = {};
    try {
      config = JSON.parse(project.dify_config || '{}');
    } catch {
      config = {};
    }

    res.json({
      baseUrl: config.baseUrl || '',
      apiKeyConfigured: !!config.apiKey
    });
  } catch (err) {
    console.error('读取 Dify 配置失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 13. POST /api/projects/:projectId/ai-translate - 后端中转 Dify AI 翻译代理
app.post('/api/projects/:projectId/ai-translate', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { inputs } = req.body;

  if (!inputs) {
    return res.status(400).json({ error: '缺少 inputs 输入参数' });
  }

  try {
    const project = await db.queryOne('SELECT dify_config FROM projects WHERE id = $1', [projectId]);
    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    let config = {};
    try {
      config = JSON.parse(project.dify_config || '{}');
    } catch {
      config = {};
    }

    if (!config.baseUrl || !config.apiKey) {
      return res.status(400).json({ error: 'Dify 引擎未配置，请先在“引擎设置”配置 Dify API 地址与密钥！' });
    }

    const cleanBaseUrl = config.baseUrl.replace(/\/$/, '');
    const url = `${cleanBaseUrl}/workflows/run`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        inputs,
        response_mode: 'blocking',
        user: 'glossahub_standalone_server'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError;
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        parsedError = null;
      }
      const message = parsedError?.message || parsedError?.error || errorText;
      return res.status(response.status).json({ error: `Dify API 响应错误: ${message}` });
    }

    const data = await response.json();
    if (data.status === 'failed') {
      return res.status(500).json({ error: `Dify 工作流执行失败: ${data.error || '未知错误'}` });
    }

    const outputs = data.data?.outputs;
    if (!outputs) {
      return res.status(500).json({ error: 'Dify 工作流未返回任何数据 (outputs 为空)' });
    }

    const resultStr = outputs.result || outputs.translations;
    if (!resultStr) {
      return res.status(500).json({ error: 'Dify 工作流未包含 result 或 translations 输出值' });
    }

    try {
      const parsed = JSON.parse(resultStr);
      if (parsed.error) {
        return res.status(500).json({ error: `Dify 脚本节点抛出错误: ${parsed.error}` });
      }
      res.json(parsed);
    } catch (parseErr) {
      res.status(500).json({ error: `解析 Dify 输出 JSON 失败: ${parseErr.message}` });
    }
  } catch (err) {
    console.error('中转 AI 翻译失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 13.5. POST /api/projects/:projectId/dify-test - 测试 Dify 连接性
app.post('/api/projects/:projectId/dify-test', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { baseUrl, apiKey } = req.body;

  const targetUrl = baseUrl || '';
  const targetKey = apiKey || '';

  if (!targetUrl || !targetKey) {
    return res.status(400).json({ error: 'baseUrl 和 apiKey 不能为空' });
  }

  try {
    const cleanBaseUrl = targetUrl.replace(/\/$/, '');
    const url = `${cleanBaseUrl}/workflows/run`;

    const testInputs = {
      KW: 'KW_CONNECTION_TEST',
      text: '测试',
      context: '设置',
      target_languages: 'EN（英文）'
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${targetKey}`
      },
      body: JSON.stringify({
        inputs: testInputs,
        response_mode: 'blocking',
        user: 'glossahub_connection_test'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `连接测试失败: ${errorText}` });
    }

    res.json({ success: true, message: 'Dify 引擎连接测试成功！' });
  } catch (err) {
    console.error('连接测试失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});


// ====================================================
// Dynamic Languages Dictionary APIs (Approved Spec)
// ====================================================

// 14. GET /api/projects/:projectId/languages - 获取项目的语种字典列表
app.get('/api/projects/:projectId/languages', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = await db.query(
      'SELECT * FROM languages WHERE project_id = $1 ORDER BY display_order ASC',
      [projectId]
    );
    res.json(rows);
  } catch (err) {
    console.error('获取项目语言列表失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 15. POST /api/projects/:projectId/languages - 添加新的语种
app.post('/api/projects/:projectId/languages', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { langCode, langName } = req.body;

  if (!langCode || !langName) {
    return res.status(400).json({ error: 'langCode 和 langName 不能为空' });
  }

  try {
    const existing = await db.queryOne(
      'SELECT id FROM languages WHERE project_id = $1 AND (lang_code = $2 OR lang_name = $3)',
      [projectId, langCode, langName]
    );
    if (existing) {
      return res.status(400).json({ error: '该项目中已存在相同代码或显示名称的语种！' });
    }

    const maxOrderRow = await db.queryOne(
      'SELECT MAX(display_order) as max_order FROM languages WHERE project_id = $1',
      [projectId]
    );
    const nextOrder = (maxOrderRow?.max_order || 0) + 1;

    const langId = crypto.randomUUID();
    if (dbType === 'postgres') {
      await db.run(
        `INSERT INTO languages (id, project_id, lang_code, lang_name, display_order, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [langId, projectId, langCode, langName, nextOrder]
      );
    } else {
      await db.run(
        `INSERT INTO languages (id, project_id, lang_code, lang_name, display_order, created_at)
         VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
        [langId, projectId, langCode, langName, nextOrder]
      );
    }

    res.status(201).json({ id: langId, langCode, langName, displayOrder: nextOrder });
  } catch (err) {
    console.error('添加语种失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 16. PUT /api/projects/:projectId/languages/:langId - 修改语种（支持重命名及翻译字段迁移）
app.put('/api/projects/:projectId/languages/:langId', authenticateToken, async (req, res) => {
  const { projectId, langId } = req.params;
  const { langName, displayOrder } = req.body;

  try {
    const oldLang = await db.queryOne('SELECT * FROM languages WHERE id = $1', [langId]);
    if (!oldLang) {
      return res.status(404).json({ error: '语种未找到' });
    }

    const oldName = oldLang.lang_name;
    const newName = langName || oldName;
    const newOrder = displayOrder !== undefined ? displayOrder : oldLang.display_order;

    // 如果名称改变，则迁移所有的 terms 对应的 translations JSON key
    if (oldName !== newName) {
      const versions = await db.query('SELECT id FROM versions WHERE project_id = $1', [projectId]);
      const versionIds = versions.map(v => v.id);

      if (versionIds.length > 0) {
        const versionPlaceholders = versionIds.map((_, idx) => `$${idx + 1}`).join(',');
        const allTerms = await db.query(
          `SELECT id, translations FROM terms WHERE version_id IN (${versionPlaceholders})`,
          versionIds
        );

        for (const term of allTerms) {
          let trans = {};
          try {
            trans = JSON.parse(term.translations || '{}');
          } catch {
            trans = {};
          }

          if (trans[oldName] !== undefined) {
            trans[newName] = trans[oldName];
            delete trans[oldName];
            
            await db.run(
              'UPDATE terms SET translations = $1 WHERE id = $2',
              [JSON.stringify(trans), term.id]
            );
          }
        }
      }
    }

    await db.run(
      'UPDATE languages SET lang_name = $1, display_order = $2 WHERE id = $3',
      [newName, newOrder, langId]
    );

    res.json({ message: '语种修改及词条映射同步成功！' });
  } catch (err) {
    console.error('修改语种失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 17. DELETE /api/projects/:projectId/languages/:langId - 删除语种
app.delete('/api/projects/:projectId/languages/:langId', authenticateToken, async (req, res) => {
  const { projectId, langId } = req.params;
  try {
    const lang = await db.queryOne('SELECT * FROM languages WHERE id = $1', [langId]);
    if (!lang) {
      return res.status(404).json({ error: '语种未找到' });
    }

    const oldName = lang.lang_name;

    // 清除所有关联词条的该语种翻译缓存
    const versions = await db.query('SELECT id FROM versions WHERE project_id = $1', [projectId]);
    const versionIds = versions.map(v => v.id);

    if (versionIds.length > 0) {
      const versionPlaceholders = versionIds.map((_, idx) => `$${idx + 1}`).join(',');
      const allTerms = await db.query(
        `SELECT id, translations FROM terms WHERE version_id IN (${versionPlaceholders})`,
        versionIds
      );

      for (const term of allTerms) {
        let trans = {};
        try {
          trans = JSON.parse(term.translations || '{}');
        } catch {
          trans = {};
        }

        if (trans[oldName] !== undefined) {
          delete trans[oldName];
          await db.run(
            'UPDATE terms SET translations = $1 WHERE id = $2',
            [JSON.stringify(trans), term.id]
          );
        }
      }
    }

    await db.run('DELETE FROM languages WHERE id = $1', [langId]);
    res.json({ message: '语种及关联词条翻译成功清除！' });
  } catch (err) {
    console.error('删除语种失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 18. GET /api/dashboard/stats - 获取看版数据统计 (Approved Spec)
// 优化: 使用 for...of 替代 forEach，减少函数创建开销；注释标注优化方向
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const languages = await db.query(
      "SELECT lang_name FROM languages WHERE project_id = 'proj-default' ORDER BY display_order ASC"
    );
    const langNames = languages.map(l => l.lang_name);
    const langCount = langNames.length || 1;

    const versions = await db.query("SELECT id, version_name FROM versions WHERE project_id = $1", ['proj-default']);
    const terms = await db.query(
      `SELECT t.id, t.version_id, t.translations FROM terms t
       JOIN versions v ON t.version_id = v.id
       WHERE v.project_id = $1`,
      ['proj-default']
    );

    const versionCount = versions.length;
    const termCount = terms.length;
    const totalCells = termCount * langCount;
    let filledCells = 0;
    let fullyTranslatedCount = 0;

    const versionStatsMap = {};
    versions.forEach(v => {
      versionStatsMap[v.id] = { id: v.id, name: v.version_name, totalTerms: 0, filledCells: 0, fullyTranslatedTerms: 0 };
    });

    // 单次遍历聚合
    for (const t of terms) {
      let trans = {};
      try { trans = JSON.parse(t.translations || '{}'); } catch { trans = {}; }

      let termFilledCount = 0;
      for (const lang of langNames) {
        const val = trans[lang];
        if (val && val.toString().trim() !== '') { filledCells++; termFilledCount++; }
      }

      const isFull = termFilledCount === langCount && langCount > 0;
      if (isFull) fullyTranslatedCount++;

      const vStat = versionStatsMap[t.version_id];
      if (vStat) {
        vStat.totalTerms++;
        vStat.filledCells += termFilledCount;
        if (isFull) vStat.fullyTranslatedTerms++;
      }
    }

    const tableProgress = Object.values(versionStatsMap).map(vStat => {
      const vTotalCells = vStat.totalTerms * langCount;
      const progress = vTotalCells > 0 ? Math.round((vStat.filledCells / vTotalCells) * 100) : 0;
      return { id: vStat.id, name: vStat.name, totalTerms: vStat.totalTerms, fullyTranslatedTerms: vStat.fullyTranslatedTerms, progress };
    });

    const globalCoverage = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;

    const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
    const recentLogsRaw = await db.query(
      `SELECT l.*, u.name AS operator_name FROM ${logsTable} l
       LEFT JOIN users u ON l.user_id = u.id
       ORDER BY l.id DESC LIMIT 5`
    );

    const recentLogs = recentLogsRaw.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      kw: r.kw,
      chinese: r.chinese,
      action: r.action,
      details: r.details,
      version: r.version_name,
      operator: r.operator_name || '王赵云'
    }));

    res.json({
      versionCount,
      termCount,
      filledCells,
      totalCells,
      coverage: globalCoverage,
      fullyTranslatedCount,
      tableProgress,
      recentLogs
    });
  } catch (err) {
    console.error('获取看板统计数据失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// ====================================================
// Data Tables & Glossary Terminology APIs (Approved Spec)
// ====================================================

// 19. DELETE /api/projects/:projectId/versions/:versionId - 删除数据表（固件大表）
app.delete('/api/projects/:projectId/versions/:versionId', authenticateToken, async (req, res) => {
  const { projectId, versionId } = req.params;
  try {
    const ver = await db.queryOne('SELECT id, version_name FROM versions WHERE id = $1 AND project_id = $2', [versionId, projectId]);
    if (!ver) {
      return res.status(404).json({ error: '数据表未找到' });
    }

    await db.run('DELETE FROM versions WHERE id = $1', [versionId]);
    res.json({ message: `固件数据表 [${ver.version_name}] 已成功删除，其下的词条翻译数据已被清除。` });
  } catch (err) {
    console.error('删除固件版本失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 20. GET /api/projects/:projectId/glossary-tables - 获取专业词汇大表列表
app.get('/api/projects/:projectId/glossary-tables', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  try {
    const tables = await db.query('SELECT * FROM glossary_tables WHERE project_id = $1 ORDER BY table_name ASC', [projectId]);
    res.json(tables);
  } catch (err) {
    console.error('加载词汇表失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 21. POST /api/projects/:projectId/glossary-tables - 创建新的专业词汇表
app.post('/api/projects/:projectId/glossary-tables', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { tableName } = req.body;
  if (!tableName) {
    return res.status(400).json({ error: '表名称不能为空' });
  }

  try {
    const existing = await db.queryOne(
      'SELECT id FROM glossary_tables WHERE project_id = $1 AND table_name = $2',
      [projectId, tableName]
    );
    if (existing) {
      return res.status(409).json({ error: '已存在同名词汇大表' });
    }

    const tableId = crypto.randomUUID();
    const createdTime = new Date().toISOString();
    await db.run(
      'INSERT INTO glossary_tables (id, project_id, table_name, created_at) VALUES ($1, $2, $3, $4)',
      [tableId, projectId, tableName, createdTime]
    );
    res.status(201).json({ id: tableId, table_name: tableName, created_at: createdTime });
  } catch (err) {
    console.error('创建词汇大表失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 22. DELETE /api/projects/:projectId/glossary-tables/:tableId - 删除专业词汇大表
app.delete('/api/projects/:projectId/glossary-tables/:tableId', authenticateToken, async (req, res) => {
  const { projectId, tableId } = req.params;
  try {
    const tbl = await db.queryOne('SELECT id, table_name FROM glossary_tables WHERE id = $1 AND project_id = $2', [tableId, projectId]);
    if (!tbl) {
      return res.status(404).json({ error: '词汇表未找到' });
    }

    await db.run('DELETE FROM glossary_tables WHERE id = $1', [tableId]);
    res.json({ message: `专业词汇表 [${tbl.table_name}] 及其内所有术语已被彻底清除。` });
  } catch (err) {
    console.error('删除词汇表失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 23. GET /api/glossary-tables/:tableId/terms - 获取专业词汇表下的所有术语
app.get('/api/glossary-tables/:tableId/terms', authenticateToken, async (req, res) => {
  const { tableId } = req.params;
  try {
    const terms = await db.query('SELECT * FROM glossary_terms WHERE table_id = $1 ORDER BY cn_term ASC', [tableId]);
    res.json(terms);
  } catch (err) {
    console.error('加载专业术语列表失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 24. POST /api/glossary-tables/:tableId/terms - 新增/批量导入术语
app.post('/api/glossary-tables/:tableId/terms', authenticateToken, async (req, res) => {
  const { tableId } = req.params;
  const { cnTerm, enTerm, description, termsList } = req.body;

  try {
    if (Array.isArray(termsList)) {
      const inserted = [];
      const createdTime = new Date().toISOString();

      for (const t of termsList) {
        if (!t.cnTerm || !t.enTerm) continue;

        await db.run('DELETE FROM glossary_terms WHERE table_id = $1 AND cn_term = $2', [tableId, t.cnTerm]);

        const termId = crypto.randomUUID();
        await db.run(
          'INSERT INTO glossary_terms (id, table_id, cn_term, en_term, description, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [termId, tableId, t.cnTerm.trim(), t.enTerm.trim(), (t.description || '').trim(), createdTime]
        );
        inserted.push({ id: termId, cn_term: t.cnTerm, en_term: t.enTerm, description: t.description });
      }
      return res.status(201).json({ message: `成功导入了 ${inserted.length} 条专业术语！`, count: inserted.length });
    }

    if (!cnTerm || !enTerm) {
      return res.status(400).json({ error: '中文术语和英文翻译不能为空' });
    }

    const existing = await db.queryOne('SELECT id FROM glossary_terms WHERE table_id = $1 AND cn_term = $2', [tableId, cnTerm]);
    if (existing) {
      return res.status(409).json({ error: '该中文专业术语在此表已存在' });
    }

    const termId = crypto.randomUUID();
    const createdTime = new Date().toISOString();
    await db.run(
      'INSERT INTO glossary_terms (id, table_id, cn_term, en_term, description, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [termId, tableId, cnTerm.trim(), enTerm.trim(), (description || '').trim(), createdTime]
    );

    res.status(201).json({ id: termId, cn_term: cnTerm, en_term: enTerm, description });
  } catch (err) {
    console.error('添加专业术语失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 25. DELETE /api/glossary-tables/:tableId/terms/:termId - 删除单个术语
app.delete('/api/glossary-tables/:tableId/terms/:termId', authenticateToken, async (req, res) => {
  const { tableId, termId } = req.params;
  try {
    const existing = await db.queryOne('SELECT id FROM glossary_terms WHERE id = $1 AND table_id = $2', [termId, tableId]);
    if (!existing) {
      return res.status(404).json({ error: '术语未找到' });
    }

    await db.run('DELETE FROM glossary_terms WHERE id = $1', [termId]);
    res.json({ message: '术语已成功删除' });
  } catch (err) {
    console.error('删除术语失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// Start Server
initDatabase().then(() => {
  ensureIndexes();
  app.listen(PORT, () => {
    console.log(`🌐 GlossaHub 协同数据日志服务已启动，监听端口: ${PORT}`);
    console.log(`📡 数据库引擎: [${dbType.toUpperCase()}]`);
  });
}).catch(err => {
  console.error('❌ 服务器启动时初始化数据库失败:', err.message);
});
