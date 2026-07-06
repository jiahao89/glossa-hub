// scripts/migrate_to_v2.js
// GlossaHub Schema v2 Data Migration Script
// Usage: 
//   - Local SQLite migration: Node scripts/migrate_to_v2.js
//   - PostgreSQL cloud migration: DATABASE_URL=postgres://user:pass@host:port/db Node scripts/migrate_to_v2.js

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'glossahub.db');
const pgUrl = process.env.DATABASE_URL;

// SHA256 helper for password hashing
function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function runMigration() {
  console.log('🏁 启动 GlossaHub v2 数据迁移程序...');
  
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ 错误: 未能在路径 ${DB_PATH} 找到源 SQLite 数据库 glossahub.db`);
    process.exit(1);
  }

  // Load sqlite3
  let sqlite3;
  try {
    sqlite3 = require('sqlite3').verbose();
  } catch {
    console.error('❌ 错误: 缺少 sqlite3 依赖。请先运行 npm install sqlite3');
    process.exit(1);
  }

  const srcDb = new sqlite3.Database(DB_PATH);

  if (pgUrl) {
    console.log('⚡ 检测到 DATABASE_URL 环境变量，正在准备迁移至 PostgreSQL...');
    await migrateToPostgres(srcDb, pgUrl);
  } else {
    console.log('📂 未检测到 DATABASE_URL，将在本地 SQLite 中执行 v2 表结构迁移与整理...');
    await migrateLocalSqlite(srcDb, sqlite3);
  }
}

// ----------------------------------------------------
// 方案 A: 本地 SQLite 表结构整理与数据迁移
// ----------------------------------------------------
async function migrateLocalSqlite(srcDb, _sqlite3) {
  srcDb.serialize(() => {
    // 1. 创建新版表结构
    console.log('🔨 创建 SQLite v2 表结构...');
    
    srcDb.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT
      )
    `);

    srcDb.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        dify_config TEXT DEFAULT '{}',
        created_at TEXT
      )
    `);

    srcDb.run(`
      CREATE TABLE IF NOT EXISTS project_members (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'viewer',
        created_at TEXT,
        UNIQUE(project_id, user_id)
      )
    `);

    srcDb.run(`
      CREATE TABLE IF NOT EXISTS versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        version_name TEXT NOT NULL,
        created_at TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(project_id, version_name)
      )
    `);

    srcDb.run(`
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

    srcDb.run(`
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
    `);

    console.log('✅ SQLite v2 表结构初始化成功。');

    // 2. 插入默认用户 (王赵云 & 史东升)
    console.log('👤 插入预设协同用户...');
    const passHash = sha256('magene123');
    srcDb.run(`
      INSERT OR IGNORE INTO users (id, username, password_hash, name, role, created_at)
      VALUES 
      ('user-wangzhaoyun', 'wangzhaoyun', ?, '王赵云', 'admin', datetime('now')),
      ('user-shidongsheng', 'shidongsheng', ?, '史东升', 'admin', datetime('now'))
    `, [passHash, passHash]);

    // 3. 创建默认项目
    console.log('📦 创建默认项目...');
    const defaultProjId = 'proj-default';
    srcDb.run(`
      INSERT OR IGNORE INTO projects (id, name, description, created_at)
      VALUES (?, '迈金智能骑行码表', 'Magene 码表固件词条多人协同翻译项目', datetime('now'))
    `, [defaultProjId]);

    // 并建立成员关联
    srcDb.run(`
      INSERT OR IGNORE INTO project_members (id, project_id, user_id, role, created_at)
      VALUES 
      ('mem-1', ?, 'user-wangzhaoyun', 'owner', datetime('now')),
      ('mem-2', ?, 'user-shidongsheng', 'owner', datetime('now'))
    `, [defaultProjId]);

    // 4. 迁移旧的 tables 到新 versions
    console.log('📁 迁移固件版本数据...');
    srcDb.all('SELECT * FROM tables', [], (err, rows) => {
      if (err) {
        // tables 表可能不存在（全新库），直接跳过
        console.log('ℹ️ 未检测到旧 tables 表，跳过历史版本迁移。');
        finishMigration(srcDb);
        return;
      }
      
      console.log(`📌 发现 ${rows.length} 个历史固件版本，正在迁移...`);
      
      let pendingVersions = rows.length;
      if (pendingVersions === 0) {
        migrateTerms(srcDb, defaultProjId);
        return;
      }

      rows.forEach(row => {
        // 直接复用原本的 tableId (row.id) 作为 versions 表的 id
        srcDb.run(`
          INSERT OR IGNORE INTO versions (id, project_id, version_name, created_at)
          VALUES (?, ?, ?, datetime('now'))
        `, [row.id, defaultProjId, row.name], (insErr) => {
          if (insErr) console.error(`⚠️ 版本 ${row.name} 迁移失败:`, insErr.message);
          pendingVersions--;
          if (pendingVersions === 0) {
            migrateTerms(srcDb, defaultProjId);
          }
        });
      });
    });
  });
}

function migrateTerms(srcDb, _defaultProjId) {
  console.log('📝 迁移词条详细数据...');
  srcDb.all('SELECT * FROM records', [], (err, rows) => {
    if (err) {
      console.log('ℹ️ 未检测到旧 records 表，跳过历史词条迁移。');
      migrateLogs(srcDb);
      return;
    }

    console.log(`📌 发现 ${rows.length} 条历史词条缓存，正在导入 terms 表...`);
    
    let pendingTerms = rows.length;
    if (pendingTerms === 0) {
      migrateLogs(srcDb);
      return;
    }

    srcDb.serialize(() => {
      // 开启事务以获得极大写入提速
      srcDb.run('BEGIN TRANSACTION');
      
      const stmt = srcDb.prepare(`
        INSERT OR REPLACE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, created_at, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'user-wangzhaoyun')
      `);

      rows.forEach((row, _idx) => {
        // termID 用 recordId，version_id 用 tableId
        stmt.run([
          row.recordId,
          row.tableId,
          row.kw,
          row.page || '',
          row.owner || '',
          row.chinese || '',
          row.translations || '{}',
          row.createdAt || '',
          row.updatedAt || ''
        ], (runErr) => {
          if (runErr) console.error(`⚠️ 词条 ${row.kw} 写入失败:`, runErr.message);
          
          pendingTerms--;
          if (pendingTerms === 0) {
            stmt.finalize(() => {
              srcDb.run('COMMIT', () => {
                console.log(`✅ 成功迁移并整合了 ${rows.length} 个词条。`);
                migrateLogs(srcDb);
              });
            });
          }
        });
      });
    });
  });
}

function migrateLogs(srcDb) {
  console.log('📜 迁移变更日志历史...');
  srcDb.all('SELECT * FROM logs', [], (err, rows) => {
    if (err) {
      console.log('ℹ️ 未检测到旧 logs 表，跳过日志迁移。');
      finishMigration(srcDb);
      return;
    }

    // 过滤掉我们新建的 logs_v2 字段或已经迁移的，只处理旧日志
    // 检查表 logs 中是否有 id 列
    console.log(`📌 发现 ${rows.length} 条修改记录，正在整合至 logs_v2...`);
    
    srcDb.serialize(() => {
      srcDb.run('BEGIN TRANSACTION');
      const stmt = srcDb.prepare(`
        INSERT INTO logs_v2 (timestamp, kw, chinese, action, details, version_name, user_id)
        VALUES (?, ?, ?, ?, ?, ?, 'user-wangzhaoyun')
      `);

      rows.forEach(row => {
        stmt.run([
          row.timestamp,
          row.kw || '',
          row.chinese || '',
          row.action,
          row.details || '',
          row.version || ''
        ]);
      });

      stmt.finalize(() => {
        srcDb.run('COMMIT', () => {
          console.log('✅ 修改日志迁移成功。');
          finishMigration(srcDb);
        });
      });
    });
  });
}

function finishMigration(srcDb) {
  console.log('🎉 恭喜！本地 SQLite 数据库升级至 v2 版本圆满完成！');
  console.log('👉 新表 user, projects, project_members, versions, terms 均已就绪。');
  srcDb.close();
}

// ----------------------------------------------------
// 方案 B: 迁移数据至云端 PostgreSQL 数据库
// ----------------------------------------------------
async function migrateToPostgres(srcDb, pgUrl) {
  let Client;
  try {
    ({ Client } = require('pg'));
  } catch {
    console.error('❌ 错误: 缺少 pg 依赖。请先运行 npm install pg');
    srcDb.close();
    process.exit(1);
  }

  const pgClient = new Client({
    connectionString: pgUrl,
    ssl: pgUrl.includes('supabase') ? { rejectUnauthorized: false } : false
  });

  try {
    await pgClient.connect();
    console.log('⚡ 成功连接到云端 PostgreSQL 数据库！');
  } catch (err) {
    console.error('❌ 无法连接到 PostgreSQL:', err.message);
    srcDb.close();
    process.exit(1);
  }

  // 1. 执行 PostgreSQL 数据表初始化 (这里提供 DDL 创建，防止云端未先建表)
  console.log('🔨 初始化云端 PostgreSQL 数据表结构...');
  try {
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS projects (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          dify_config JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS project_members (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'viewer',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(project_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS versions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          version_name TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(project_id, version_name)
      );
      CREATE TABLE IF NOT EXISTS terms (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          version_id UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
          kw TEXT NOT NULL,
          context TEXT,
          owner TEXT,
          zh_cn TEXT NOT NULL,
          translations JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
          UNIQUE(version_id, kw)
      );
      CREATE TABLE IF NOT EXISTS logs (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          kw TEXT,
          chinese TEXT,
          action TEXT NOT NULL,
          details TEXT,
          version_name TEXT,
          user_id UUID REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    console.log('✅ PostgreSQL 数据表结构建立完毕。');
  } catch (err) {
    console.error('❌ 初始化 PostgreSQL 数据表失败:', err.message);
    await pgClient.end();
    srcDb.close();
    process.exit(1);
  }

  // 2. 插入预置用户，并记录 UUID
  const passHash = sha256('magene123');
  let wangId, shengId;
  try {
    // 写入 王赵云
    const resWang = await pgClient.query(`
      INSERT INTO users (username, password_hash, name, role)
      VALUES ('wangzhaoyun', $1, '王赵云', 'admin')
      ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
      RETURNING id;
    `, [passHash]);
    wangId = resWang.rows[0].id;

    // 写入 史东升
    const resSheng = await pgClient.query(`
      INSERT INTO users (username, password_hash, name, role)
      VALUES ('shidongsheng', $1, '史东升', 'admin')
      ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
      RETURNING id;
    `, [passHash]);
    shengId = resSheng.rows[0].id;
    console.log(`👤 预设云端用户就绪 (王赵云 ID: ${wangId}, 史东升 ID: ${shengId})`);
  } catch (err) {
    console.error('❌ 预设用户建立失败:', err.message);
    await pgClient.end();
    srcDb.close();
    process.exit(1);
  }

  // 3. 创建默认项目
  let projId;
  try {
    const resProj = await pgClient.query(`
      INSERT INTO projects (name, description)
      VALUES ('迈金智能骑行码表', 'Magene 码表固件词条多人协同翻译项目')
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    projId = resProj.rows[0].id;
    console.log(`📦 默认项目已就绪: ${projId}`);

    // 项目成员关联
    await pgClient.query(`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES ($1, $2, 'owner'), ($1, $3, 'owner')
      ON CONFLICT (project_id, user_id) DO NOTHING;
    `, [projId, wangId, shengId]);
  } catch (err) {
    console.error('❌ 建立项目关联失败:', err.message);
    await pgClient.end();
    srcDb.close();
    process.exit(1);
  }

  // 4. 读取旧的 tables 数据
  srcDb.all('SELECT * FROM tables', [], async (err, tables) => {
    if (err) {
      console.log('ℹ️ 未在 SQLite 中检测到旧 tables 数据，迁移结束。');
      await pgClient.end();
      srcDb.close();
      return;
    }

    console.log(`📌 读出 ${tables.length} 个历史固件版本表，正在同步至云端...`);
    const versionMap = new Map(); // tableId (text) -> versionId (UUID)

    for (const tbl of tables) {
      try {
        const resVer = await pgClient.query(`
          INSERT INTO versions (project_id, version_name)
          VALUES ($1, $2)
          ON CONFLICT (project_id, version_name) DO UPDATE SET version_name = EXCLUDED.version_name
          RETURNING id;
        `, [projId, tbl.name]);
        versionMap.set(tbl.id, resVer.rows[0].id);
      } catch (verErr) {
        console.error(`⚠️ 版本 ${tbl.name} 同步失败:`, verErr.message);
      }
    }

    // 5. 迁移词条
    srcDb.all('SELECT * FROM records', [], async (recErr, records) => {
      if (recErr || records.length === 0) {
        console.log('ℹ️ 未检测到旧 records 词条数据。');
        await migratePgLogs(srcDb, pgClient, wangId);
        return;
      }

      console.log(`📌 读出 ${records.length} 条历史词条缓存，正在批量插入 PostgreSQL terms 表...`);
      
      const chunkSize = 200;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        
        // 构建批量插入语句
        // params array: [version_id1, kw1, context1, owner1, zh_cn1, translations1, ...]
        const valuePlaceholders = [];
        const queryParams = [];
        
        chunk.forEach((rec, _idx) => {
          const mappedVerId = versionMap.get(rec.tableId);
          if (!mappedVerId) return; // 对应版本丢失，跳过

          const offset = queryParams.length;
          valuePlaceholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`);
          
          let transObj = {};
          try {
            transObj = JSON.parse(rec.translations || '{}');
          } catch {}

          queryParams.push(
            mappedVerId,
            rec.kw,
            rec.page || '',
            rec.owner || '',
            rec.chinese || '',
            JSON.stringify(transObj),
            rec.createdAt ? new Date(rec.createdAt) : new Date(),
            rec.updatedAt ? new Date(rec.updatedAt) : new Date(),
            wangId
          );
        });

        if (queryParams.length > 0) {
          try {
            const sql = `
              INSERT INTO terms (version_id, kw, context, owner, zh_cn, translations, created_at, updated_at, updated_by)
              VALUES ${valuePlaceholders.join(',')}
              ON CONFLICT (version_id, kw) DO UPDATE SET
                context = EXCLUDED.context,
                owner = EXCLUDED.owner,
                zh_cn = EXCLUDED.zh_cn,
                translations = EXCLUDED.translations,
                updated_at = EXCLUDED.updated_at,
                updated_by = EXCLUDED.updated_by;
            `;
            await pgClient.query(sql, queryParams);
          } catch (chunkErr) {
            console.error(`⚠️ 写入分片 [${i} - ${i + chunkSize}] 发生错误:`, chunkErr.message);
          }
        }
      }
      
      console.log(`✅ 成功向 PostgreSQL 同步迁移了 ${records.length} 个词条。`);
      await migratePgLogs(srcDb, pgClient, wangId);
    });
  });
}

async function migratePgLogs(srcDb, pgClient, _wangId) {
  srcDb.all('SELECT * FROM logs', [], async (err, logs) => {
    if (err || logs.length === 0) {
      console.log('ℹ️ 未检测到旧 logs 修改记录。');
      await closeAll(srcDb, pgClient);
      return;
    }

    console.log(`📌 读出 ${logs.length} 条历史修改记录，正在同步至云端 PostgreSQL...`);
    
    // 批量导入
    const chunkSize = 200;
    for (let i = 0; i < logs.length; i += chunkSize) {
      const chunk = logs.slice(i, i + chunkSize);
      const valuePlaceholders = [];
      const queryParams = [];

      chunk.forEach((row) => {
        const offset = queryParams.length;
        valuePlaceholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
        
        queryParams.push(
          row.timestamp ? new Date(row.timestamp) : new Date(),
          row.kw || '',
          row.chinese || '',
          row.action,
          row.details || '',
          row.version || ''
        );
      });

      if (queryParams.length > 0) {
        try {
          const sql = `
            INSERT INTO logs (timestamp, kw, chinese, action, details, version_name, user_id)
            VALUES ${valuePlaceholders.join(',')}
          `;
          await pgClient.query(sql, [...queryParams]);
        } catch (logErr) {
          console.error(`⚠️ 写入日志分片发生错误:`, logErr.message);
        }
      }
    }
    
    console.log('✅ 修改日志迁移成功。');
    await closeAll(srcDb, pgClient);
  });
}

async function closeAll(srcDb, pgClient) {
  console.log('🎉 恭喜！云端 PostgreSQL 数据迁移完毕！');
  await pgClient.end();
  srcDb.close();
}

// 执行迁移
runMigration().catch(err => {
  console.error('❌ 迁移过程中发生未捕获异常:', err);
});
