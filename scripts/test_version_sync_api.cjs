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

async function runTest() {
  console.log('--- Starting Version Sync API Integration Test ---');

  try {
    // 1. Authenticate to Express server to get JWT
    const loginRes = await fetch('http://127.0.0.1:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'wangzhaoyun', password: 'magene123' })
    });

    if (!loginRes.ok) {
      throw new Error(`Login failed with status: ${loginRes.status}`);
    }

    const { token } = await loginRes.json();
    console.log('✅ Logged in successfully. Token acquired.');

    // 2. Fetch versions to locate source and target table ids
    const versions = await queryAll("SELECT * FROM versions WHERE project_id = 'proj-default'");
    const sourceVer = versions.find(v => v.version_name.includes('2.1'));
    const targetVer = versions.find(v => v.version_name.includes('3.3'));

    if (!sourceVer || !targetVer) {
      throw new Error('Could not find C706 2.1 or CC750 3.3 versions in db.');
    }

    console.log(`Using Source: [${sourceVer.version_name}] (ID: ${sourceVer.id})`);
    console.log(`Using Target: [${targetVer.version_name}] (ID: ${targetVer.id})`);

    // 3. Define actions (1 ADD, 1 MOD)
    const testKw = 'KW_TEST_AUTOSYNC_ADD_999';
    const syncActions = [
      {
        type: 'ADD',
        kw: testKw,
        data: {
          context: '测试页面',
          zh_cn: '测试一键同步',
          translations: {
            'EN（英文）': 'Test Auto Sync',
            'FR（法）': 'Test Synchro Auto'
          }
        }
      },
      {
        type: 'MOD',
        kw: 'KW_USER_NO_RECORD',
        data: {
          context: '历史记录空页面',
          zh_cn: '暂无记录，使用码表骑行后查看记录',
          translations: {
            'EN（英文）': 'No records found. Sync update test!'
          }
        }
      }
    ];

    console.log('\nSubmitting sync actions (ADD and MOD)...');
    const syncRes = await fetch('http://127.0.0.1:3001/api/versions/sync-terms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        sourceVersionId: sourceVer.id,
        targetVersionId: targetVer.id,
        syncActions
      })
    });

    if (!syncRes.ok) {
      const errorText = await syncRes.text();
      throw new Error(`Sync API failed: ${syncRes.status} | ${errorText}`);
    }

    const syncResult = await syncRes.json();
    console.log('✅ Sync response:', syncResult);

    // 4. Assert changes in target table
    const [addedRow] = await queryAll('SELECT * FROM terms WHERE version_id = ? AND kw = ?', [targetVer.id, testKw]);
    if (!addedRow) {
      throw new Error(`Assert failed: Row ${testKw} was not inserted in target table.`);
    }
    console.log('✅ Assert passed: Term correctly inserted.');
    console.log(`- Inserted translations: ${addedRow.translations}`);

    const [modRow] = await queryAll('SELECT * FROM terms WHERE version_id = ? AND kw = ?', [targetVer.id, 'KW_USER_NO_RECORD']);
    if (!modRow || !modRow.translations.includes('Sync update test!')) {
      throw new Error(`Assert failed: Row KW_USER_NO_RECORD was not updated.`);
    }
    console.log('✅ Assert passed: Term translations correctly overwritten in target table.');

    // 5. Test deletion (DEL action)
    console.log('\nSubmitting deletion (DEL) sync action...');
    const delRes = await fetch('http://127.0.0.1:3001/api/versions/sync-terms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        sourceVersionId: sourceVer.id,
        targetVersionId: targetVer.id,
        syncActions: [{ type: 'DEL', kw: testKw }]
      })
    });

    if (!delRes.ok) {
      throw new Error(`Deletion API failed: ${delRes.status}`);
    }

    const delResult = await delRes.json();
    console.log('✅ Deletion response:', delResult);

    const [deletedRow] = await queryAll('SELECT * FROM terms WHERE version_id = ? AND kw = ?', [targetVer.id, testKw]);
    if (deletedRow) {
      throw new Error(`Assert failed: Row ${testKw} was not deleted from target table.`);
    }
    console.log('✅ Assert passed: Term correctly deleted from target table.');

    // 6. Verify audit logs in database
    const logsTable = 'logs_v2';
    const lastLogs = await queryAll(`SELECT * FROM ${logsTable} ORDER BY id DESC LIMIT 2`);
    console.log('\nChecking audit log entries:');
    lastLogs.forEach(log => {
      console.log(`- [${log.timestamp}] Action: ${log.action} | Detail: ${log.details}`);
    });

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!');

  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
  } finally {
    db.close();
  }
}

runTest();
