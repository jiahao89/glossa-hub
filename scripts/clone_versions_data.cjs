const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, '..', 'glossahub.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite database.');
});

// Promise-based wrappers
function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function startCloning() {
  try {
    // 1. Fetch all translation versions (tables)
    console.log('\n--- Fetching current versions ---');
    const versions = await queryAll("SELECT * FROM versions WHERE project_id = 'proj-default'");
    console.log(`Found ${versions.length} versions:`);
    for (const v of versions) {
      const [{ count }] = await queryAll('SELECT count(*) as count FROM terms WHERE version_id = ?', [v.id]);
      v.termsCount = count;
      console.log(`- ID: ${v.id} | Name: ${v.version_name} | Existing terms count: ${v.termsCount}`);
    }

    // 2. Identify source and targets
    const sourceVersion = versions.find(v => v.termsCount > 0);
    const targetVersions = versions.filter(v => v.termsCount === 0);

    if (!sourceVersion) {
      console.log('\n❌ Error: No source version found with existing data! Cannot clone.');
      db.close();
      return;
    }

    if (targetVersions.length === 0) {
      console.log('\n✅ All versions already have data. No empty versions to clone into.');
      db.close();
      return;
    }

    console.log(`\nFound source version [${sourceVersion.version_name}] (ID: ${sourceVersion.id}) containing ${sourceVersion.termsCount} terms.`);
    console.log(`Targeting empty versions to populate: ${targetVersions.map(t => `[${t.version_name}]`).join(', ')}`);

    // 3. Load all terms from source
    const sourceTerms = await queryAll('SELECT * FROM terms WHERE version_id = ?', [sourceVersion.id]);
    console.log(`Loaded ${sourceTerms.length} terms from source.`);

    // 4. Start transaction and clone
    await runSql('BEGIN TRANSACTION');
    try {
      const createdTime = new Date().toISOString();
      for (const target of targetVersions) {
        console.log(`Cloning into target table: [${target.version_name}]...`);
        // Safely clear any stray partial records first
        await runSql('DELETE FROM terms WHERE version_id = ?', [target.id]);

        for (const term of sourceTerms) {
          const newId = crypto.randomUUID();
          await runSql(
            `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newId,
              target.id,
              term.kw,
              term.context,
              term.owner,
              term.zh_cn,
              term.translations,
              createdTime,
              createdTime
            ]
          );
        }
      }
      await runSql('COMMIT');
      console.log('\n🎉 Cloning completed successfully! All three versions now have identical term datasets.');
    } catch (txErr) {
      await runSql('ROLLBACK');
      throw txErr;
    }

    // 5. Verify final counts
    console.log('\n--- Final verification ---');
    const finalVersions = await queryAll("SELECT * FROM versions WHERE project_id = 'proj-default'");
    for (const v of finalVersions) {
      const [{ count }] = await queryAll('SELECT count(*) as count FROM terms WHERE version_id = ?', [v.id]);
      console.log(`- ID: ${v.id} | Name: ${v.version_name} | Verified terms count: ${count}`);
    }

  } catch (err) {
    console.error('\n❌ Cloning process failed:', err.message);
  } finally {
    db.close();
  }
}

startCloning();
