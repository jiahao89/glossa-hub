const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, '..', 'glossahub.db');
const sqliteDb = new sqlite3.Database(dbPath);

const db = {
  async run(sql, params = []) {
    const sqliteSql = sql.replace(/\$\d+/g, '?');
    return new Promise((resolve, reject) => {
      sqliteDb.run(sqliteSql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
};

const mockTerms = [
  { cnTerm: '踏频', enTerm: 'Cadence', description: '每分钟踏步圈数' },
  { cnTerm: '心率', enTerm: 'Heart Rate', description: '每分钟心跳次数' }
];

const tableId = '37cccf5c-494b-4769-b115-91ab1b9d4b24';

async function runTest() {
  console.log('Starting transaction test...');
  try {
    await db.run('BEGIN TRANSACTION');
    console.log('BEGIN TRANSACTION succeeded.');
    
    await db.run('DELETE FROM glossary_terms WHERE table_id = $1', [tableId]);
    console.log('DELETE statement succeeded.');

    const createdTime = new Date().toISOString();
    for (const t of mockTerms) {
      const termId = crypto.randomUUID();
      await db.run(
        'INSERT INTO glossary_terms (id, table_id, cn_term, en_term, description, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [termId, tableId, t.cnTerm.trim(), t.enTerm.trim(), (t.description || '').trim(), createdTime]
      );
      console.log(`Inserted term: ${t.cnTerm}`);
    }

    await db.run('COMMIT');
    console.log('COMMIT succeeded.');
  } catch (err) {
    console.error('Transaction failed! Attempting ROLLBACK...');
    try {
      await db.run('ROLLBACK');
      console.log('ROLLBACK succeeded.');
    } catch (rollErr) {
      console.error('ROLLBACK failed:', rollErr.message);
    }
    console.error('Original Error:', err);
  } finally {
    sqliteDb.close();
  }
}

runTest();
