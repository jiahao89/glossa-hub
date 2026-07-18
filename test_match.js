const sourceRecords = [
  { KW: 'KW_1', 中文: 'A' },
  { KW: 'KW_2', 中文: 'B' },
  { KW: 'KW_3', 中文: 'C', 所在页面: 'Page 2' },
];

const targetRecords = [
  { KW: '', 中文: 'A' }, // Before KW generated
  { KW: 'KW_2', 中文: 'B' }, // Exact match
  { KW: 'KW_3', 中文: 'C', 所在页面: 'Page 1' }, // Modified page
  { KW: '', 中文: 'D' }, // Deleted
];

const consumedTargetIndices = new Set();
const targetPoolByKW = {};
const targetPoolByZH = {};

targetRecords.forEach((r, idx) => {
  r._originalIndex = idx;
  const kw = (r.KW || '').trim();
  const zh = (r.中文 || '').trim();
  if (kw) {
    if (!targetPoolByKW[kw]) targetPoolByKW[kw] = [];
    targetPoolByKW[kw].push(r);
  }
  if (zh) {
    if (!targetPoolByZH[zh]) targetPoolByZH[zh] = [];
    targetPoolByZH[zh].push(r);
  }
});

const compared = [];

sourceRecords.forEach(itemA => {
  const kw = (itemA.KW || '').trim();
  const zh = (itemA.中文 || '').trim();
  let itemB = null;

  if (kw && targetPoolByKW[kw] && targetPoolByKW[kw].length > 0) {
    const matchIdx = targetPoolByKW[kw].findIndex(r => !consumedTargetIndices.has(r._originalIndex));
    if (matchIdx !== -1) {
      itemB = targetPoolByKW[kw][matchIdx];
      consumedTargetIndices.add(itemB._originalIndex);
    }
  }

  if (!itemB && zh && targetPoolByZH[zh] && targetPoolByZH[zh].length > 0) {
    const matchIdx = targetPoolByZH[zh].findIndex(r => !consumedTargetIndices.has(r._originalIndex));
    if (matchIdx !== -1) {
      itemB = targetPoolByZH[zh][matchIdx];
      consumedTargetIndices.add(itemB._originalIndex);
    }
  }

  if (!itemB) {
    compared.push({ ...itemA, status: 'added' });
  } else {
    compared.push({ ...itemA, status: 'matched_or_modified', matchedWith: itemB });
  }
});

targetRecords.forEach((itemB, idx) => {
  if (!consumedTargetIndices.has(idx)) {
    compared.push({ ...itemB, status: 'deleted' });
  }
});

console.log(JSON.stringify(compared, null, 2));
