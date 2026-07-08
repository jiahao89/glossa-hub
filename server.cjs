// Load .env file if present (for local development)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3001;

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

// Dify 默认配置：通过环境变量注入，不硬编码在源码中。
// 部署时在 Render/本地 .env 设置 DIFY_BASE_URL 和 DIFY_API_KEY。
const DEFAULT_DIFY_CONFIG = {
  baseUrl: process.env.DIFY_BASE_URL || 'https://api.dify.ai/v1',
  apiKey: process.env.DIFY_API_KEY || ''
};

// 获取生效的 Dify 配置：优先使用数据库中用户覆盖的配置，否则回退到默认
async function getEffectiveDifyConfig(projectId) {
  try {
    const project = await db.queryOne('SELECT dify_config FROM projects WHERE id = $1', [projectId]);
    if (project && project.dify_config) {
      let cfg = {};
      if (typeof project.dify_config === 'object') {
        cfg = project.dify_config;
      } else {
        cfg = JSON.parse(project.dify_config || '{}');
      }
      if (cfg.baseUrl && cfg.apiKey) {
        return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, isCustom: true };
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_DIFY_CONFIG, isCustom: false };
}

// CORS 白名单限制
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // 仅返回 false 拒绝跨域头，防止抛出 Error 导致 Express 渲染 500 HTML 报错页
      callback(null, false);
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
let pgError = null;
let pgDebug = null;// SHA256 hashing helper for legacy password compatibility
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
      const { parse } = require('pg-connection-string');
      const dns = require('dns');

      const pgConfig = parse(pgUrl);

      // 强力正则兜底解析：当密码含 @ 特殊字符且未完全 URL 编码时，内置 parse 会发生截断
      // 我们通过贪婪匹配最后一个 @ 符号来精准提取出完整的密码与连接信息
      const regexMatch = pgUrl.match(/postgres(?:ql)?:\/\/([^:]+):(.*)@([^:\/]+):([0-9]+)\/([^?]+)/);
      if (regexMatch) {
        pgConfig.user = regexMatch[1];
        pgConfig.password = regexMatch[2];
        pgConfig.host = regexMatch[3];
        pgConfig.port = regexMatch[4];
        pgConfig.database = regexMatch[5].split('?')[0];
        console.log('📝 已通过正则安全还原可能存在截断的 PG 账号及密码信息');
      }

      // 解密/还原被 URL 编码后的特殊字符密码（例如将 %40 还原回 @）
      if (pgConfig.password) {
        try {
          pgConfig.password = decodeURIComponent(pgConfig.password);
        } catch (decErr) {
          // 忽略
        }
      }

      // 自动将 Supabase 直连地址重写为 Session/Transaction Pooler (IPv4)
      // 直连地址只解析到 IPv6，Render 不支持 IPv6 (ENETUNREACH)
      // 官方为该项目分配了 aws-1-ap-northeast-2.pooler.supabase.com:6543 终点
      const directMatch = pgConfig.host && pgConfig.host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
      if (directMatch) {
        const projectRef = directMatch[1];
        pgConfig.host = 'aws-1-ap-northeast-2.pooler.supabase.com';
        pgConfig.port = '6543';
        pgConfig.user = `postgres.${projectRef}`;
        console.log(`🔧 Supabase 直连→Pooler 重写: ${projectRef} ➔ aws-1-ap-northeast-2.pooler.supabase.com:6543`);
      }

      // 如果填入了错误的 aws-0- 连接池，自动将其修正为真实的 aws-1- 节点并使用 6543 端口
      if (pgConfig.host === 'aws-0-ap-northeast-2.pooler.supabase.com') {
        pgConfig.host = 'aws-1-ap-northeast-2.pooler.supabase.com';
        pgConfig.port = '6543';
        console.log('🔧 自动将 aws-0-ap-northeast-2.pooler.supabase.com 重定向至官方可用节点: aws-1-ap-northeast-2.pooler.supabase.com:6543');
      }

      const servername = pgConfig.host || undefined;
      pgConfig.ssl = pgUrl.includes('supabase') ? { rejectUnauthorized: false, servername } : false;

      // 连接池参数：防止空闲连接被云端网络层回收导致 ECONNRESET
      pgConfig.max = 5;
      pgConfig.idleTimeoutMillis = 30000;
      pgConfig.connectionTimeoutMillis = 10000;

      // 记录调试信息（不含密码）
      pgDebug = { host: pgConfig.host, port: pgConfig.port, user: pgConfig.user, database: pgConfig.database, sslServername: servername };
      console.log('🔍 PG 连接配置:', JSON.stringify(pgDebug));

      pgPool = new Pool(pgConfig);

      // 监听连接池错误，防止空闲连接报错导致进程崩溃
      pgPool.on('error', (err) => {
        console.error('⚠️ PG 连接池空闲连接错误 (已自动恢复):', err.message);
      });
      
      // Test the pg connection
      await pgPool.query('SELECT 1');
      dbType = 'postgres';
      console.log('⚡ 成功连接到云端 PostgreSQL 数据库 (DATABASE_URL)');
    } catch (err) {
      pgError = err.message;
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
          translations_meta TEXT NOT NULL DEFAULT '{}',
          created_at TEXT,
          updated_at TEXT,
          updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          is_locked INTEGER DEFAULT 0,
          locked_by TEXT,
          locked_at TEXT,
          status TEXT DEFAULT 'DRAFT',
          reject_reason TEXT,
          UNIQUE(version_id, kw)
        )
      `);

      // 5b. term_snapshots
      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS term_snapshots (
          id TEXT PRIMARY KEY,
          term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
          version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
          kw TEXT NOT NULL,
          zh_cn TEXT,
          translations TEXT NOT NULL DEFAULT '{}',
          created_at TEXT,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL
        )
      `);

      // 6b. ai_usage_logs (P1-2: AI 用量追踪)
      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS ai_usage_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          project_id TEXT NOT NULL,
          term_kw TEXT,
          zh_cn TEXT,
          target_languages TEXT,
          total_tokens INTEGER DEFAULT 0,
          elapsed_time REAL DEFAULT 0,
          status TEXT,
          created_at TEXT DEFAULT (datetime('now'))
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

        // Pre-populate Magene internal users (王赵云 & 史东升等 8 位管理员)
        const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'magene123';
        if (!process.env.INITIAL_ADMIN_PASSWORD) {
          console.warn('⚠️ INITIAL_ADMIN_PASSWORD 未设置，使用默认密码。请在环境变量中配置 INITIAL_ADMIN_PASSWORD 以提高安全性。');
        }
        const passHash = hashPassword(adminPassword);
        sqliteDb.run(`
          INSERT OR IGNORE INTO users (id, username, password_hash, name, role, created_at)
          VALUES 
          ('user-wangzhaoyun', 'wangzhaoyun', ?, 'wangzhaoyun', 'admin', datetime('now')),
          ('user-shidongsheng', 'shidongsheng', ?, 'shidongsheng', 'admin', datetime('now')),
          ('user-liuchenlu', 'liuchenlu', ?, 'liuchenlu', 'admin', datetime('now')),
          ('user-liuyuanyuan', 'liuyuanyuan', ?, 'liuyuanyuan', 'admin', datetime('now')),
          ('user-bizihao', 'bizihao', ?, 'bizihao', 'admin', datetime('now')),
          ('user-shengyongbang', 'shengyongbang', ?, 'shengyongbang', 'admin', datetime('now')),
          ('user-lanyiwei', 'lanyiwei', ?, 'lanyiwei', 'admin', datetime('now')),
          ('user-jiahao', 'jiahao', ?, 'jiahao', 'admin', datetime('now'))
        `, [passHash, passHash, passHash, passHash, passHash, passHash, passHash, passHash], (insErr) => {
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
                        created_at TEXT,
                        headers TEXT DEFAULT '["中文专业术语","英文翻译对应","说明 / 定义"]'
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
                          cn_term TEXT,
                          en_term TEXT,
                          description TEXT,
                          created_at TEXT,
                          fields TEXT DEFAULT '{}'
                        )
                      `, (gTermErr) => {
                        if (gTermErr) {
                          console.error('❌ 创建 glossary_terms 表失败:', gTermErr.message);
                          return reject(gTermErr);
                        }
                        
                        // Safely alter existing tables to upgrade columns for old DB files
                        sqliteDb.run("ALTER TABLE glossary_tables ADD COLUMN headers TEXT", () => {
                          sqliteDb.run("ALTER TABLE glossary_terms ADD COLUMN fields TEXT", () => {
                            // Safely alter terms table for v1.2 (ignore error if column already exists)
                            sqliteDb.run("ALTER TABLE terms ADD COLUMN is_locked INTEGER DEFAULT 0", () => {
                              sqliteDb.run("ALTER TABLE terms ADD COLUMN locked_by TEXT", () => {
                                sqliteDb.run("ALTER TABLE terms ADD COLUMN locked_at TEXT", () => {
                                  // Safely alter terms table for v1.3 workflow
                                  sqliteDb.run("ALTER TABLE terms ADD COLUMN status TEXT DEFAULT 'DRAFT'", () => {
                                    sqliteDb.run("ALTER TABLE terms ADD COLUMN reject_reason TEXT", () => {
                                      // P1-1: 翻译来源标记列
                                      sqliteDb.run("ALTER TABLE terms ADD COLUMN translations_meta TEXT DEFAULT '{}'", () => {
                                        resolve();
                                      });
                                    });
                                  });
                                });
                              });
                            });
                          });
                        });
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
  },
  async transaction(callback) {
    if (dbType === 'postgres') {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        const txDb = {
          async query(sql, params = []) {
            const res = await client.query(sql, params);
            return res.rows;
          },
          async queryOne(sql, params = []) {
            const rows = await this.query(sql, params);
            return rows[0] || null;
          },
          async run(sql, params = []) {
            const res = await client.query(sql, params);
            return { lastID: null, changes: res.rowCount };
          }
        };
        const result = await callback(txDb);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } else {
      await this.run('BEGIN TRANSACTION');
      try {
        const result = await callback(this);
        await this.run('COMMIT');
        return result;
      } catch (e) {
        try {
          await this.run('ROLLBACK');
        } catch {}
        throw e;
      }
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

// Project membership authorization middleware
async function requireProjectMember(req, res, next) {
  const projectId = req.params.projectId || 'proj-default';
  try {
    const member = await db.queryOne(
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, req.user.id]
    );
    if (!member) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '您无权访问此项目。' });
    }
    req.projectRole = member.role;
    next();
  } catch (err) {
    console.error('RBAC 校验失败:', err.message);
    next();
  }
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

// 2. GET /api/tables - 获取所有固件版本表 (带创建人及最近修改时间)
app.get('/api/tables', authenticateToken, async (req, res) => {
  try {
    const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
    const versions = await db.query(
      `SELECT v.id, v.version_name AS name, v.created_at, u.name AS creator_name,
        (SELECT l.timestamp FROM ${logsTable} l
         WHERE l.version_name = v.version_name
         ORDER BY l.id DESC LIMIT 1) AS last_modified
       FROM versions v
       LEFT JOIN users u ON v.created_by = u.id
       WHERE v.project_id = $1
       ORDER BY v.created_at DESC`,
      ['proj-default']
    );

    const updatedVersions = versions.map(ver => ({
      id: ver.id,
      name: ver.name,
      created_at: ver.created_at,
      creator_name: ver.creator_name || '系统默认',
      last_modified: ver.last_modified || ver.created_at
    }));

    res.json(updatedVersions);
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
        let temp = term.translations;
        while (typeof temp === 'string' && temp.trim() !== '') {
          temp = JSON.parse(temp);
        }
        if (typeof temp === 'object' && temp !== null) {
          trans = temp;
        }
      } catch {
        trans = {};
      }

      // Reconstruct translation columns matching old Bitable schema
      let transMeta = {};
      try {
        let metaTemp = term.translations_meta;
        while (typeof metaTemp === 'string' && metaTemp.trim() !== '') {
          metaTemp = JSON.parse(metaTemp);
        }
        if (typeof metaTemp === 'object' && metaTemp !== null) {
          transMeta = metaTemp;
        }
      } catch { transMeta = {}; }

      return {
        recordId: term.id,
        createdAt: term.created_at,
        updatedAt: term.updated_at,
        isLocked: term.is_locked || 0,
        lockedBy: term.locked_by || '',
        lockedAt: term.locked_at || '',
        status: term.status || 'DRAFT',
        rejectReason: term.reject_reason || '',
        translationsMeta: transMeta,
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

    // 在单个事务内批量写入，避免逐条 autocommit 导致性能极差
    const recordIds = records.map(r => r.recordId).filter(Boolean);

    await db.transaction(async (tx) => {
      // 清理已删除记录（在写入前执行）
      if (records.length > 0 && recordIds.length > 0) {
        const placeholders = recordIds.map((_, idx) => `$${idx + 2}`).join(',');
        await tx.run(
          `DELETE FROM terms WHERE version_id = $1 AND id NOT IN (${placeholders})`,
          [tableId, ...recordIds]
        );
      } else if (records.length === 0) {
        await tx.run('DELETE FROM terms WHERE version_id = $1', [tableId]);
      }

      // 批量 upsert
      for (const rec of records) {
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

        // P1-1: 翻译来源标记
        const transMetaStr = rec.translationsMeta ? JSON.stringify(rec.translationsMeta) : '{}';

        if (dbType === 'postgres') {
          await tx.run(
            `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, updated_by, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (id) DO UPDATE SET
               kw = EXCLUDED.kw,
               context = EXCLUDED.context,
               owner = EXCLUDED.owner,
               zh_cn = EXCLUDED.zh_cn,
               translations = EXCLUDED.translations,
               translations_meta = COALESCE(NULLIF(EXCLUDED.translations_meta, '{}'), terms.translations_meta),
               updated_at = NOW(),
               updated_by = EXCLUDED.updated_by`,
            [termId, tableId, kw, context, owner, zh_cn, translationsStr, transMetaStr, req.user.id]
          );
        } else {
          // SQLite: 保留现有 meta（如果新 meta 为空）
          let finalMetaStr = transMetaStr;
          if (transMetaStr === '{}') {
            const existing = await tx.queryOne('SELECT translations_meta FROM terms WHERE id = $1', [termId]);
            if (existing && existing.translations_meta && existing.translations_meta !== '{}') {
              finalMetaStr = existing.translations_meta;
            }
          }
          await tx.run(
            `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, updated_by, updated_at, is_locked, locked_by, locked_at, status, reject_reason)
             VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),0,NULL,NULL,'DRAFT',NULL)
             ON CONFLICT(id) DO UPDATE SET
               kw=excluded.kw, context=excluded.context, owner=excluded.owner, zh_cn=excluded.zh_cn,
               translations=excluded.translations, translations_meta=excluded.translations_meta,
               updated_by=excluded.updated_by, updated_at=datetime('now')`,
            [termId, tableId, kw, context, owner, zh_cn, translationsStr, finalMetaStr, req.user.id]
          );
        }
      }
    });

    res.json({ message: `同步成功！共同步 ${records.length} 条词条。` });
  } catch (err) {
    console.error('数据同步处理失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 4b. POST /api/versions/sync-terms - 版本对比一键同步合并
app.post('/api/versions/sync-terms', authenticateToken, async (req, res) => {
  const { sourceVersionId, targetVersionId, syncActions } = req.body;
  if (!sourceVersionId || !targetVersionId || !Array.isArray(syncActions)) {
    return res.status(400).json({ error: '必须包含 sourceVersionId, targetVersionId 和 syncActions 数组！' });
  }

  try {
    const sourceVer = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [sourceVersionId]);
    const targetVer = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [targetVersionId]);
    if (!sourceVer || !targetVer) {
      return res.status(404).json({ error: '指定的源版本或目标版本不存在！' });
    }

    const sourceName = sourceVer.version_name;
    const targetName = targetVer.version_name;

    let addCount = 0;
    let modCount = 0;
    let delCount = 0;

    await db.transaction(async (tx) => {
      const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';

      for (const action of syncActions) {
        const { type, kw, data } = action;
        if (!kw) continue;

        // Clear target row first to prevent unique constraint conflict
        await tx.run('DELETE FROM terms WHERE version_id = $1 AND kw = $2', [targetVersionId, kw]);

        if (type === 'ADD' || type === 'MOD') {
          if (type === 'ADD') addCount++;
          if (type === 'MOD') modCount++;

          const termId = crypto.randomUUID();
          const context = data.context || '';
          const owner = data.owner || '';
          const zhCn = data.zh_cn || '';
          const transStr = typeof data.translations === 'object' ? JSON.stringify(data.translations) : (data.translations || '{}');

          if (dbType === 'postgres') {
            await tx.run(
              `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, updated_by, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
              [termId, targetVersionId, kw, context, owner, zhCn, transStr, req.user.id]
            );
          } else {
            await tx.run(
              `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, updated_by, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, datetime('now'), datetime('now'))`,
              [termId, targetVersionId, kw, context, owner, zhCn, transStr, req.user.id]
            );
          }
        } else if (type === 'DEL') {
          delCount++;
        }
      }

      const details = `从版本 [${sourceName}] 同步合并变更到版本 [${targetName}]。新增: ${addCount} 条, 修改: ${modCount} 条, 删除: ${delCount} 条。`;
      if (dbType === 'postgres') {
        await tx.run(
          `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
           VALUES (NOW(), $1, $2, $3, $4, $5, $6)`,
          [`SYNC_MERGE_${addCount + modCount + delCount}`, '批量同步合并', '同步合并', details, targetName, req.user.id]
        );
      } else {
        await tx.run(
          `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
           VALUES (datetime('now'), $1, $2, $3, $4, $5, $6)`,
          [`SYNC_MERGE_${addCount + modCount + delCount}`, '批量同步合并', '同步合并', details, targetName, req.user.id]
        );
      }
    });

    res.json({
      message: `成功同步合并到 [${targetName}]！`,
      added: addCount,
      modified: modCount,
      deleted: delCount
    });

  } catch (err) {
    console.error('版本合并同步失败:', err);
    res.status(500).json({ error: '合并同步处理中发生服务器内部错误。' });
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

// 9. POST /api/versions - 创建固件新版本 (多人协同新增，支持翻译继承)
app.post('/api/projects/:projectId/versions', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { versionName, baseVersionId } = req.body;
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
    let inheritedCount = 0;

    await db.transaction(async (tx) => {
      // 1. Insert version record
      if (dbType === 'postgres') {
        await tx.run(
          'INSERT INTO versions (id, project_id, version_name, created_at, created_by) VALUES ($1, $2, $3, NOW(), $4)',
          [versionId, projectId, versionName, req.user.id]
        );
      } else {
        await tx.run(
          "INSERT INTO versions (id, project_id, version_name, created_at, created_by) VALUES ($1, $2, $3, datetime('now'), $4)",
          [versionId, projectId, versionName, req.user.id]
        );
      }

      // 2. Inherit terms from base version if specified
      if (baseVersionId) {
        const baseTerms = await tx.query(
          'SELECT kw, context, owner, zh_cn, translations FROM terms WHERE version_id = $1',
          [baseVersionId]
        );

        for (const term of baseTerms) {
          const newTermId = crypto.randomUUID();
          const translationsStr = typeof term.translations === 'string'
            ? term.translations
            : JSON.stringify(term.translations || {});

          if (dbType === 'postgres') {
            await tx.run(
              'INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, created_at, updated_at, is_locked) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), 0)',
              [newTermId, versionId, term.kw, term.context, term.owner, term.zh_cn, translationsStr]
            );
          } else {
            await tx.run(
              "INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, created_at, updated_at, is_locked) VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'), datetime('now'), 0)",
              [newTermId, versionId, term.kw, term.context, term.owner, term.zh_cn, translationsStr]
            );
          }
          inheritedCount++;
        }
      }
    });

    res.status(201).json({ id: versionId, versionName, inheritedCount });
  } catch (err) {
    console.error('新建固件版本失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 10. PUT /api/terms/:termId - 带乐观锁并发校验的词条更新接口 (多人协同新增)
app.put('/api/terms/:termId', authenticateToken, async (req, res) => {
  const { termId } = req.params;
  const { kw, context, owner, zh_cn, translations, translationsMeta, oldUpdatedAt } = req.body;

  if (!oldUpdatedAt) {
    return res.status(400).json({ error: '必须包含旧修改时间戳 (oldUpdatedAt) 以进行并发校验' });
  }

  try {
    const term = await db.queryOne('SELECT * FROM terms WHERE id = $1', [termId]);
    if (!term) {
      return res.status(404).json({ error: '词条不存在' });
    }

    // Intercept edit if term is locked
    if (term.is_locked === 1 || term.is_locked === true) {
      return res.status(403).json({ error: 'LOCKED', message: '该词条目前已被锁定，无法修改。如需变更请联系管理员解锁！' });
    }

    let updatedTrans = '';
    const inputTrans = translations !== undefined ? translations : term.translations;
    if (typeof inputTrans === 'string') {
      try {
        const parsed = JSON.parse(inputTrans);
        if (typeof parsed === 'string') {
          updatedTrans = parsed;
        } else {
          updatedTrans = inputTrans;
        }
      } catch {
        updatedTrans = '{}';
      }
    } else {
      updatedTrans = JSON.stringify(inputTrans || {});
    }
    
    // Save history snapshot if contents changed
    const dbTransStr = typeof term.translations === 'string' ? term.translations : JSON.stringify(term.translations || {});
    const isTransChanged = dbTransStr !== updatedTrans;
    const isZhChanged = zh_cn && term.zh_cn !== zh_cn;
    const isKwChanged = kw && term.kw !== kw;

    let nextStatus = 'PENDING_REVIEW';
    if (req.user.role === 'admin') {
      nextStatus = 'APPROVED';
    }

    // M2+M4: 在事务中执行快照写入与带乐观锁守卫的更新，消除 TOCTOU 竞态
    const updateResult = await db.transaction(async (tx) => {
      if (isTransChanged || isZhChanged || isKwChanged) {
        const snapshotId = crypto.randomUUID();
        if (dbType === 'postgres') {
          await tx.run(
            `INSERT INTO term_snapshots (id, term_id, version_id, kw, zh_cn, translations, created_at, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
            [snapshotId, termId, term.version_id, term.kw, term.zh_cn, dbTransStr, req.user.id]
          );
        } else {
          await tx.run(
            `INSERT INTO term_snapshots (id, term_id, version_id, kw, zh_cn, translations, created_at, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, datetime('now'), $7)`,
            [snapshotId, termId, term.version_id, term.kw, term.zh_cn, dbTransStr, req.user.id]
          );
        }
      }

      if (dbType === 'postgres') {
        return await tx.run(
          `UPDATE terms
           SET kw = $1, context = $2, owner = $3, zh_cn = $4, translations = $5, translations_meta = $6, status = $7, reject_reason = NULL, updated_at = NOW(), updated_by = $8
           WHERE id = $9 AND updated_at::text = $10`,
          [kw || term.kw, context || term.context, owner || term.owner, zh_cn || term.zh_cn, updatedTrans, JSON.stringify(translationsMeta || {}), nextStatus, req.user.id, termId, oldUpdatedAt]
        );
      } else {
        return await tx.run(
          `UPDATE terms
           SET kw = $1, context = $2, owner = $3, zh_cn = $4, translations = $5, translations_meta = $6, status = $7, reject_reason = NULL, updated_at = datetime('now'), updated_by = $8
           WHERE id = $9 AND updated_at = $10`,
          [kw || term.kw, context || term.context, owner || term.owner, zh_cn || term.zh_cn, updatedTrans, JSON.stringify(translationsMeta || {}), nextStatus, req.user.id, termId, oldUpdatedAt]
        );
      }
    });

    // M2: 若更新影响行数为 0，说明读取快照后已被他人抢先修改（并发冲突）
    const affectedRows = updateResult.changes || 0;
    if (affectedRows === 0) {
      return res.status(409).json({ error: 'CONCURRENCY_CONFLICT', message: '该词条已被其他人修改，请刷新后重试。' });
    }

    const newTerm = await db.queryOne('SELECT * FROM terms WHERE id = $1', [termId]);
    res.json(newTerm);
  } catch (err) {
    console.error('修改词条失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 10.1 PUT /api/terms/:termId/lock - 锁定/解锁词条接口
app.put('/api/terms/:termId/lock', authenticateToken, async (req, res) => {
  const { termId } = req.params;
  const { isLocked } = req.body; // boolean

  // Role verification: Admin or Owner role required to lock/unlock
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN', message: '只有管理员或所有者可以锁定/解锁词条。' });
  }

  try {
    const term = await db.queryOne('SELECT * FROM terms WHERE id = $1', [termId]);
    if (!term) {
      return res.status(404).json({ error: '词条不存在' });
    }

    const lockValue = isLocked ? 1 : 0;

    if (dbType === 'postgres') {
      await db.run(
        `UPDATE terms SET is_locked = $1, locked_by = $2, locked_at = NOW() WHERE id = $3`,
        [lockValue, isLocked ? req.user.id : null, termId]
      );
    } else {
      await db.run(
        `UPDATE terms SET is_locked = $1, locked_by = $2, locked_at = datetime('now') WHERE id = $3`,
        [lockValue, isLocked ? req.user.id : null, termId]
      );
    }

    const actionName = isLocked ? '锁定词条' : '解锁词条';
    const ver = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [term.version_id]);
    const verName = ver ? ver.version_name : '未知版本';

    const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
    if (dbType === 'postgres') {
      await db.run(
        `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
         VALUES (NOW(), $1, $2, $3, $4, $5, $6)`,
        [term.kw, term.zh_cn, actionName, `${req.user.name} 对词条进行了${actionName}`, verName, req.user.id]
      );
    } else {
      await db.run(
        `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
         VALUES (datetime('now'), $1, $2, $3, $4, $5, $6)`,
        [term.kw, term.zh_cn, actionName, `${req.user.name} 对词条进行了${actionName}`, verName, req.user.id]
      );
    }

    res.json({ id: termId, is_locked: lockValue, message: `${actionName}成功！` });
  } catch (err) {
    console.error('切换锁定状态失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 10.2 GET /api/versions/:versionId/terms/:kw/references - 跨版本翻译参考
app.get('/api/versions/:versionId/terms/:kw/references', authenticateToken, async (req, res) => {
  const { versionId, kw } = req.params;

  try {
    const currentVer = await db.queryOne('SELECT project_id FROM versions WHERE id = $1', [versionId]);
    if (!currentVer) {
      return res.status(404).json({ error: '版本不存在' });
    }
    const projectId = currentVer.project_id;

    const rows = await db.query(
      `SELECT v.version_name, t.zh_cn, t.translations, t.owner, t.updated_at
       FROM terms t
       JOIN versions v ON t.version_id = v.id
       WHERE v.project_id = $1 AND t.kw = $2 AND v.id <> $3
       ORDER BY t.updated_at DESC`,
      [projectId, kw, versionId]
    );

    const results = rows.map(r => ({
      versionName: r.version_name,
      zh_cn: r.zh_cn,
      translations: typeof r.translations === 'string' ? JSON.parse(r.translations) : (r.translations || {}),
      owner: r.owner,
      updatedAt: r.updated_at
    }));

    res.json(results);
  } catch (err) {
    console.error('获取跨版本翻译参考失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 10.3 POST /api/versions/:versionId/inherit-translations - 翻译记忆库批量继承覆盖未翻译部分
app.post('/api/versions/:versionId/inherit-translations', authenticateToken, async (req, res) => {
  const { versionId } = req.params;
  const { sourceVersionId } = req.body;

  if (!sourceVersionId) {
    return res.status(400).json({ error: '必须指定源版本 ID (sourceVersionId)' });
  }

  try {
    const targetVer = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [versionId]);
    const sourceVer = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [sourceVersionId]);

    if (!targetVer || !sourceVer) {
      return res.status(404).json({ error: '指定的源版本或目标版本不存在！' });
    }

    let inheritCount = 0;

    await db.transaction(async (tx) => {
      const srcTerms = await tx.query('SELECT kw, translations FROM terms WHERE version_id = $1', [sourceVersionId]);
      const tgtTerms = await tx.query('SELECT id, kw, translations, is_locked FROM terms WHERE version_id = $1', [versionId]);

      const srcMap = {};
      srcTerms.forEach(t => {
        srcMap[t.kw] = typeof t.translations === 'string' ? JSON.parse(t.translations) : (t.translations || {});
      });

      for (const tgt of tgtTerms) {
        if (tgt.is_locked === 1 || tgt.is_locked === true) continue;

        const srcTrans = srcMap[tgt.kw];
        if (!srcTrans) continue;

        const tgtTrans = typeof tgt.translations === 'string' ? JSON.parse(tgt.translations) : (tgt.translations || {});
        let merged = false;

        Object.keys(srcTrans).forEach(lang => {
          if (srcTrans[lang] && (!tgtTrans[lang] || tgtTrans[lang].trim() === '')) {
            tgtTrans[lang] = srcTrans[lang];
            merged = true;
          }
        });

        if (merged) {
          const updatedTransStr = JSON.stringify(tgtTrans);
          if (dbType === 'postgres') {
            await tx.run(
              'UPDATE terms SET translations = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3',
              [updatedTransStr, req.user.id, tgt.id]
            );
          } else {
            await tx.run(
              "UPDATE terms SET translations = $1, updated_at = datetime('now'), updated_by = $2 WHERE id = $3",
              [updatedTransStr, req.user.id, tgt.id]
            );
          }
          inheritCount++;
        }
      }

      if (inheritCount > 0) {
        const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
        const details = `从版本 [${sourceVer.version_name}] 批量继承翻译覆盖到 [${targetVer.version_name}]，合并继承了 ${inheritCount} 条词条。`;
        
        if (dbType === 'postgres') {
          await tx.run(
            `INSERT INTO ${logsTable} (timestamp, action, details, version_name, user_id)
             VALUES (NOW(), '翻译继承', $1, $2, $3)`,
            [details, targetVer.version_name, req.user.id]
          );
        } else {
          await tx.run(
            `INSERT INTO ${logsTable} (timestamp, action, details, version_name, user_id)
             VALUES (datetime('now'), '翻译继承', $1, $2, $3)`,
            [details, targetVer.version_name, req.user.id]
          );
        }
      }
    });

    res.json({
      message: `成功从 [${sourceVer.version_name}] 继承并补全翻译！`,
      inheritedCount: inheritCount
    });
  } catch (err) {
    console.error('批量继承翻译失败:', err);
    res.status(500).json({ error: '合并继承处理中发生服务器内部错误。' });
  }
});

// 10.4 POST /api/terms/batch-update - 批量设置词条分类字段
app.post('/api/terms/batch-update', authenticateToken, async (req, res) => {
  const { termIds, updates } = req.body;

  if (!Array.isArray(termIds) || termIds.length === 0 || !updates) {
    return res.status(400).json({ error: '必须包含 termIds 数组和 updates 更新对象' });
  }

  try {
    let successCount = 0;
    let lockedCount = 0;

    await db.transaction(async (tx) => {
      const placeholders = termIds.map((_, i) => `$${i + 1}`).join(',');
      const terms = await tx.query(`SELECT id, is_locked, kw, zh_cn, version_id FROM terms WHERE id IN (${placeholders})`, termIds);

      const validTerms = terms.filter(t => {
        if (t.is_locked === 1 || t.is_locked === true) {
          lockedCount++;
          return false;
        }
        return true;
      });

      if (validTerms.length === 0) {
        return;
      }

      const updatesNormalized = {};
      if (updates.context !== undefined) {
        updatesNormalized.context = updates.context;
      } else if (updates['所在页面'] !== undefined) {
        updatesNormalized.context = updates['所在页面'];
      }

      if (updates.owner !== undefined) {
        updatesNormalized.owner = updates.owner;
      } else if (updates['字号类别'] !== undefined) {
        updatesNormalized.owner = updates['字号类别'];
      }

      const updateFields = [];
      const updateParams = [];
      let idx = 1;
      
      if (updatesNormalized.context !== undefined) {
        updateFields.push(`context = $${idx++}`);
        updateParams.push(updatesNormalized.context);
      }
      if (updatesNormalized.owner !== undefined) {
        updateFields.push(`owner = $${idx++}`);
        updateParams.push(updatesNormalized.owner);
      }

      if (updateFields.length === 0) return;

      const baseQuery = dbType === 'postgres'
        ? `UPDATE terms SET ${updateFields.join(', ')}, updated_at = NOW(), updated_by = $${idx}`
        : `UPDATE terms SET ${updateFields.join(', ')}, updated_at = datetime('now'), updated_by = $${idx}`;
      
      updateParams.push(req.user.id);
      const termIdParamIndex = idx + 1;

      for (const t of validTerms) {
        const query = `${baseQuery} WHERE id = $${termIdParamIndex}`;
        await tx.run(query, [...updateParams, t.id]);
        successCount++;
      }

      if (successCount > 0) {
        const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
        const ver = await tx.queryOne('SELECT version_name FROM versions WHERE id = $1', [validTerms[0].version_id]);
        const verName = ver ? ver.version_name : '未知版本';
        const detailMsg = `批量更新了 ${successCount} 条词条的分类字段 (${Object.keys(updates).join(', ')})。跳过锁定条数: ${lockedCount}。`;

        if (dbType === 'postgres') {
          await tx.run(
            `INSERT INTO ${logsTable} (timestamp, action, details, version_name, user_id)
             VALUES (NOW(), '批量修改', $1, $2, $3)`,
            [detailMsg, verName, req.user.id]
          );
        } else {
          await tx.run(
            `INSERT INTO ${logsTable} (timestamp, action, details, version_name, user_id)
             VALUES (datetime('now'), '批量修改', $1, $2, $3)`,
            [detailMsg, verName, req.user.id]
          );
        }
      }
    });

    res.json({
      message: `成功批量更新分类字段！已更新: ${successCount} 条，跳过锁定: ${lockedCount} 条。`,
      successCount,
      lockedCount
    });
  } catch (err) {
    console.error('批量修改分类字段失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 10.5 POST /api/terms/batch-copy - 批量复制词条到其他版本 (带重复校验策略)
app.post('/api/terms/batch-copy', authenticateToken, async (req, res) => {
  const { termIds, targetVersionId, duplicateStrategy } = req.body;

  if (!Array.isArray(termIds) || termIds.length === 0 || !targetVersionId || !duplicateStrategy) {
    return res.status(400).json({ error: '必须包含 termIds 数组、targetVersionId 和 duplicateStrategy 策略' });
  }

  const validStrategies = ['overwrite', 'skip', 'merge'];
  if (!validStrategies.includes(duplicateStrategy)) {
    return res.status(400).json({ error: 'INVALID_STRATEGY', message: '无效的复制策略。' });
  }

  try {
    const targetVer = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [targetVersionId]);
    if (!targetVer) {
      return res.status(404).json({ error: '目标版本不存在' });
    }

    let copyCount = 0;
    let skipCount = 0;
    let overwriteCount = 0;

    await db.transaction(async (tx) => {
      const placeholders = termIds.map((_, i) => `$${i + 1}`).join(',');
      const sourceTerms = await tx.query(
        `SELECT kw, context, owner, zh_cn, translations FROM terms WHERE id IN (${placeholders})`,
        termIds
      );

      const existingTerms = await tx.query(
        'SELECT id, kw, is_locked, translations FROM terms WHERE version_id = $1',
        [targetVersionId]
      );

      const existingMap = {};
      existingTerms.forEach(t => {
        existingMap[t.kw] = t;
      });

      for (const term of sourceTerms) {
        const exist = existingMap[term.kw];
        const newId = crypto.randomUUID();
        
        let transStr = '{}';
        try {
          let temp = term.translations;
          while (typeof temp === 'string' && temp.trim() !== '') {
            temp = JSON.parse(temp);
          }
          if (typeof temp === 'object' && temp !== null) {
            transStr = JSON.stringify(temp);
          } else if (typeof temp === 'string') {
            transStr = temp;
          }
        } catch {
          transStr = '{}';
        }

        if (exist) {
          if (duplicateStrategy === 'skip') {
            skipCount++;
            continue;
          } else if (duplicateStrategy === 'overwrite') {
            if (exist.is_locked === 1 || exist.is_locked === true) {
              skipCount++;
              continue;
            }

            await tx.run('DELETE FROM terms WHERE id = $1', [exist.id]);
            
            if (dbType === 'postgres') {
              await tx.run(
                `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, created_at, updated_at, is_locked)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), 0)`,
                [newId, targetVersionId, term.kw, term.context, term.owner, term.zh_cn, transStr]
              );
            } else {
              await tx.run(
                `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, created_at, updated_at, is_locked)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'), datetime('now'), 0)`,
                [newId, targetVersionId, term.kw, term.context, term.owner, term.zh_cn, transStr]
              );
            }
            overwriteCount++;
          }
        } else {
          if (dbType === 'postgres') {
            await tx.run(
              `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, created_at, updated_at, is_locked)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), 0)`,
              [newId, targetVersionId, term.kw, term.context, term.owner, term.zh_cn, transStr]
            );
          } else {
            await tx.run(
              `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, created_at, updated_at, is_locked)
               VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'), datetime('now'), 0)`,
              [newId, targetVersionId, term.kw, term.context, term.owner, term.zh_cn, transStr]
            );
          }
          copyCount++;
        }
      }

      const totalMoved = copyCount + overwriteCount;
      if (totalMoved > 0 || skipCount > 0) {
        const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
        const details = `批量从其他版本复制词条到 [${targetVer.version_name}]。成功复制新增: ${copyCount} 条，覆盖已有: ${overwriteCount} 条，跳过（重复/锁定）: ${skipCount} 条。`;

        if (dbType === 'postgres') {
          await tx.run(
            `INSERT INTO ${logsTable} (timestamp, action, details, version_name, user_id)
             VALUES (NOW(), '批量复制', $1, $2, $3)`,
            [details, targetVer.version_name, req.user.id]
          );
        } else {
          await tx.run(
            `INSERT INTO ${logsTable} (timestamp, action, details, version_name, user_id)
             VALUES (datetime('now'), '批量复制', $1, $2, $3)`,
            [details, targetVer.version_name, req.user.id]
          );
        }
      }
    });

    res.json({
      message: `成功复制词条到版本 [${targetVer.version_name}]！`,
      addedCount: copyCount,
      overwrittenCount: overwriteCount,
      skippedCount: skipCount
    });
  } catch (err) {
    console.error('批量复制到其他版本失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 12. GET /api/terms/:termId/snapshots - 获取单个词条的翻译历史快照列表
app.get('/api/terms/:termId/snapshots', authenticateToken, async (req, res) => {
  const { termId } = req.params;
  try {
    const snapshots = await db.query(
      `SELECT s.*, u.username as creator_name 
       FROM term_snapshots s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.term_id = $1 
       ORDER BY s.created_at DESC`,
      [termId]
    );

    const formatted = snapshots.map(s => {
      let trans = {};
      try {
        trans = typeof s.translations === 'string' ? JSON.parse(s.translations) : s.translations;
      } catch {}
      return {
        id: s.id,
        termId: s.term_id,
        versionId: s.version_id,
        kw: s.kw,
        zh_cn: s.zh_cn,
        translations: trans,
        createdAt: s.created_at,
        creatorName: s.creator_name || '系统用户'
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error('获取词条快照失败:', err);
    res.status(500).json({ error: '服务器内部错误，获取历史记录失败。' });
  }
});

// 13. POST /api/terms/:termId/rollback - 一键回退到指定快照的翻译
app.post('/api/terms/:termId/rollback', authenticateToken, async (req, res) => {
  const { termId } = req.params;
  const { snapshotId } = req.body;

  if (!snapshotId) {
    return res.status(400).json({ error: '缺少快照ID (snapshotId)' });
  }

  try {
    const term = await db.queryOne('SELECT * FROM terms WHERE id = $1', [termId]);
    if (!term) {
      return res.status(404).json({ error: '词条不存在' });
    }

    if (term.is_locked === 1 || term.is_locked === true) {
      return res.status(403).json({ error: 'LOCKED', message: '此词条已被锁定，如需回退请联系管理员解锁！' });
    }

    const snapshot = await db.queryOne('SELECT * FROM term_snapshots WHERE id = $1 AND term_id = $2', [snapshotId, termId]);
    if (!snapshot) {
      return res.status(404).json({ error: '找不到指定的词条历史快照' });
    }

    // 在覆盖还原前，先把当前的数据作为新快照保存，以免后悔！
    const newSnapshotId = crypto.randomUUID();
    const currentTransStr = typeof term.translations === 'string' ? term.translations : JSON.stringify(term.translations || {});
    
    // 执行事务操作
    await db.transaction(async (tx) => {
      // 1. 存下后悔药快照
      if (dbType === 'postgres') {
        await tx.run(
          `INSERT INTO term_snapshots (id, term_id, version_id, kw, zh_cn, translations, created_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
          [newSnapshotId, termId, term.version_id, term.kw, term.zh_cn, currentTransStr, req.user.id]
        );
      } else {
        await tx.run(
          `INSERT INTO term_snapshots (id, term_id, version_id, kw, zh_cn, translations, created_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, datetime('now'), $7)`,
          [newSnapshotId, termId, term.version_id, term.kw, term.zh_cn, currentTransStr, req.user.id]
        );
      }

      // 2. 覆盖更新主表数据。回退由管理员触发一般状态直接保留，或让其直接状态设为 APPROVED
      let nextStatus = 'PENDING_REVIEW';
      if (req.user.role === 'admin') {
        nextStatus = 'APPROVED';
      }

      const snapTransStr = typeof snapshot.translations === 'string' ? snapshot.translations : JSON.stringify(snapshot.translations || {});

      if (dbType === 'postgres') {
        await tx.run(
          `UPDATE terms 
           SET kw = $1, zh_cn = $2, translations = $3, status = $4, reject_reason = NULL, updated_at = NOW(), updated_by = $5
           WHERE id = $6`,
          [snapshot.kw, snapshot.zh_cn, snapTransStr, nextStatus, req.user.id, termId]
        );
      } else {
        await tx.run(
          `UPDATE terms 
           SET kw = $1, zh_cn = $2, translations = $3, status = $4, reject_reason = NULL, updated_at = datetime('now'), updated_by = $5
           WHERE id = $6`,
          [snapshot.kw, snapshot.zh_cn, snapTransStr, nextStatus, req.user.id, termId]
        );
      }

      // 3. 记录变更日志
      const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
      const versionObj = await tx.queryOne('SELECT version_name FROM versions WHERE id = $1', [term.version_id]);
      const details = `将词条 [${term.kw}] 的内容回退到了 [${snapshot.created_at}] 的历史版本。`;
      
      if (dbType === 'postgres') {
        await tx.run(
          `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
           VALUES (NOW(), $1, $2, '历史回退', $3, $4, $5)`,
          [snapshot.kw, snapshot.zh_cn, details, versionObj ? versionObj.version_name : '', req.user.id]
        );
      } else {
        await tx.run(
          `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
           VALUES (datetime('now'), $1, $2, '历史回退', $3, $4, $5)`,
          [snapshot.kw, snapshot.zh_cn, details, versionObj ? versionObj.version_name : '', req.user.id]
        );
      }
    });

    res.json({ message: '成功回退到指定历史快照！', kw: snapshot.kw });
  } catch (err) {
    console.error('词条快照回退失败:', err);
    res.status(500).json({ error: '服务器内部错误，回退操作失败。' });
  }
});

// 14. POST /api/terms/batch-approve - 批量审核词条工作流 API
app.post('/api/terms/batch-approve', authenticateToken, async (req, res) => {
  const { termIds, status, rejectReason } = req.body;

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN', message: '只有管理员有权审核词条！' });
  }

  if (!Array.isArray(termIds) || termIds.length === 0 || !status) {
    return res.status(400).json({ error: '必须包含有效的 termIds 数组和目标审核 status 字段！' });
  }

  const validStatuses = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: '非法审核状态！' });
  }

  try {
    await db.transaction(async (tx) => {
      // 一次性查询所有候选词条
      const selectPlaceholders = termIds.map((_, i) => `$${i + 1}`).join(',');
      const candidates = await tx.query(
        `SELECT id, is_locked, kw, zh_cn, version_id FROM terms WHERE id IN (${selectPlaceholders})`,
        termIds
      );

      // 在 JS 中过滤掉锁定行（保持原有行为）
      const validTerms = candidates.filter(t => !(t.is_locked === 1 || t.is_locked === true));

      if (validTerms.length === 0) {
        return; // 没有可审核的词条，直接返回
      }

      const validIds = validTerms.map(t => t.id);
      const reason = status === 'REJECTED' ? (rejectReason || '未填写具体原因') : null;

      // 单次批量 UPDATE
      const updatePlaceholders = validIds.map((_, i) => `$${i + 3}`).join(',');
      const updateSql = dbType === 'postgres'
        ? `UPDATE terms SET status = $1, reject_reason = $2, updated_at = NOW(), updated_by = $3 WHERE id IN (${updatePlaceholders})`
        : `UPDATE terms SET status = $1, reject_reason = $2, updated_at = datetime('now'), updated_by = $3 WHERE id IN (${updatePlaceholders})`;
      await tx.run(updateSql, [status, reason, req.user.id, ...validIds]);

      // 单次批量写入审核日志（INSERT...SELECT 关联版本名称）
      const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
      const logPlaceholders = validIds.map((_, i) => `$${i + 4}`).join(',');
      const timestampExpr = dbType === 'postgres' ? 'NOW()' : "datetime('now')";
      const detailsPrefix = '审核词条 [';
      const detailsSuffix = `]，结果: [${status}]${status === 'REJECTED' ? `，原因: ${reason}` : ''}`;

      const logSql = `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
           SELECT ${timestampExpr}, t.kw, t.zh_cn, '内容审核', $1 || t.kw || $2, COALESCE(v.version_name, ''), $3
           FROM terms t LEFT JOIN versions v ON t.version_id = v.id
           WHERE t.id IN (${logPlaceholders})`;
      await tx.run(logSql, [detailsPrefix, detailsSuffix, req.user.id, ...validIds]);
    });

    res.json({ message: `批量操作成功！已将选中词条设置为 [${status}] 状态。` });
  } catch (err) {
    console.error('批量审核词条失败:', err);
    res.status(500).json({ error: '服务器内部错误，批量审核失败。' });
  }
});

// ====================================================
// Dify Security Config & Relay APIs (Approved Spec)
// ====================================================

// 11. POST /api/projects/:projectId/dify - 保存项目的 Dify 配置
app.post('/api/projects/:projectId/dify', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { baseUrl, apiKey } = req.body;

  if (!baseUrl) {
    return res.status(400).json({ error: 'baseUrl 不能为空' });
  }

  try {
    const project = await db.queryOne('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    // 读取已有配置，apiKey 为空时保留原值
    let existingConfig = {};
    if (project.dify_config && typeof project.dify_config === 'object') {
      existingConfig = project.dify_config;
    } else {
      try {
        existingConfig = JSON.parse(project.dify_config || '{}');
      } catch {
        existingConfig = {};
      }
    }
    const finalApiKey = apiKey || existingConfig.apiKey || '';
    if (!finalApiKey) {
      return res.status(400).json({ error: 'apiKey 不能为空（尚未配置过密钥）' });
    }

    const newConfig = JSON.stringify({ baseUrl, apiKey: finalApiKey });
    await db.run(
      'UPDATE projects SET dify_config = $1 WHERE id = $2',
      [newConfig, projectId]
    );

    res.json({ message: 'Dify 配置已安全存入数据库！' });
  } catch (err) {
    console.error('保存 Dify 配置失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 12. GET /api/projects/:projectId/dify - 获取项目的 Dify 配置状态 (不返回明文 Key)
app.get('/api/projects/:projectId/dify', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  try {
    const config = await getEffectiveDifyConfig(projectId);

    res.json({
      baseUrl: config.baseUrl,
      apiKeyConfigured: !!config.apiKey,   // 默认配置内置，始终为 true
      isCustom: config.isCustom            // 是否用户自定义覆盖
    });
  } catch (err) {
    console.error('读取 Dify 配置失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 13. POST /api/projects/:projectId/ai-translate - 后端中转 Dify AI 翻译代理
app.post('/api/projects/:projectId/ai-translate', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { inputs } = req.body;
  const userId = req.user?.id || null;

  if (!inputs) {
    return res.status(400).json({ error: '缺少 inputs 输入参数' });
  }

  // P1-2: 提取翻译上下文用于用量记录
  const termKw = inputs.kw || inputs.keyword || '';
  const zhCn = inputs.zh_cn || inputs.chinese || inputs.text || '';
  const targetLangs = inputs.target_languages || inputs.languages || '';

  try {
    // 使用统一配置获取函数：优先数据库覆盖，否则回退默认
    const config = await getEffectiveDifyConfig(projectId);

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

    // P1-2: 记录 AI 用量（非阻塞，不影响翻译流程）
    const usageTokens = data.data?.total_tokens || 0;
    const usageElapsed = data.data?.elapsed_time || 0;
    const usageStatus = data.data?.status || 'success';
    db.query(
      'INSERT INTO ai_usage_logs (user_id, project_id, term_kw, zh_cn, target_languages, total_tokens, elapsed_time, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [userId, projectId, termKw, zhCn.slice(0, 200), targetLangs, usageTokens, usageElapsed, usageStatus]
    ).catch(err => console.error('AI用量日志写入失败:', err.message));

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

  // 使用统一配置：请求体 > 数据库覆盖 > 内置默认
  const effective = await getEffectiveDifyConfig(projectId);
  const targetUrl = baseUrl || effective.baseUrl;
  const targetKey = apiKey || effective.apiKey;

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
app.post('/api/projects/:projectId/languages', authenticateToken, requireProjectMember, async (req, res) => {
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

    await db.transaction(async (tx) => {
      // 如果名称改变，则迁移所有的 terms 对应的 translations JSON key
      if (oldName !== newName) {
        const versions = await tx.query('SELECT id FROM versions WHERE project_id = $1', [projectId]);
        const versionIds = versions.map(v => v.id);

        if (versionIds.length > 0) {
          const versionPlaceholders = versionIds.map((_, idx) => `$${idx + 1}`).join(',');
          const allTerms = await tx.query(
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

              await tx.run(
                'UPDATE terms SET translations = $1 WHERE id = $2',
                [JSON.stringify(trans), term.id]
              );
            }
          }
        }
      }

      await tx.run(
        'UPDATE languages SET lang_name = $1, display_order = $2 WHERE id = $3',
        [newName, newOrder, langId]
      );
    });

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

    await db.transaction(async (tx) => {
      // 清除所有关联词条的该语种翻译缓存
      const versions = await tx.query('SELECT id FROM versions WHERE project_id = $1', [projectId]);
      const versionIds = versions.map(v => v.id);

      if (versionIds.length > 0) {
        const versionPlaceholders = versionIds.map((_, idx) => `$${idx + 1}`).join(',');
        const allTerms = await tx.query(
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
            await tx.run(
              'UPDATE terms SET translations = $1 WHERE id = $2',
              [JSON.stringify(trans), term.id]
            );
          }
        }
      }

      await tx.run('DELETE FROM languages WHERE id = $1', [langId]);
    });

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

    // P1-3: 按语种覆盖率统计累加器
    const langFilledMap = {};
    langNames.forEach(l => { langFilledMap[l] = 0; });

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
        if (val && val.toString().trim() !== '') { filledCells++; termFilledCount++; langFilledMap[lang]++; }
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

    // P1-3: 按语种覆盖率构建
    const langProgress = langNames.map(l => ({
      lang: l,
      filled: langFilledMap[l],
      total: termCount,
      coverage: termCount > 0 ? Math.round((langFilledMap[l] / termCount) * 100) : 0
    }));

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
      langProgress,
      recentLogs
    });
  } catch (err) {
    console.error('获取看板统计数据失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 18b. GET /api/dashboard/ai-usage - P1-2: AI 用量统计
app.get('/api/dashboard/ai-usage', authenticateToken, async (req, res) => {
  try {
    let todayStats, weekStats, dailyTrend;

    if (dbType === 'postgres') {
      // PostgreSQL 兼容 SQL 语法
      todayStats = await db.query(`
        SELECT
          COUNT(*) AS call_count,
          COALESCE(SUM(total_tokens), 0) AS total_tokens,
          COALESCE(SUM(elapsed_time), 0) AS total_elapsed
        FROM ai_usage_logs
        WHERE created_at >= CURRENT_DATE
      `);

      weekStats = await db.query(`
        SELECT
          COUNT(*) AS call_count,
          COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM ai_usage_logs
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `);

      dailyTrend = await db.query(`
        SELECT
          TO_CHAR(created_at, 'YYYY-MM-DD') AS date,
          COUNT(*) AS calls,
          COALESCE(SUM(total_tokens), 0) AS tokens
        FROM ai_usage_logs
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
        ORDER BY date ASC
      `);
    } else {
      // SQLite 兼容 SQL 语法
      todayStats = await db.query(`
        SELECT
          COUNT(*) AS call_count,
          COALESCE(SUM(total_tokens), 0) AS total_tokens,
          COALESCE(SUM(elapsed_time), 0) AS total_elapsed
        FROM ai_usage_logs
        WHERE created_at >= datetime('now', 'start of day')
      `);

      weekStats = await db.query(`
        SELECT
          COUNT(*) AS call_count,
          COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM ai_usage_logs
        WHERE created_at >= datetime('now', '-7 days')
      `);

      dailyTrend = await db.query(`
        SELECT
          DATE(created_at) AS date,
          COUNT(*) AS calls,
          COALESCE(SUM(total_tokens), 0) AS tokens
        FROM ai_usage_logs
        WHERE created_at >= datetime('now', '-7 days')
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at) ASC
      `);
    }

    res.json({
      today: {
        calls: todayStats[0]?.call_count || 0,
        tokens: todayStats[0]?.total_tokens || 0,
        elapsed: todayStats[0]?.total_elapsed || 0
      },
      week: {
        calls: weekStats[0]?.call_count || 0,
        tokens: weekStats[0]?.total_tokens || 0
      },
      dailyTrend: dailyTrend.map(d => ({ date: d.date, calls: d.calls, tokens: d.tokens }))
    });
  } catch (err) {
    console.error('获取 AI 用量统计失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
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

// 19.5 PUT /api/projects/:projectId/versions/:versionId - 修改数据表名称
app.put('/api/projects/:projectId/versions/:versionId', authenticateToken, async (req, res) => {
  const { projectId, versionId } = req.params;
  const { versionName } = req.body;

  if (!versionName || !versionName.trim()) {
    return res.status(400).json({ error: '数据表名称不能为空' });
  }

  try {
    const newName = versionName.trim();
    // Check duplication
    const existing = await db.queryOne(
      'SELECT id FROM versions WHERE project_id = $1 AND version_name = $2 AND id != $3',
      [projectId, newName, versionId]
    );
    if (existing) {
      return res.status(409).json({ error: '已存在同名数据表，请使用其他名称' });
    }

    await db.run(
      'UPDATE versions SET version_name = $1 WHERE id = $2 AND project_id = $3',
      [newName, versionId, projectId]
    );

    res.json({ message: '数据表名称更新成功', name: newName });
  } catch (err) {
    console.error('更新数据表名称失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 20. GET /api/projects/:projectId/glossary-tables - 获取专业词汇大表列表
app.get('/api/projects/:projectId/glossary-tables', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  try {
    const tables = await db.query('SELECT * FROM glossary_tables WHERE project_id = $1 ORDER BY table_name ASC', [projectId]);
    const mapped = tables.map(t => {
      let headersParsed = [];
      try {
        headersParsed = JSON.parse(t.headers || '["中文专业术语","英文翻译对应","说明 / 定义"]');
      } catch {
        headersParsed = ["中文专业术语", "英文翻译对应", "说明 / 定义"];
      }
      return { ...t, headers: headersParsed };
    });
    res.json(mapped);
  } catch (err) {
    console.error('加载词汇表失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 21. POST /api/projects/:projectId/glossary-tables - 创建新的专业词汇表
app.post('/api/projects/:projectId/glossary-tables', authenticateToken, requireProjectMember, async (req, res) => {
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
    res.status(201).json({ id: tableId, table_name: tableName, created_at: createdTime, headers: ["中文专业术语", "英文翻译对应", "说明 / 定义"] });
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
    const mapped = terms.map(t => {
      let fieldsParsed = {};
      try {
        fieldsParsed = JSON.parse(t.fields || '{}');
      } catch {
        fieldsParsed = {};
      }
      return { ...t, fields: fieldsParsed };
    });
    res.json(mapped);
  } catch (err) {
    console.error('加载专业术语列表失败:', err); res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// 24. POST /api/glossary-tables/:tableId/terms - 新增/批量导入术语
app.post('/api/glossary-tables/:tableId/terms', authenticateToken, async (req, res) => {
  const { tableId } = req.params;
  const { cnTerm, enTerm, description, termsList, headers } = req.body;

  try {
    if (Array.isArray(termsList)) {
      const createdTime = new Date().toISOString();
      await db.transaction(async (tx) => {
        // 1. Update custom table headers config if provided
        if (Array.isArray(headers) && headers.length > 0) {
          await tx.run('UPDATE glossary_tables SET headers = $1 WHERE id = $2', [JSON.stringify(headers), tableId]);
        }

        // 2. Clear all previous terms in this table to achieve overwrite import
        await tx.run('DELETE FROM glossary_terms WHERE table_id = $1', [tableId]);

        for (const t of termsList) {
          const cn = (t.cnTerm || '').trim();
          const en = (t.enTerm || '').trim();
          if (!cn && !en) continue;

          const termId = crypto.randomUUID();
          const fieldsJson = JSON.stringify(t.fields || {});
          await tx.run(
            'INSERT INTO glossary_terms (id, table_id, cn_term, en_term, description, created_at, fields) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [termId, tableId, cn, en, (t.description || '').trim(), createdTime, fieldsJson]
          );
        }
      });
      return res.status(201).json({ message: `成功覆盖导入了 ${termsList.length} 条专业术语！`, count: termsList.length });
    }

    if (!cnTerm && !enTerm) {
      return res.status(400).json({ error: '术语名称或翻译不能为空' });
    }

    const existing = await db.queryOne('SELECT id FROM glossary_terms WHERE table_id = $1 AND cn_term = $2', [tableId, cnTerm]);
    if (existing) {
      return res.status(409).json({ error: '该专业术语在此表已存在' });
    }

    const termId = crypto.randomUUID();
    const createdTime = new Date().toISOString();
    const defaultFields = {
      "中文专业术语": cnTerm,
      "英文翻译对应": enTerm,
      "说明 / 定义": description || ''
    };

    await db.run(
      'INSERT INTO glossary_terms (id, table_id, cn_term, en_term, description, created_at, fields) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [termId, tableId, cnTerm.trim(), enTerm.trim(), (description || '').trim(), createdTime, JSON.stringify(defaultFields)]
    );

    res.status(201).json({ 
      id: termId, 
      cn_term: cnTerm, 
      en_term: enTerm, 
      description,
      fields: defaultFields
    });
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

// 15. GET /api/debug-status - 获取系统运行引擎与状态的免检调试路由
app.get('/api/debug-status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  res.json({
    dbType,
    port: PORT,
    hasPgUrl: !!pgUrl,
    pgError,
    pgDebug
  });
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
