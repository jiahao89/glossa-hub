const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'glossahub.db');
const db = new sqlite3.Database(dbPath);

function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function queryOne(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function runTest() {
  console.log('--- Starting GlossaHub v1.2 API Endpoints Integration Test ---');

  try {
    // 1. Authenticate to Express server to get JWT
    const loginRes = await fetch('http://127.0.0.1:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'wangzhaoyun', password: 'magene123' })
    });

    if (!loginRes.ok) {
      throw new Error(`Login failed: ${loginRes.status}`);
    }

    const { token } = await loginRes.json();
    console.log('✅ 1. Authenticated successfully. Token acquired.');

    // Get active versions
    const versions = await queryAll("SELECT * FROM versions WHERE project_id = 'proj-default'");
    const sourceVer = versions.find(v => v.version_name.includes('2.1'));
    const targetVer = versions.find(v => v.version_name.includes('3.3'));

    if (!sourceVer || !targetVer) {
      throw new Error('Missing C706 2.1 or CC750 3.3 versions in SQLite.');
    }

    // Locate a term to test locking
    const testTerm = await queryOne('SELECT * FROM terms WHERE version_id = ? LIMIT 1', [targetVer.id]);
    if (!testTerm) {
      throw new Error(`No terms found in version ${targetVer.version_name} to test.`);
    }

    console.log(`Using Term for locking test: KW=[${testTerm.kw}] ID=[${testTerm.id}]`);

    // 2. Test Lock toggle API (PUT /api/terms/:termId/lock)
    console.log('\nLocking the term...');
    const lockRes = await fetch(`http://127.0.0.1:3001/api/terms/${testTerm.id}/lock`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ isLocked: true })
    });

    if (!lockRes.ok) {
      throw new Error(`Failed to lock term: ${lockRes.status}`);
    }
    const lockResult = await lockRes.json();
    console.log('✅ 2. Lock response:', lockResult);

    // Verify in db
    const lockedDbTerm = await queryOne('SELECT is_locked FROM terms WHERE id = ?', [testTerm.id]);
    if (lockedDbTerm.is_locked !== 1) {
      throw new Error('Assert failed: is_locked column was not updated in SQLite.');
    }
    console.log('✅ Assert passed: term is_locked === 1 in DB.');

    // 3. Test locking constraint validation (PUT /api/terms/:termId)
    console.log('\nAttempting to edit the locked term (expecting 403 Forbidden)...');
    const editRes = await fetch(`http://127.0.0.1:3001/api/terms/${testTerm.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        kw: testTerm.kw,
        zh_cn: testTerm.zh_cn + ' (Modified)',
        translations: {},
        oldUpdatedAt: testTerm.updated_at
      })
    });

    console.log(`Edit Response Status: ${editRes.status}`);
    if (editRes.status !== 403) {
      throw new Error(`Assert failed: Edit was not blocked. Status: ${editRes.status}`);
    }
    const editResult = await editRes.json();
    console.log('✅ 3. Locked constraint verified. Server response:', editResult);

    // Unlock the term to restore sanity
    console.log('\nUnlocking the term...');
    await fetch(`http://127.0.0.1:3001/api/terms/${testTerm.id}/lock`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ isLocked: false })
    });

    // 4. Test Translation Memory Suggestions API (GET /api/versions/:versionId/terms/:kw/references)
    console.log('\nRetrieving translation suggestions (TM)...');
    const suggestRes = await fetch(`http://127.0.0.1:3001/api/versions/${targetVer.id}/terms/${encodeURIComponent(testTerm.kw)}/references`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!suggestRes.ok) {
      throw new Error(`Failed to fetch references: ${suggestRes.status}`);
    }
    const suggestions = await suggestRes.json();
    console.log(`✅ 4. TM References acquired. Found suggestions count: ${suggestions.length}`);
    if (suggestions.length > 0) {
      console.log(`- Suggestion 1 from version: [${suggestions[0].versionName}] | zh: [${suggestions[0].zh_cn}]`);
    }

    // 5. Test Batch Update Fields API (POST /api/terms/batch-update)
    console.log('\nTesting batch update for context page fields...');
    const testTerms = await queryAll('SELECT id FROM terms WHERE version_id = ? LIMIT 3', [targetVer.id]);
    const termIds = testTerms.map(t => t.id);

    const batchRes = await fetch('http://127.0.0.1:3001/api/terms/batch-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        termIds,
        updates: { context: 'TM_BATCH_TEST_PAGE', owner: 'BATCH_TEST_OWNER' }
      })
    });

    if (!batchRes.ok) {
      throw new Error(`Batch update API failed: ${batchRes.status}`);
    }
    const batchResult = await batchRes.json();
    console.log('✅ 5. Batch update response:', batchResult);

    // Verify database updates
    const updatedSample = await queryOne('SELECT context, owner FROM terms WHERE id = ?', [termIds[0]]);
    if (updatedSample.context !== 'TM_BATCH_TEST_PAGE' || updatedSample.owner !== 'BATCH_TEST_OWNER') {
      throw new Error('Assert failed: Batch update fields was not saved in DB.');
    }
    console.log('✅ Assert passed: Batch fields updated correctly.');

    // 6. Test Batch Inherit Translations (POST /api/versions/:versionId/inherit-translations)
    console.log('\nTesting merge/inherit translations...');
    const inheritRes = await fetch(`http://127.0.0.1:3001/api/versions/${targetVer.id}/inherit-translations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ sourceVersionId: sourceVer.id })
    });

    if (!inheritRes.ok) {
      throw new Error(`Inherit translations failed: ${inheritRes.status}`);
    }
    const inheritResult = await inheritRes.json();
    console.log('✅ 6. Inherit response:', inheritResult);

    // 7. Test Batch Copy Cross Version (POST /api/terms/batch-copy)
    console.log('\nTesting batch copy to other versions...');
    const copyRes = await fetch('http://127.0.0.1:3001/api/terms/batch-copy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        termIds,
        targetVersionId: sourceVer.id,
        duplicateStrategy: 'skip'
      })
    });

    if (!copyRes.ok) {
      throw new Error(`Batch copy API failed: ${copyRes.status}`);
    }
    const copyResult = await copyRes.json();
    console.log('✅ 7. Batch copy response:', copyResult);

    console.log('\n🎉 ALL GLOSSAHUB v1.2 API INTEGRATION TESTS PASSED SUCCESSFULLY!');

  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
  } finally {
    db.close();
  }
}

runTest();
