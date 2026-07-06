const fs = require('fs');
const http = require('http');

// 1. Re-implement parseCSV locally to match utils/csvHelper.js
function parseCSV(text) {
  const result = [];
  let row = [''];
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    
    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') {
        i++;
      }
      result.push(row);
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    result.push(row);
  }
  return result;
}

// 2. Perform the exact parsing logic as in GlossaryTab.jsx
function parseGlossaryCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const csvRows = parseCSV(text);
  if (csvRows.length === 0) {
    throw new Error('CSV is empty');
  }

  let startIdx = 0;
  let cnIdx = 0;
  let enIdx = 1;
  let descIdx = 2;

  const firstRow = csvRows[0].map(h => h.trim().toLowerCase());
  const isHeaderMatch = (h) => {
    if (h === 'cn' || h === 'zh' || h === 'term' || h === 'chinese' || h === 'key' || h.includes('中文') || h.includes('词条') || h.includes('键名')) return 'cn';
    if (h === 'en' || h === 'english' || h === 'translation' || h.includes('英文') || h.includes('翻译') || h.includes('译文')) return 'en';
    if (h === 'desc' || h === 'description' || h === 'info' || h === 'context' || h === 'remark' || h.includes('说明') || h.includes('定义') || h.includes('释义') || h.includes('备注')) return 'desc';
    return null;
  };

  const hasHeader = firstRow.some(h => isHeaderMatch(h) !== null);

  if (hasHeader) {
    startIdx = 1;
    const foundCn = firstRow.findIndex(h => isHeaderMatch(h) === 'cn');
    if (foundCn !== -1) cnIdx = foundCn;
    const foundEn = firstRow.findIndex(h => isHeaderMatch(h) === 'en');
    if (foundEn !== -1) enIdx = foundEn;
    const foundDesc = firstRow.findIndex(h => isHeaderMatch(h) === 'desc');
    if (foundDesc !== -1) descIdx = foundDesc;
  }

  const rawHeaders = csvRows[0].map(h => h.trim());
  const parsedTerms = [];
  for (let i = startIdx; i < csvRows.length; i++) {
    const row = csvRows[i];
    if (!row || row.length === 0) continue;
    
    const cnTerm = (row[cnIdx] || '').trim();
    const enTerm = (row[enIdx] || '').trim();
    const description = (row[descIdx] || '').trim();

    const rowFields = {};
    rawHeaders.forEach((headerName, index) => {
      rowFields[headerName] = (row[index] || '').trim();
    });

    if (cnTerm || enTerm) {
      parsedTerms.push({ cnTerm, enTerm, description, fields: rowFields });
    }
  }

  return parsedTerms;
}

// 3. Helper to make HTTP requests
function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, rawBody: data });
        }
      });
    });
    req.on('error', (e) => reject(e));
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

const csvPath = '/Users/jacko/Desktop/Projects/glossa-hub/design/PV 3.3.csv';
const targetTableId = '37cccf5c-494b-4769-b115-91ab1b9d4b24';

async function runE2ETest() {
  console.log('--- E2E Glossary Import Test ---');
  try {
    // A. Parse local CSV
    console.log(`Parsing test CSV: ${csvPath}`);
    const parsedList = parseGlossaryCsv(csvPath);
    console.log(`Successfully parsed ${parsedList.length} items from CSV.`);
    console.log('Sample item:', parsedList[0]);

    // B. Login to get JWT Token
    console.log('\nLogging in to backend...');
    const loginRes = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, { username: 'wangzhaoyun', password: 'magene123' });

    if (loginRes.status !== 200) {
      throw new Error(`Login failed with status ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
    }
    const token = loginRes.body.token;
    console.log('Successfully logged in. Token acquired.');

    // C. Send parsed terms to backend glossary import API
    console.log(`\nSending batch terms (size: ${parsedList.length}) to backend...`);
    const importRes = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: `/api/glossary-tables/${targetTableId}/terms`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, { 
      termsList: parsedList, 
      headers: ["所在页面", "字号类别", "KW", "CN（中文）", "EN（英文）", "FR（法）", "DE（德）", "ES（西班牙）", "IT（意大利）", "PT（葡萄牙）", "KO（韩）", "JP（日）", "RU（俄罗斯）", "PL（波兰）", "TC（繁）", "DA（丹麦）", "CZ(捷克)", "瑞典", "挪威", "荷兰"]
    });

    console.log('Backend response status:', importRes.status);
    console.log('Backend response body:', importRes.body);

    if (importRes.status === 201) {
      console.log('\n✅ E2E Integration test succeeded! All terms imported successfully.');
    } else {
      console.error('\n❌ E2E Integration test failed!');
    }

  } catch (err) {
    console.error('\n❌ Error running E2E test:', err.message);
  }
}

runE2ETest();
