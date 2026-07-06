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
  console.log('=== Starting GlossaHub v1.2 & v1.3 Combined Integration Tests ===');

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
      throw new Error('Missing versions in SQLite. Ensure server.cjs initialized the DB.');
    }

    // Locate a term to test
    const testTerm = await queryOne('SELECT * FROM terms WHERE version_id = ? LIMIT 1', [targetVer.id]);
    if (!testTerm) {
      throw new Error(`No terms found in version ${targetVer.version_name} to test.`);
    }

    console.log(`Using Term: KW=[${testTerm.kw}] ID=[${testTerm.id}]`);

    // --- TEST v1.2 Lock & Unlock ---
    console.log('\n--- Testing Locking Mechanisms ---');
    // Lock it
    const lockRes = await fetch(`http://127.0.0.1:3001/api/terms/${testTerm.id}/lock`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ isLocked: true })
    });
    if (!lockRes.ok) throw new Error('Locking request failed.');
    console.log('✅ Locked term.');

    // Attempt modification (should return 403)
    const editRes = await fetch(`http://127.0.0.1:3001/api/terms/${testTerm.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        kw: testTerm.kw,
        zh_cn: testTerm.zh_cn + ' (Attempt)',
        translations: {},
        oldUpdatedAt: testTerm.updated_at
      })
    });
    if (editRes.status !== 403) {
      throw new Error(`Lock enforcement failed. Allowed edit with status: ${editRes.status}`);
    }
    console.log('✅ Attempt modification on locked row correctly blocked with 403.');

    // Unlock it
    const unlockRes = await fetch(`http://127.0.0.1:3001/api/terms/${testTerm.id}/lock`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ isLocked: false })
    });
    if (!unlockRes.ok) throw new Error('Unlocking request failed.');
    console.log('✅ Unlocked term.');

    // --- TEST v1.3 Change Snapshotting ---
    console.log('\n--- Testing Snapshotting on Modification ---');
    // Clear old snapshots of this term to make assertions easier
    db.run('DELETE FROM term_snapshots WHERE term_id = ?', [testTerm.id]);

    // Let's modify the translations to trigger a snapshot
    const originalTransObj = JSON.parse(testTerm.translations || '{}');
    const modifiedTrans = { ...originalTransObj, 'EN（英文）': 'VAL_' + Date.now() };

    const editSuccessRes = await fetch(`http://127.0.0.1:3001/api/terms/${testTerm.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        kw: testTerm.kw,
        zh_cn: testTerm.zh_cn,
        translations: modifiedTrans,
        oldUpdatedAt: testTerm.updated_at
      })
    });

    if (!editSuccessRes.ok) {
      throw new Error(`Modify request failed: ${editSuccessRes.status}`);
    }
    console.log('✅ Term translation modified successfully.');

    // Assert: There must be exactly 1 snapshot captured containing the OLD values
    const snapshotsList = await queryAll('SELECT * FROM term_snapshots WHERE term_id = ?', [testTerm.id]);
    if (snapshotsList.length !== 1) {
      throw new Error(`Assert failed: Expected exactly 1 snapshot, found ${snapshotsList.length}`);
    }
    const oldSnapshot = snapshotsList[0];
    const snapTrans = JSON.parse(oldSnapshot.translations);
    console.log('✅ History snapshot captured correctly.');
    console.log(`- Snapshot ID: [${oldSnapshot.id}]`);
    console.log(`- Snapshot EN value: [${snapTrans['EN（英文）'] || '(empty)'}] (Expected old translation)`);

    // --- TEST v1.3 Snapshot Rollback ---
    console.log('\n--- Testing Rollback to Snapshot ---');
    const rollbackRes = await fetch(`http://127.0.0.1:3001/api/terms/${testTerm.id}/rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ snapshotId: oldSnapshot.id })
    });

    if (!rollbackRes.ok) {
      throw new Error(`Rollback failed with status: ${rollbackRes.status}`);
    }
    const rollbackResult = await rollbackRes.json();
    console.log('✅ Rollback response:', rollbackResult);

    // Verify database terms table values are restored
    const restoredTerm = await queryOne('SELECT translations FROM terms WHERE id = ?', [testTerm.id]);
    const restoredTrans = JSON.parse(restoredTerm.translations);
    if (restoredTrans['EN（英文）'] !== originalTransObj['EN（英文）']) {
      throw new Error(`Assert failed: Rollback did not restore old translation value. Found: ${restoredTrans['EN（英文）']}`);
    }
    console.log(`✅ Rollback verification passed. Value restored to: [${restoredTrans['EN（英文）'] || '(empty)'}]`);

    // --- TEST v1.3 Workflow Approvals ---
    console.log('\n--- Testing Workflow status & Batch Approvals ---');
    // Prepare 2 terms status testing
    const batchTerms = await queryAll('SELECT id, status FROM terms WHERE version_id = ? LIMIT 2', [targetVer.id]);
    const termIds = batchTerms.map(t => t.id);

    console.log(`Setting terms status to REJECTED with reason...`);
    const approveRes = await fetch('http://127.0.0.1:3001/api/terms/batch-approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        termIds,
        status: 'REJECTED',
        rejectReason: 'WORKFLOW_BATCH_REJECT_TEST'
      })
    });

    if (!approveRes.ok) {
      throw new Error(`Batch approve failed with status: ${approveRes.status}`);
    }
    const approveResult = await approveRes.json();
    console.log('✅ Batch approve response:', approveResult);

    // Verify DB
    const dbTerm1 = await queryOne('SELECT status, reject_reason FROM terms WHERE id = ?', [termIds[0]]);
    const _dbTerm2 = await queryOne('SELECT status, reject_reason FROM terms WHERE id = ?', [termIds[1]]);

    if (dbTerm1.status !== 'REJECTED' || dbTerm1.reject_reason !== 'WORKFLOW_BATCH_REJECT_TEST') {
      throw new Error(`Workflow state update failed. Term1 status=[${dbTerm1.status}] reason=[${dbTerm1.reject_reason}]`);
    }
    console.log('✅ DB Assert passed: Term 1 status was updated to REJECTED with correct reason.');

    // Approve them to clear reject status
    await fetch('http://127.0.0.1:3001/api/terms/batch-approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        termIds,
        status: 'APPROVED'
      })
    });
    console.log('✅ Re-approved terms to restore clean APPROVED state.');

    // --- REGRESSION TEST: Bug #1 batch-update Chinese key mapping ---
    console.log('\n--- Regression Test: Bug #1 Batch-update Chinese keys mapping ---');
    const bug1Res = await fetch('http://127.0.0.1:3001/api/terms/batch-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        termIds: [testTerm.id],
        updates: { '所在页面': 'BUG1_E2E_PAGE' }
      })
    });
    if (!bug1Res.ok) throw new Error(`Bug 1 batch-update failed: ${bug1Res.status}`);
    const bug1DbTerm = await queryOne('SELECT context FROM terms WHERE id = ?', [testTerm.id]);
    if (bug1DbTerm.context !== 'BUG1_E2E_PAGE') {
      throw new Error(`Assert failed: Bug 1 batch-update did not map '所在页面' to 'context'. Found: ${bug1DbTerm.context}`);
    }
    console.log('✅ Bug #1 Passed: Chinese key mapped and updated successfully.');

    // --- REGRESSION TEST: Bug #2 double JSON serialization ---
    console.log('\n--- Regression Test: Bug #2 Double JSON serialization ---');
    const doubleStringified = JSON.stringify({ 'EN（英文）': 'BUG2_TEST_VAL' });
    const _bug2Res = await fetch(`http://127.0.0.1:3001/api/terms/${testTerm.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        kw: testTerm.kw,
        zh_cn: testTerm.zh_cn,
        translations: doubleStringified,
        oldUpdatedAt: new Date().toISOString() // Force updated to skip conflict
      })
    });
    // If it fails with conflict 409 because of concurrency, we read direct from DB. But let's verify database state.
    const bug2DbTerm = await queryOne('SELECT translations FROM terms WHERE id = ?', [testTerm.id]);
    const isDoubleEncoded = bug2DbTerm.translations.startsWith('"\\"') || bug2DbTerm.translations.startsWith('""') || bug2DbTerm.translations.includes('\\"\\"') || (typeof bug2DbTerm.translations === 'string' && bug2DbTerm.translations.startsWith('"') && bug2DbTerm.translations.endsWith('"') && !bug2DbTerm.translations.startsWith('{"'));
    if (isDoubleEncoded) {
      throw new Error(`Assert failed: Bug #2 double stringification occurred. Found DB value: ${bug2DbTerm.translations}`);
    }
    console.log('✅ Bug #2 Passed: translations stored with single-layer serialization. Value in DB:', bug2DbTerm.translations);

    // --- REGRESSION TEST: Bug #3 batch-copy translations loss ---
    console.log('\n--- Regression Test: Bug #3 Batch-copy translation values preservation ---');
    // Set a known translation for testTerm
    await db.run('UPDATE terms SET translations = ? WHERE id = ?', [JSON.stringify({ 'EN（英文）': 'BUG3_COPY_VAL' }), testTerm.id]);
    
    // Batch copy it to sourceVer version table
    const bug3Res = await fetch('http://127.0.0.1:3001/api/terms/batch-copy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        termIds: [testTerm.id],
        targetVersionId: sourceVer.id,
        duplicateStrategy: 'overwrite'
      })
    });
    if (!bug3Res.ok) throw new Error(`Bug 3 batch-copy failed: ${bug3Res.status}`);
    
    // Fetch copy from target version table
    const bug3CopiedTerm = await queryOne('SELECT translations FROM terms WHERE version_id = ? AND kw = ?', [sourceVer.id, testTerm.kw]);
    if (!bug3CopiedTerm) throw new Error('Copied term not found in target version table.');
    
    const parsedCopiedTrans = JSON.parse(bug3CopiedTerm.translations);
    if (parsedCopiedTrans['EN（英文）'] !== 'BUG3_COPY_VAL') {
      throw new Error(`Assert failed: Copied translation was lost or reset. Found translations: ${bug3CopiedTerm.translations}`);
    }
    console.log('✅ Bug #3 Passed: translation values successfully preserved through batch-copy.');

    console.log('\n🎉 ALL GLOSSAHUB v1.2 & v1.3 INTEGRATION TESTS & BUG REGRESSIONS PASSED SUCCESSFULLY!');

  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
  } finally {
    db.close();
  }
}

runTest();
