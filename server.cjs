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

      // 2. 删除该表原有的所有词条数据
      sqliteDb.run('DELETE FROM records WHERE tableId = ?', [tableId], (err) => {
        if (err) {
          console.error('⚠️ 清理旧 records 失败:', err.message);
        }
      });

      // 3. 批量插入新词条
      const stmt = sqliteDb.prepare(`
        INSERT OR REPLACE INTO records (recordId, tableId, kw, chinese, page, owner, translations, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const nowStr = new Date().toISOString();
      records.forEach(rec => {
        const fields = rec.fields || {};
        const kw = fields['KW'] || '';
        const chinese = fields['中文'] || '';
        const page = fields['所在页面'] || fields['词条所在界面（注意是界面不是模块！！）'] || '';
        const owner = fields['负责人'] || '';

        // Extract translation fields
        const translations = {};
        const TARGET_LANGUAGES = [
          '英文', '法语', '德语', '西班牙语', '意大利语', '葡萄牙语', '韩语', '日语', '俄语', '波兰语', 
          '繁体中文', '丹麦语', '捷克语', '瑞典语', '挪威语', '荷兰语', '泰语', '芬兰语', '土耳其语'
        ];
        TARGET_LANGUAGES.forEach(lang => {
          if (fields[lang] !== undefined) {
            translations[lang] = fields[lang];
          }
        });

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
        res.json({ message: `同步成功！共同步 ${records.length} 条词条。` });
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
        const translations = {};
        const TARGET_LANGUAGES = [
          '英文', '法语', '德语', '西班牙语', '意大利语', '葡萄牙语', '韩语', '日语', '俄语', '波兰语', 
          '繁体中文', '丹麦语', '捷克语', '瑞典语', '挪威语', '荷兰语', '泰语', '芬兰语', '土耳其语'
        ];
        TARGET_LANGUAGES.forEach(lang => {
          if (fields[lang] !== undefined) {
            translations[lang] = fields[lang];
          }
        });

        return {
          recordId: rec.recordId,
          tableId: tableId,
          kw: fields['KW'] || '',
          chinese: fields['中文'] || '',
          page: fields['所在页面'] || fields['词条所在界面（注意是界面不是模块！！）'] || '',
          owner: fields['负责人'] || '',
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

        return {
          recordId: row.recordId,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          fields: {
            KW: row.kw,
            中文: row.chinese,
            所在页面: row.page,
            负责人: row.owner,
            ...trans
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
      const formatted = records.map(r => ({
        recordId: r.recordId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        fields: {
          KW: r.kw,
          中文: r.chinese,
          所在页面: r.page,
          负责人: r.owner,
          ...(r.translations || {})
        }
      }));
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
