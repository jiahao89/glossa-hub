const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Database configuration
const DB_PATH = path.join(__dirname, 'glossahub.db');
const FALLBACK_JSON_PATH = path.join(__dirname, 'db_fallback.json');
const FALLBACK_TABLES_PATH = path.join(__dirname, 'db_tables_fallback.json');

let dbType = 'sqlite';
let sqliteDb = null;

// Canonical language key names (new Bitable column headers)
const TARGET_LANGUAGES = [
  'EN（英文）', 'FR（法）', 'DE（德）', 'ES（西班牙）', 'IT（意大利）', 'PT（葡萄牙）', 
  'KO（韩）', 'JP（日）', 'RU（俄罗斯）', 'PL（波兰）', 'TC（繁）', 'DA（丹麦）', 
  'CZ(捷克)', '瑞典', '挪威', '荷兰'
];

// Map old/legacy translation key names → new canonical names
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
  '瑞典语': '瑞典',
  '挪威语': '挪威',
  '荷兰语': '荷兰'
};

/**
 * Normalize translation keys from any legacy format to canonical new format.
 * E.g. {"英文": "Hello", "法语": "Bonjour"} → {"EN（英文）": "Hello", "FR（法）": "Bonjour"}
 */
function normalizeTranslations(trans) {
  if (!trans || typeof trans !== 'object') return {};
  const normalized = {};
  for (const [key, value] of Object.entries(trans)) {
    // If the key is already a canonical name, keep it
    if (TARGET_LANGUAGES.includes(key)) {
      normalized[key] = value;
    } else if (LEGACY_TO_NEW_LANG_MAP[key]) {
      // Map legacy key to new canonical name
      normalized[LEGACY_TO_NEW_LANG_MAP[key]] = value;
    } else {
      // Unknown key, preserve as-is
      normalized[key] = value;
    }
  }
  return normalized;
}

try {
  const sqlite3 = require('sqlite3').verbose();
  sqliteDb = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.warn('⚠️ 无法连接到 SQLite 数据库，正在切换到 JSON 文件数据库模式:', err.message);
      dbType = 'json';
      initJsonDb();
    } else {
      console.log('⚡ 成功连接到 SQLite 数据库 (glossahub.db)');
      initSqliteDb();
    }
  });
} catch {
  console.warn('⚠️ 缺少 sqlite3 模块或编译失败，自动切换为 JSON 文件数据库模式');
  dbType = 'json';
  initJsonDb();
}

// 1. SQLite Database Initialization
function initSqliteDb() {
  sqliteDb.serialize(() => {
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        kw TEXT,
        chinese TEXT,
        action TEXT NOT NULL,
        details TEXT,
        version TEXT
      )
    `, (err) => {
      if (err) {
        console.error('⚠️ 初始化 logs 数据表失败:', err.message);
      } else {
        sqliteDb.run("ALTER TABLE logs ADD COLUMN version TEXT", (_alterErr) => {
          // Ignore error if column already exists
        });
      }
    });

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS tables (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `, (err) => {
      if (err) {
        console.error('⚠️ 初始化 tables 数据表失败:', err.message);
      }
    });

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS records (
        recordId TEXT NOT NULL,
        tableId TEXT NOT NULL,
        kw TEXT,
        chinese TEXT,
        page TEXT,
        owner TEXT,
        translations TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        PRIMARY KEY (recordId, tableId)
      )
    `, (err) => {
      if (err) {
        console.error('⚠️ 初始化 records 数据表失败:', err.message);
      }
    });
  });
}

// 2. JSON Database Initialization
function initJsonDb() {
  if (!fs.existsSync(FALLBACK_JSON_PATH)) {
    fs.writeFileSync(FALLBACK_JSON_PATH, JSON.stringify([], null, 2), 'utf8');
  }
  if (!fs.existsSync(FALLBACK_TABLES_PATH)) {
    fs.writeFileSync(FALLBACK_TABLES_PATH, JSON.stringify({ tables: [], records: {} }, null, 2), 'utf8');
  }
  console.log(`📂 JSON 数据库已就绪: ${FALLBACK_JSON_PATH}, ${FALLBACK_TABLES_PATH}`);
}

// --- API Endpoints ---

// 1. GET /api/logs - 获取所有修改记录
app.get('/api/logs', (req, res) => {
  if (dbType === 'sqlite') {
    sqliteDb.all('SELECT * FROM logs ORDER BY id DESC', [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: `读取 SQLite 失败: ${err.message}` });
      }
      res.json(rows);
    });
  } else {
    try {
      const data = fs.readFileSync(FALLBACK_JSON_PATH, 'utf8');
      const logs = JSON.parse(data);
      // Sort logs descending (newest first)
      res.json(logs.sort((a, b) => b.id - a.id));
    } catch (err) {
      res.status(500).json({ error: `读取 JSON 失败: ${err.message}` });
    }
  }
});

// 2. POST /api/logs - 记录新的修改日志
app.post('/api/logs', (req, res) => {
  const { kw, chinese, action, details, version } = req.body;
  
  if (!action) {
    return res.status(400).json({ error: '必须包含 action 动作说明！' });
  }

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

  if (dbType === 'sqlite') {
    const query = 'INSERT INTO logs (timestamp, kw, chinese, action, details, version) VALUES (?, ?, ?, ?, ?, ?)';
    sqliteDb.run(query, [timeStr, kw || '', chinese || '', action, details || '', version || ''], function (err) {
      if (err) {
        return res.status(500).json({ error: `写入 SQLite 失败: ${err.message}` });
      }
      res.status(201).json({
        id: this.lastID,
        timestamp: timeStr,
        kw,
        chinese,
        action,
        details,
        version
      });
    });
  } else {
    try {
      const data = fs.readFileSync(FALLBACK_JSON_PATH, 'utf8');
      const logs = JSON.parse(data);
      
      const newLog = {
        id: logs.length > 0 ? Math.max(...logs.map(l => l.id)) + 1 : 1,
        timestamp: timeStr,
        kw: kw || '',
        chinese: chinese || '',
        action,
        details: details || '',
        version: version || ''
      };
      
      logs.push(newLog);
      fs.writeFileSync(FALLBACK_JSON_PATH, JSON.stringify(logs, null, 2), 'utf8');
      res.status(201).json(newLog);
    } catch (err) {
      res.status(500).json({ error: `写入 JSON 失败: ${err.message}` });
    }
  }
});

// 3. DELETE /api/logs - 清空所有日志
app.delete('/api/logs', (req, res) => {
  if (dbType === 'sqlite') {
    sqliteDb.run('DELETE FROM logs', [], (err) => {
      if (err) {
        return res.status(500).json({ error: `清空 SQLite 失败: ${err.message}` });
      }
      res.json({ message: '成功清空 SQLite 修改记录' });
    });
  } else {
    try {
      fs.writeFileSync(FALLBACK_JSON_PATH, JSON.stringify([], null, 2), 'utf8');
      res.json({ message: '成功清空 JSON 修改记录' });
    } catch (err) {
      res.status(500).json({ error: `清空 JSON 失败: ${err.message}` });
    }
  }
});

// 4. POST /api/sync-table - 同步多维表格结构与词条数据到本地数据库
app.post('/api/sync-table', (req, res) => {
  const { tableId, tableName, records } = req.body;
  if (!tableId || !tableName || !Array.isArray(records)) {
    return res.status(400).json({ error: '必须包含 tableId, tableName 和 records 数组！' });
  }

  if (dbType === 'sqlite') {
    sqliteDb.serialize(() => {
      // 1. 插入或更新 tables 表
      sqliteDb.run('INSERT OR REPLACE INTO tables (id, name) VALUES (?, ?)', [tableId, tableName], (err) => {
        if (err) {
          console.error('⚠️ 同步 tables 失败:', err.message);
        }
      });

      // 2. Prepare the UPSERT statement to preserve original timestamps
      const stmt = sqliteDb.prepare(`
        INSERT INTO records (recordId, tableId, kw, chinese, page, owner, translations, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(recordId, tableId) DO UPDATE SET
          kw = excluded.kw,
          chinese = excluded.chinese,
          page = excluded.page,
          owner = excluded.owner,
          translations = excluded.translations,
          updatedAt = CASE 
            WHEN kw IS NOT excluded.kw 
                 OR chinese IS NOT excluded.chinese 
                 OR page IS NOT excluded.page 
                 OR owner IS NOT excluded.owner 
                 OR translations IS NOT excluded.translations 
            THEN excluded.updatedAt 
            ELSE records.updatedAt 
          END
      `);
      
      const nowStr = new Date().toISOString();
      records.forEach(rec => {
        const fields = rec.fields || {};
        const kw = fields['KW'] || '';
        const chinese = fields['CN（中文）'] || fields['中文'] || '';
        const page = fields['所在页面'] || fields['词条所在界面（注意是界面不是模块！！）'] || '';
        const owner = fields['字号类别'] || fields['负责人'] || '';

        // Extract translation fields - collect both canonical and legacy keys
        const rawTranslations = {};
        TARGET_LANGUAGES.forEach(lang => {
          if (fields[lang] !== undefined) {
            rawTranslations[lang] = fields[lang];
          }
        });
        Object.keys(LEGACY_TO_NEW_LANG_MAP).forEach(legacyKey => {
          if (fields[legacyKey] !== undefined) {
            rawTranslations[legacyKey] = fields[legacyKey];
          }
        });
        const translations = normalizeTranslations(rawTranslations);

        const created = rec.createdAt || nowStr;
        const updated = rec.updatedAt || nowStr;

        stmt.run([
          rec.recordId,
          tableId,
          kw,
          chinese,
          page,
          owner,
          JSON.stringify(translations),
          created,
          updated
        ]);
      });

      stmt.finalize((err) => {
        if (err) {
          return res.status(500).json({ error: `批量同步 records 失败: ${err.message}` });
        }
        
        // 3. 删除在当前版本表内已经不复存在的被删除词条
        if (records.length > 0) {
          const placeholders = records.map(() => '?').join(',');
          const deleteParams = [tableId, ...records.map(r => r.recordId)];
          sqliteDb.run(`DELETE FROM records WHERE tableId = ? AND recordId NOT IN (${placeholders})`, deleteParams, (delErr) => {
            if (delErr) {
              console.error('⚠️ 清理已删除 records 失败:', delErr.message);
            }
            res.json({ message: `同步成功！共同步 ${records.length} 条词条。` });
          });
        } else {
          sqliteDb.run('DELETE FROM records WHERE tableId = ?', [tableId], (delErr) => {
            if (delErr) {
              console.error('⚠️ 清理已删除 records 失败:', delErr.message);
            }
            res.json({ message: '同步成功！已清空本表数据。' });
          });
        }
      });
    });
  } else {
    // JSON fallback
    try {
      const data = fs.readFileSync(FALLBACK_TABLES_PATH, 'utf8');
      const db = JSON.parse(data);

      // Upsert table meta
      const tableIdx = db.tables.findIndex(t => t.id === tableId);
      if (tableIdx !== -1) {
        db.tables[tableIdx].name = tableName;
      } else {
        db.tables.push({ id: tableId, name: tableName });
      }

      // Format records list
      const nowStr = new Date().toISOString();
      db.records[tableId] = records.map(rec => {
        const fields = rec.fields || {};
        const rawTranslations = {};
        TARGET_LANGUAGES.forEach(lang => {
          if (fields[lang] !== undefined) {
            rawTranslations[lang] = fields[lang];
          }
        });
        Object.keys(LEGACY_TO_NEW_LANG_MAP).forEach(legacyKey => {
          if (fields[legacyKey] !== undefined) {
            rawTranslations[legacyKey] = fields[legacyKey];
          }
        });
        const translations = normalizeTranslations(rawTranslations);

        return {
          recordId: rec.recordId,
          tableId: tableId,
          kw: fields['KW'] || '',
          chinese: fields['CN（中文）'] || fields['中文'] || '',
          page: fields['所在页面'] || fields['词条所在界面（注意是界面不是模块！！）'] || '',
          owner: fields['字号类别'] || fields['负责人'] || '',
          translations: translations,
          createdAt: rec.createdAt || nowStr,
          updatedAt: rec.updatedAt || nowStr
        };
      });

      fs.writeFileSync(FALLBACK_TABLES_PATH, JSON.stringify(db, null, 2), 'utf8');
      res.json({ message: `同步成功 (JSON Fallback)！共同步 ${records.length} 条词条。` });
    } catch (err) {
      res.status(500).json({ error: `JSON 同步失败: ${err.message}` });
    }
  }
});

// 4b. POST /api/sync-cleanup - 清理在飞书中已被物理删除的表格及词条缓存
app.post('/api/sync-cleanup', (req, res) => {
  const { activeTableIds } = req.body;
  if (!Array.isArray(activeTableIds)) {
    return res.status(400).json({ error: '必须包含 activeTableIds 数组！' });
  }

  if (dbType === 'sqlite') {
    sqliteDb.serialize(() => {
      if (activeTableIds.length === 0) {
        sqliteDb.run('DELETE FROM records', [], (err) => {
          if (err) console.error('⚠️ 清理 records 失败:', err.message);
        });
        sqliteDb.run('DELETE FROM tables', [], (err) => {
          if (err) {
            return res.status(500).json({ error: `清空 SQLite tables 失败: ${err.message}` });
          }
          res.json({ message: '已成功清理所有废弃缓存表及数据' });
        });
      } else {
        const placeholders = activeTableIds.map(() => '?').join(',');
        sqliteDb.run(`DELETE FROM records WHERE tableId NOT IN (${placeholders})`, activeTableIds, (err) => {
          if (err) console.error('⚠️ 清理 records 失败:', err.message);
        });
        sqliteDb.run(`DELETE FROM tables WHERE id NOT IN (${placeholders})`, activeTableIds, (err) => {
          if (err) {
            return res.status(500).json({ error: `清理 SQLite tables 失败: ${err.message}` });
          }
          res.json({ message: `清理成功！仅保留了 ${activeTableIds.length} 个活跃表的缓存数据` });
        });
      }
    });
  } else {
    // JSON fallback
    try {
      const data = fs.readFileSync(FALLBACK_TABLES_PATH, 'utf8');
      const db = JSON.parse(data);

      db.tables = (db.tables || []).filter(t => activeTableIds.includes(t.id));
      
      const newRecords = {};
      activeTableIds.forEach(id => {
        if (db.records[id]) {
          newRecords[id] = db.records[id];
        }
      });
      db.records = newRecords;

      fs.writeFileSync(FALLBACK_TABLES_PATH, JSON.stringify(db, null, 2), 'utf8');
      res.json({ message: '缓存清理成功 (JSON Fallback)！' });
    } catch (err) {
      res.status(500).json({ error: `JSON 缓存清理失败: ${err.message}` });
    }
  }
});

// 5. GET /api/tables - 获取所有已同步的表格列表
app.get('/api/tables', (req, res) => {
  if (dbType === 'sqlite') {
    sqliteDb.all('SELECT * FROM tables', [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: `读取 SQLite tables 失败: ${err.message}` });
      }
      res.json(rows);
    });
  } else {
    try {
      const data = fs.readFileSync(FALLBACK_TABLES_PATH, 'utf8');
      const db = JSON.parse(data);
      res.json(db.tables || []);
    } catch (err) {
      res.status(500).json({ error: `读取 JSON tables 失败: ${err.message}` });
    }
  }
});

// 6. GET /api/tables/:tableId/records - 获取某张表的所有词条
app.get('/api/tables/:tableId/records', (req, res) => {
  const { tableId } = req.params;
  if (dbType === 'sqlite') {
    sqliteDb.all('SELECT * FROM records WHERE tableId = ?', [tableId], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: `读取 SQLite records 失败: ${err.message}` });
      }
      
      const formatted = rows.map(row => {
        let trans = {};
        try {
          trans = JSON.parse(row.translations || '{}');
        } catch {}

        // Normalize legacy keys ("英文" → "EN（英文）") to canonical format
        const normalizedTrans = normalizeTranslations(trans);

        return {
          recordId: row.recordId,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          fields: {
            KW: row.kw,
            'CN（中文）': row.chinese,
            所在页面: row.page,
            字号类别: row.owner,
            ...normalizedTrans
          }
        };
      });
      res.json(formatted);
    });
  } else {
    try {
      const data = fs.readFileSync(FALLBACK_TABLES_PATH, 'utf8');
      const db = JSON.parse(data);
      const records = db.records[tableId] || [];
      const formatted = records.map(r => {
        const normalizedTrans = normalizeTranslations(r.translations || {});
        return {
          recordId: r.recordId,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          fields: {
            KW: r.kw,
            'CN（中文）': r.chinese,
            所在页面: r.page,
            字号类别: r.owner,
            ...normalizedTrans
          }
        };
      });
      res.json(formatted);
    } catch (err) {
      res.status(500).json({ error: `读取 JSON records 失败: ${err.message}` });
    }
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🌐 GlossaHub 本地数据日志服务已启动，端口: ${PORT}`);
  console.log(`👉 接口网关: http://localhost:${PORT}/api/logs`);
});
