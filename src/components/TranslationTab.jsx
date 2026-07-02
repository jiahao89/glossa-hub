import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { parseCSV, arrayToCSV } from '../utils/csvHelper';
import { apiFetch } from '../utils/api';
import { Search, Loader2, Plus, RefreshCw, FileInput, FileOutput, Edit2, Check, AlertCircle, Layers, Trash2 } from 'lucide-react';

const DEFAULT_TARGET_LANGUAGES = [
  'EN（英文）', 'FR（法）', 'DE（德）', 'ES（西班牙）', 'IT（意大利）', 'PT（葡萄牙）', 
  'KO（韩）', 'JP（日）', 'RU（俄罗斯）', 'PL（波兰）', 'TC（繁）', 'DA（丹麦）', 
  'CZ(捷克)', '瑞典', '挪威', '荷兰'
];

export default function TranslationTab({ 
  difyConnected = false,
  onAddLog: onAddLogOriginal, 
  modifiedCells, 
  setModifiedCells 
}) {

  // Dynamic languages dictionary shadowing (Approved Spec)
  const [targetLanguagesList, setTargetLanguagesList] = useState(DEFAULT_TARGET_LANGUAGES);
  const TARGET_LANGUAGES = targetLanguagesList;

  const [difyConfigured, setDifyConfigured] = useState(difyConnected);

  useEffect(() => {
    setDifyConfigured(difyConnected);
  }, [difyConnected]);

  useEffect(() => {
    const loadProjLanguages = async () => {
      try {
        const res = await apiFetch('/api/projects/proj-default/languages');
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            setTargetLanguagesList(data.map(item => item.lang_name));
          }
        }
      } catch (err) {
        console.error('加载语种列表失败:', err);
      }
    };

    const loadDifyState = async () => {
      try {
        const res = await apiFetch('/api/projects/proj-default/dify');
        if (res.ok) {
          const data = await res.json();
          setDifyConfigured(data.apiKeyConfigured);
        }
      } catch (err) {
        console.error('加载 Dify 配置状态失败:', err);
      }
    };

    loadProjLanguages();
    loadDifyState();
  }, []);

  // Bitable State
  const [tables, setTables] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [_fields, setFields] = useState([]); // [{ id, name, type }]
  const [records, setRecords] = useState([]); // [{ id, fields: { fieldId: val } }]
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type, text }

  // Fallback Standalone Mode States
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [mockDatabase, setMockDatabase] = useState({
    tbl_3_1: {
      fields: [
        { id: 'fld_kw', name: 'KW' },
        { id: 'fld_zh', name: 'CN（中文）' },
        { id: 'fld_page', name: '所在页面' },
        { id: 'fld_owner', name: '字号类别' },
        ...TARGET_LANGUAGES.map((lang, idx) => ({ id: `fld_lang_${idx}`, name: lang }))
      ],
      records: [
        {
          recordId: 'rec_1',
          fields: {
            fld_kw: 'KW_RIDE_LAP_AVG_SP',
            fld_zh: '圈平均速度',
            fld_page: '运动数据页',
            fld_owner: '张三',
            fld_lang_0: 'Lap Avg Speed',
            fld_lang_1: 'Vitesse moyenne du tour'
          }
        },
        {
          recordId: 'rec_2',
          fields: {
            fld_kw: 'KW_RIDE_LAP_AVG_CA',
            fld_zh: '圈平均踏频',
            fld_page: '运动数据页',
            fld_owner: '张三',
            fld_lang_0: 'Lap Avg Cadence'
          }
        },
        {
          recordId: 'rec_3',
          fields: {
            fld_kw: 'KW_USER_NO_RECORD',
            fld_zh: '暂无记录，使用码表骑行后查看记录',
            fld_page: '历史记录空页面',
            fld_owner: '李四',
            fld_lang_0: 'No records. Ride with your bike computer to view history.',
            fld_lang_1: 'Aucun enregistrement.'
          }
        },
        {
          recordId: 'rec_4',
          fields: {
            fld_kw: 'KW_RIDE_ROUTE_MAX_G',
            fld_zh: '最大坡度',
            fld_page: '高度页',
            fld_owner: '李四'
          }
        }
      ]
    },
    tbl_3_2: {
      fields: [
        { id: 'fld_kw', name: 'KW' },
        { id: 'fld_zh', name: 'CN（中文）' },
        { id: 'fld_page', name: '所在页面' },
        { id: 'fld_owner', name: '字号类别' },
        ...TARGET_LANGUAGES.map((lang, idx) => ({ id: `fld_lang_${idx}`, name: lang }))
      ],
      records: [
        {
          recordId: 'rec_1',
          fields: {
            fld_kw: 'KW_RIDE_LAP_AVG_SP',
            fld_zh: '圈平均速度',
            fld_page: '运动数据页',
            fld_owner: '张三',
            fld_lang_0: 'Lap Average Speed',
            fld_lang_1: 'Vitesse moyenne du tour'
          }
        },
        {
          recordId: 'rec_2',
          fields: {
            fld_kw: 'KW_RIDE_LAP_AVG_CA',
            fld_zh: '圈平均踏频',
            fld_page: '运动数据页',
            fld_owner: '张三',
            fld_lang_0: 'Lap Avg Cadence',
            fld_lang_1: 'Cadence moyenne du tour'
          }
        },
        {
          recordId: 'rec_5',
          fields: {
            fld_kw: 'KW_RIDE_ROUTE_REPL',
            fld_zh: '是否替换当前路线？',
            fld_page: '导航路线页',
            fld_owner: '王五',
            fld_lang_0: 'Replace current route?'
          }
        }
      ]
    }
  });

  // Column Visibility States for responsive layout
  const [colDropdownOpen, setColDropdownOpen] = useState(false);
  const [visibleLanguages, setVisibleLanguages] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1000) {
      return ['EN（英文）'];
    }
    return TARGET_LANGUAGES;
  });

  // Filter/Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUntranslated, setFilterUntranslated] = useState(false);
  const [sortBy, setSortBy] = useState('changeFirst'); // 'changeFirst' | 'default' | 'createdTime' | 'modifiedTime'

  // Field mappings
  const [fieldMap, setFieldMap] = useState({}); // { name: id }
  const [_revFieldMap, setRevFieldMap] = useState({}); // { id: name }

  // Modal States
  const [editModalRecord, setEditModalRecord] = useState(null); // Record being edited
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addTargetTableId, setAddTargetTableId] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState(new Set());
  const [batchTranslateOpen, setBatchTranslateOpen] = useState(false);
  const [batchTargetTableId, setBatchTargetTableId] = useState('');

  // Batch Add States
  const [batchAddModalOpen, setBatchAddModalOpen] = useState(false);
  const [batchAddTargetTableId, setBatchAddTargetTableId] = useState('');
  const [batchAddRows, setBatchAddRows] = useState([{ KW: '', 中文: '', 所在页面: '', translations: {} }]);
  const [isTranslatingBatchAdd, setIsTranslatingBatchAdd] = useState(false);
  const [batchAddProgress, setBatchAddProgress] = useState({ total: 0, current: 0, status: '' });

  // Add Term State
  const [newTerm, setNewTerm] = useState({
    KW: '',
    中文: '',
    所在页面: '',
    负责人: '',
    translations: {} // { langName: value }
  });
  const [aiTranslatingSingle, setAiTranslatingSingle] = useState(false);

  // Batch Translate State
  const [batchProgress, setBatchProgress] = useState({ total: 0, current: 0, status: '' });
  const [batchPreviewList, setBatchPreviewList] = useState([]); // [{ recordId, KW, 中文, 所在页面, translations: { langName: value } }]
  const [isTranslatingBatch, setIsTranslatingBatch] = useState(false);

  // Local wrapper to automatically append table name (version) to logs
  const onAddLog = useCallback((action, kw = '', chinese = '', details = '') => {
    const activeTableMeta = tables.find(t => t.id === selectedTableId);
    const tableName = activeTableMeta ? activeTableMeta.name : '';
    onAddLogOriginal(action, kw, chinese, details, tableName);
  }, [onAddLogOriginal, tables, selectedTableId]);

  // File Input Ref
  const fileInputRef = useRef(null);

  // Sync mock database state to ref to avoid dependency render loops
  const mockDatabaseRef = useRef(mockDatabase);
  useEffect(() => {
    mockDatabaseRef.current = mockDatabase;
  }, [mockDatabase]);

  // Sync offline modifications directly to SQLite backend database
  const saveOfflineRecords = useCallback(async (tableId, recordsList) => {
    if (tableId === 'tbl_3_1' || tableId === 'tbl_3_2') return;
    try {
      const activeTableMeta = tables.find(t => t.id === tableId);
      const tableName = activeTableMeta ? activeTableMeta.name : 'Unknown';
      await apiFetch('/api/sync-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId, tableName, records: recordsList })
      });
    } catch (err) {
      console.warn('⚠️ 无法同步离线修改到本地 SQLite:', err.message);
    }
  }, [tables]);

  // Load Version Tables
  useEffect(() => {
    async function loadTables() {
      try {
        setLoading(true);
        const res = await apiFetch('/api/tables');
        if (res.ok) {
          const syncedTables = await res.json();
          if (syncedTables.length > 0) {
            setTables(syncedTables);
            setSelectedTableId(syncedTables[0].id);
            showStatus('success', `已载入云端协同数据 (${syncedTables.length} 个固件版本)`);
          } else {
            setTables([]);
          }
        } else {
          showStatus('error', '无法获取云端固件版本列表');
        }
      } catch (err) {
        console.warn('⚠️ 无法从本地读取历史表格:', err.message);
        showStatus('error', '数据库连接失败，请确认后端已启动。');
      } finally {
        setLoading(false);
      }
    }
    loadTables();
  }, []);

  const mergeTimestamps = useCallback(async (allRecords, tableId) => {
    try {
      const res = await apiFetch(`/api/tables/${tableId}/records`);
      if (res.ok) {
        const dbRecords = await res.json();
        const dbMap = {};
        dbRecords.forEach(r => {
          dbMap[r.recordId] = r;
        });
        return allRecords.map(rec => {
          const dbRec = dbMap[rec.recordId];
          return {
            ...rec,
            createdAt: dbRec ? dbRec.createdAt : rec.createdAt || '',
            updatedAt: dbRec ? dbRec.updatedAt : rec.updatedAt || ''
          };
        });
      }
    } catch (err) {
      console.warn('⚠️ 补充时间戳缓存失败:', err.message);
    }
    return allRecords;
  }, []);

  const syncRecordsToSqlite = useCallback(async (tableId, recordsList) => {
    if (isDemoMode) return;
    try {
      const activeTableMeta = tables.find(t => t.id === tableId);
      const tableName = activeTableMeta ? activeTableMeta.name : 'Unknown';
      
      const formatted = recordsList.map(rec => {
        const fields = {};
        Object.keys(rec.fields).forEach(fId => {
          const fName = _revFieldMap[fId] || fId;
          let val = rec.fields[fId];
          if (Array.isArray(val)) {
            val = val.map(s => s.text || '').join('');
          } else if (typeof val === 'object' && val !== null && val.text) {
            val = val.text;
          }
          fields[fName] = val;
        });

        const localRec = records.find(r => r.recordId === rec.recordId);
        const nowStr = new Date().toISOString();

        return {
          recordId: rec.recordId,
          fields,
          createdAt: rec.createdAt || localRec?.createdAt || nowStr,
          updatedAt: rec.updatedAt || nowStr
        };
      });

      await apiFetch('/api/sync-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId,
          tableName,
          records: formatted
        })
      });
    } catch (err) {
      console.warn('⚠️ 实时同步到本地数据库失败:', err.message);
    }
  }, [isDemoMode, tables, _revFieldMap, records]);

  const loadTableData = useCallback(async (tableId) => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/tables/${tableId}/records`);
      if (res.ok) {
        const dbRecords = await res.json();
        
        const fMap = {
          'KW': 'KW',
          'CN（中文）': 'CN（中文）',
          '所在页面': '所在页面',
          '字号类别': '字号类别'
        };
        TARGET_LANGUAGES.forEach(lang => {
          fMap[lang] = lang;
        });
        
        const revFMap = {};
        Object.keys(fMap).forEach(key => {
          revFMap[key] = key;
        });

        setFieldMap(fMap);
        setRevFieldMap(revFMap);
        setRecords(dbRecords);
      } else {
        showStatus('error', '获取固件词条数据失败');
      }
    } catch (err) {
      console.error('⚠️ 无法读取词条数据:', err.message);
      showStatus('error', '数据库连接失败，请确认后端已启动。');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load Fields and Records when selected table changes
  useEffect(() => {
    if (!selectedTableId) return;
    loadTableData(selectedTableId);
  }, [selectedTableId, loadTableData]);

  // Reset selection on table change
  useEffect(() => {
    setSelectedRecordIds(new Set());
  }, [selectedTableId]);



  const showStatus = (type, text) => {
    setStatusMessage({ type, text });
    if (type === 'success') {
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  // Helper to resolve field ID by Name using exact and fuzzy normalized matching
  const getFieldIdByName = useCallback((name) => {
    if (fieldMap[name]) return fieldMap[name];
    const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')');
    const normName = normalize(name);
    const foundKey = Object.keys(fieldMap).find(k => normalize(k) === normName);
    return foundKey ? fieldMap[foundKey] : null;
  }, [fieldMap]);

  // Helpers to get field value by Name
  const getRecordValueByName = useCallback((record, fieldName) => {
    const fId = getFieldIdByName(fieldName);
    if (!fId) return '';
    const cell = record.fields[fId];
    if (!cell) return '';
    // Handle rich text array or string
    if (Array.isArray(cell)) {
      return cell.map(seg => seg.text || '').join('');
    }
    if (typeof cell === 'object' && cell.text) return cell.text;
    return String(cell);
  }, [getFieldIdByName]);

  // Get index maps for fast lookup
  const recordIndexMap = useMemo(() => {
    const map = {};
    records.forEach((rec, idx) => {
      map[rec.recordId] = idx;
    });
    return map;
  }, [records]);

  // Filtered Records
  const filteredRecords = useMemo(() => {
    const list = records.filter(rec => {
      const kw = getRecordValueByName(rec, 'KW');
      const zh = getRecordValueByName(rec, 'CN（中文）');
      const matchesSearch = 
        kw.toLowerCase().includes(searchQuery.toLowerCase()) || 
        zh.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;
      
      if (filterUntranslated) {
        // 只要中文之外的任一目标语种为空，就属于“未翻译完”
        return TARGET_LANGUAGES.some(lang => {
          const val = getRecordValueByName(rec, lang);
          return !val || val.trim() === '';
        });
      }
      
      return true;
    });

    if (sortBy === 'changeFirst') {
      return [...list].sort((a, b) => {
        // 1. Session edits float to the top
        const isModA = modifiedCells[a.recordId] ? 1 : 0;
        const isModB = modifiedCells[b.recordId] ? 1 : 0;
        if (isModA !== isModB) {
          return isModB - isModA;
        }

        // 2. Parse timestamps and sort by latest updated/created time
        const parseTime = (dateStr) => {
          if (!dateStr) return 0;
          const t = new Date(dateStr).getTime();
          return isNaN(t) ? 0 : t;
        };

        const timeA = Math.max(parseTime(a.updatedAt), parseTime(a.createdAt));
        const timeB = Math.max(parseTime(b.updatedAt), parseTime(b.createdAt));
        
        if (timeA !== timeB) {
          return timeB - timeA;
        }

        // 3. Fallback to natural Bitable index (index descending, since newer records are at the bottom of the table)
        const idxA = recordIndexMap[a.recordId] ?? 0;
        const idxB = recordIndexMap[b.recordId] ?? 0;
        return idxB - idxA;
      });
    }

    return list; // fallback default sorting
  }, [records, searchQuery, filterUntranslated, getRecordValueByName, sortBy, modifiedCells, recordIndexMap, visibleLanguages]);

  // Open Edit Modal
  const handleRowDoubleClick = (record) => {
    setModifiedCells(prev => {
      if (!prev[record.recordId]) return prev;
      const updated = { ...prev };
      delete updated[record.recordId];
      return updated;
    });

    const data = {
      recordId: record.recordId,
      KW: getRecordValueByName(record, 'KW'),
      中文: getRecordValueByName(record, 'CN（中文）'),
      所在页面: getRecordValueByName(record, '所在页面'),
      字号类别: getRecordValueByName(record, '字号类别'),
      translations: {}
    };
    TARGET_LANGUAGES.forEach(lang => {
      data.translations[lang] = getRecordValueByName(record, lang);
    });
    setEditModalRecord(data);
  };

  // Save Edit Term
  const handleSaveEdit = async () => {
    if (!editModalRecord) return;
    try {
      setLoading(true);

      const currentCellSessionModified = { ...modifiedCells[editModalRecord.recordId] };
      let logsList = [];
      const recordObj = records.find(r => r.recordId === editModalRecord.recordId);

      if (!recordObj) {
        throw new Error('找不到对应的原始词条记录');
      }

      // Check standard fields modifications
      const standardFieldsConfig = [
        { key: 'KW', dbName: 'KW', label: '词条ID(KW)' },
        { key: '中文', dbName: 'CN（中文）', label: '中文源词' },
        { key: '所在页面', dbName: '所在页面', label: '所在页面' },
        { key: '字号类别', dbName: '字号类别', label: '字号类别' }
      ];

      standardFieldsConfig.forEach(f => {
        const newValue = editModalRecord[f.key] || '';
        const oldValue = getRecordValueByName(recordObj, f.dbName) || '';
        if (newValue !== oldValue) {
          logsList.push({ lang: f.label, oldVal: oldValue, newVal: newValue });
        }
      });

      TARGET_LANGUAGES.forEach(lang => {
        const newValue = editModalRecord.translations[lang] || '';
        const oldValue = getRecordValueByName(recordObj, lang);
        
        if (newValue !== oldValue) {
          // Track modification
          currentCellSessionModified[lang] = true;
          logsList.push({ lang, oldVal: oldValue, newVal: newValue });
        }
      });

      let updatedRecordsList = [];
      setRecords(prev => {
        updatedRecordsList = prev.map(rec => {
          if (rec.recordId === editModalRecord.recordId) {
            const updatedFields = { ...rec.fields };
            TARGET_LANGUAGES.forEach(lang => {
              updatedFields[lang] = editModalRecord.translations[lang] || '';
            });
            updatedFields['KW'] = editModalRecord.KW;
            updatedFields['CN（中文）'] = editModalRecord.中文;
            updatedFields['所在页面'] = editModalRecord.所在页面;
            updatedFields['字号类别'] = editModalRecord.字号类别;
            
            return { 
              ...rec, 
              fields: updatedFields,
              updatedAt: new Date().toISOString()
            };
          }
          return rec;
        });
        return updatedRecordsList;
      });

      // Sync changes to SQLite in background
      await saveOfflineRecords(selectedTableId, updatedRecordsList);

      logsList.forEach(log => {
        onAddLog('修改翻译', editModalRecord.KW, editModalRecord.中文, JSON.stringify({ field: log.lang, oldVal: log.oldVal, newVal: log.newVal }));
      });

      setModifiedCells(prev => ({
        ...prev,
        [editModalRecord.recordId]: currentCellSessionModified
      }));

      showStatus('success', '词条修改成功！');
      setEditModalRecord(null);
    } catch (err) {
      showStatus('danger', `保存修改失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Helper to extract a value from Dify response using fuzzy matching
  const findValueInDifyResult = (lang, result) => {
    if (!result || typeof result !== 'object') return undefined;
    
    // 1. Exact match
    if (result[lang] !== undefined) return result[lang];
    
    // 2. Case-insensitive exact match
    const lowerLang = lang.toLowerCase();
    const exactKey = Object.keys(result).find(k => k.toLowerCase() === lowerLang);
    if (exactKey) return result[exactKey];
    
    // 3. Clean string and compare (fuzzy matching)
    const getCoreChars = (str) => {
      // Remove symbols, brackets, and spaces
      return str.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '');
    };
    
    const coreLang = getCoreChars(lang);
    if (!coreLang) return undefined;
    
    // Find key where one contains the other
    for (const key of Object.keys(result)) {
      const coreKey = getCoreChars(key);
      if (!coreKey) continue;
      if (coreLang.includes(coreKey) || coreKey.includes(coreLang)) {
        return result[key];
      }
    }
    
    // Find key that shares characters
    for (const key of Object.keys(result)) {
      const coreKey = getCoreChars(key);
      if (!coreKey) continue;
      const shared = [...new Set(coreKey.split(''))].filter(char => new Set(coreLang.split('')).has(char));
      if (shared.length > 0) {
        // Exclude generic suffixes
        const meaningfulShared = shared.filter(char => char !== '语' && char !== '文' && char !== '体');
        if (meaningfulShared.length > 0) {
          return result[key];
        }
      }
    }
    
    return undefined;
  };

  // AI pre-translate single term in Add Modal
  const handleSingleAiTranslate = async () => {
    if (!newTerm.中文) {
      alert('请先输入中文源词！');
      return;
    }

    setAiTranslatingSingle(true);
    try {
      const inputs = {
        KW: newTerm.KW || 'KW_TEMP',
        text: newTerm.中文,
        context: newTerm.所在页面 || '无',
        target_languages: TARGET_LANGUAGES.join(',')
      };

      const resp = await apiFetch('/api/projects/proj-default/ai-translate', {
        method: 'POST',
        body: JSON.stringify({ inputs })
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${resp.status}`);
      }
      const result = await resp.json();
      
      // Merge results
      const updatedTrans = { ...newTerm.translations };
      TARGET_LANGUAGES.forEach(lang => {
        const val = findValueInDifyResult(lang, result);
        if (val !== undefined) {
          updatedTrans[lang] = val;
        }
      });
      setNewTerm(prev => ({ ...prev, translations: updatedTrans }));
      showStatus('success', 'AI 自动预翻译完成，请审查！');
    } catch (err) {
      showStatus('danger', `AI 翻译失败: ${err.message}`);
    } finally {
      setAiTranslatingSingle(false);
    }
  };

  // Helper to fetch target table's KW and Chinese fields for duplicates checking
  const fetchTargetTableKWAndChinese = async (targetTableId) => {
    try {
      const res = await apiFetch(`/api/tables/${targetTableId}/records`);
      if (res.ok) {
        const synced = await res.json();
        return synced.map(r => ({
          kw: (r.fields.KW || '').toString().trim(),
          chinese: (r.fields['CN（中文）'] || r.fields.中文 || '').toString().trim()
        }));
      }
    } catch (err) {
      console.error('读取云端数据表记录失败:', err);
    }
    return [];
  };

  // Add Term Save
  const handleSaveAdd = async () => {
    if (!newTerm.KW || !newTerm.中文) {
      alert('KW 唯一标识和中文源词为必填项！');
      return;
    }

    try {
      setLoading(true);
      
      // Perform duplicate and synonym checks
      const existingList = await fetchTargetTableKWAndChinese(addTargetTableId);
      
      // 1. Check exact KW duplicate
      const duplicateKWItem = existingList.find(item => item.kw.toLowerCase() === newTerm.KW.trim().toLowerCase());
      if (duplicateKWItem) {
        alert(`无法保存！已维护相同KW词条：\n- KW: ${newTerm.KW}\n- 已存在词条中文: ${duplicateKWItem.chinese}`);
        setLoading(false);
        return;
      }
      
      // 2. Check semantic similarity
      const getOverlap = (strA, strB) => {
        if (strA === strB) return 1.0;
        const setA = new Set(strA.split(''));
        const setB = new Set(strB.split(''));
        const intersection = new Set([...setA].filter(x => setB.has(x)));
        const union = new Set([...setA, ...setB]);
        return union.size > 0 ? intersection.size / union.size : 0;
      };

      const similarItem = existingList.find(item => {
        const overlap = getOverlap(item.chinese, newTerm.中文);
        const sharedCount = [...new Set(item.chinese.split(''))].filter(x => new Set(newTerm.中文.split('')).has(x)).length;
        return overlap >= 0.5 && sharedCount >= 2;
      });

      if (similarItem) {
        const proceed = window.confirm(`系统检测到有同义或相近词条：\n\n- 已存在：【${similarItem.kw}】“${similarItem.chinese}”\n- 当前新增：【${newTerm.KW}】“${newTerm.中文}”\n\n是否确认继续添加？`);
        if (!proceed) {
          setLoading(false);
          return;
        }
      }

      const addedLangs = {};
      TARGET_LANGUAGES.forEach(lang => {
        if (newTerm.translations[lang]) {
          addedLangs[lang] = true;
        }
      });

      const newRecordId = crypto.randomUUID();
      const newFields = {
        'KW': newTerm.KW,
        'CN（中文）': newTerm.中文,
        '所在页面': newTerm.所在页面 || '',
        '字号类别': newTerm.字号类别 || ''
      };

      TARGET_LANGUAGES.forEach(lang => {
        newFields[lang] = newTerm.translations[lang] || '';
      });

      const newRecObj = { 
        recordId: newRecordId, 
        fields: newFields,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      let updatedRecordsList = [];
      if (addTargetTableId === selectedTableId) {
        setRecords(prev => {
          updatedRecordsList = [...prev, newRecObj];
          return updatedRecordsList;
        });
      } else {
        const res = await apiFetch(`/api/tables/${addTargetTableId}/records`);
        let currentTerms = [];
        if (res.ok) {
          currentTerms = await res.json();
        }
        updatedRecordsList = [...currentTerms, newRecObj];
      }

      await saveOfflineRecords(addTargetTableId, updatedRecordsList);

      onAddLog('新增词条', newTerm.KW, newTerm.中文);
      setModifiedCells(prev => ({
        ...prev,
        [newRecordId]: { ...addedLangs, isAdded: true }
      }));

      showStatus('success', `成功新增词条 (目标版本: ${tables.find(t => t.id === addTargetTableId)?.name || '未名'})！`);
      setAddModalOpen(false);
      setNewTerm({ KW: '', 中文: '', 所在页面: '', 字号类别: '', translations: {} });
    } catch (err) {
      showStatus('danger', `新增词条失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Helper to fetch untranslated records for a specific table (mock/SQLite/Bitable)
  const getUntranslatedRecordsForTable = async (tableId) => {
    let targetRecordsList = [];
    let targetFieldMap = {};
    
    if (isDemoMode) {
      const mockTable = mockDatabase[tableId];
      if (mockTable) {
        targetRecordsList = mockTable.records;
        mockTable.fields.forEach(f => {
          targetFieldMap[f.name] = f.id;
        });
      } else {
        try {
          const res = await apiFetch(`/api/tables/${tableId}/records`);
          if (res.ok) {
            targetRecordsList = await res.json();
            targetFieldMap = { 'KW': 'KW', 'CN（中文）': 'CN（中文）', '所在页面': '所在页面', '字号类别': '字号类别' };
            TARGET_LANGUAGES.forEach(lang => { targetFieldMap[lang] = lang; });
          }
        } catch (err) {
          console.error('⚠️ 无法从本地 SQLite 读取词条数据:', err.message);
        }
      }
    } else {
      try {
        const table = await bitable.base.getTableById(tableId);
        const fieldMetaList = await table.getFieldMetaList();
        fieldMetaList.forEach(f => {
          targetFieldMap[f.name] = f.id;
        });
        
        let pageToken = undefined;
        let hasMore = true;
        while (hasMore) {
          const result = await table.getRecordsByPage({ pageToken, pageSize: 200 });
          targetRecordsList = [...targetRecordsList, ...result.records];
          hasMore = result.hasMore;
          pageToken = result.pageToken;
        }
      } catch (err) {
        console.error('⚠️ 无法从 Bitable 加载比对记录:', err.message);
      }
    }
    
    const getValue = (rec, fieldName) => {
      const fId = targetFieldMap[fieldName];
      if (!fId) return '';
      const cell = rec.fields[fId];
      if (!cell) return '';
      if (Array.isArray(cell)) {
        return cell.map(s => s.text || '').join('');
      }
      if (typeof cell === 'object' && cell.text) return cell.text;
      return String(cell);
    };

    const untranslatedList = targetRecordsList.filter(rec => {
      return TARGET_LANGUAGES.some(lang => {
        const val = getValue(rec, lang);
        return !val || val.trim() === '';
      });
    });

    return untranslatedList.map(rec => {
      const missingLangs = TARGET_LANGUAGES.filter(lang => {
        const val = getValue(rec, lang);
        return !val || val.trim() === '';
      });
      return {
        recordId: rec.recordId,
        KW: getValue(rec, 'KW'),
        中文: getValue(rec, 'CN（中文）'),
        所在页面: getValue(rec, '所在页面'),
        missingLangs,
        translations: {}
      };
    });
  };

  const handleOpenBatchTranslate = async () => {
    if (!difyConfigured) {
      alert('请先在“引擎设置”页签中配置 Dify 的 API 地址与密钥！');
      return;
    }
    
    setLoading(true);
    try {
      const items = await getUntranslatedRecordsForTable(selectedTableId);
      setBatchTargetTableId(selectedTableId);
      setBatchPreviewList(items);
      setBatchTranslateOpen(true);
      setBatchProgress({ total: items.length, current: 0, status: items.length > 0 ? '等待开始批量翻译' : '该版本下没有未翻译词条' });
    } catch (err) {
      showStatus('danger', `初始化批量翻译失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchTargetTableChange = async (newTableId) => {
    setLoading(true);
    try {
      const items = await getUntranslatedRecordsForTable(newTableId);
      setBatchTargetTableId(newTableId);
      setBatchPreviewList(items);
      setBatchProgress({ total: items.length, current: 0, status: items.length > 0 ? '等待开始批量翻译' : '该版本下没有未翻译词条' });
    } catch (err) {
      showStatus('danger', `载入目标版本词条失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStartBatchTranslate = async () => {
    setIsTranslatingBatch(true);
    const updatedList = [...batchPreviewList];

    for (let i = 0; i < updatedList.length; i++) {
      const item = updatedList[i];
      setBatchProgress({
        total: updatedList.length,
        current: i + 1,
        status: `正在翻译 (${i + 1}/${updatedList.length}): ${item.KW} - ${item.中文}`
      });

      try {
        const inputs = {
          KW: item.KW,
          text: item.中文,
          context: item.所在页面 || '无',
          target_languages: item.missingLangs.join(',')
        };

        const res = await apiFetch('/api/projects/proj-default/ai-translate', {
          method: 'POST',
          body: JSON.stringify({ inputs })
        });
        if (!res.ok) {
          const errJson = await res.json();
          throw new Error(errJson.error || 'AI 翻译失败');
        }
        const result = await res.json();
        
        // Merge translations
        const trans = {};
        item.missingLangs.forEach(lang => {
          const val = findValueInDifyResult(lang, result);
          if (val !== undefined) {
            trans[lang] = val;
          }
        });
        
        item.translations = trans;
        setBatchPreviewList([...updatedList]);
      } catch (err) {
        console.error(`翻译词条 ${item.KW} 失败:`, err);
        // Continue to next item even if this fails
      }

      // 300ms delay to prevent rate limit blocks
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setIsTranslatingBatch(false);
    setBatchProgress(prev => ({ ...prev, status: '批量翻译完成！请检查预览内容并确认写入。' }));
  };

  const handleConfirmBatchWrite = async () => {
    try {
      setLoading(true);
      
      const updatedCellsDict = { ...modifiedCells };
      const recordsToUpdate = [];

      const targetFieldMap = { 'KW': 'KW', 'CN（中文）': 'CN（中文）', '所在页面': '所在页面', '字号类别': '字号类别' };
      TARGET_LANGUAGES.forEach(lang => {
        targetFieldMap[lang] = lang;
      });

      batchPreviewList.forEach(item => {
        const fields = {};
        const rowModifiedDict = updatedCellsDict[item.recordId] || {};
        let hasNewTrans = false;

        Object.keys(item.translations).forEach(lang => {
          const fieldId = targetFieldMap[lang];
          if (fieldId && item.translations[lang]) {
            fields[fieldId] = item.translations[lang];
            rowModifiedDict[lang] = true;
            hasNewTrans = true;
          }
        });

        if (hasNewTrans) {
          recordsToUpdate.push({
            recordId: item.recordId,
            fields
          });
          updatedCellsDict[item.recordId] = rowModifiedDict;
        }
      });

      let updatedRecordsList = [];
      if (batchTargetTableId === selectedTableId) {
        setRecords(prev => {
          updatedRecordsList = prev.map(rec => {
            const updateItem = recordsToUpdate.find(r => r.recordId === rec.recordId);
            if (updateItem) {
              return {
                ...rec,
                fields: {
                  ...rec.fields,
                  ...updateItem.fields
                },
                updatedAt: new Date().toISOString()
              };
            }
            return rec;
          });
          return updatedRecordsList;
        });
      } else {
        const res = await apiFetch(`/api/tables/${batchTargetTableId}/records`);
        let currentTerms = [];
        if (res.ok) {
          currentTerms = await res.json();
        }
        updatedRecordsList = currentTerms.map(rec => {
          const updateItem = recordsToUpdate.find(r => r.recordId === rec.recordId);
          if (updateItem) {
            return {
              ...rec,
              fields: {
                ...rec.fields,
                ...updateItem.fields
              },
              updatedAt: new Date().toISOString()
            };
          }
          return rec;
        });
      }

      await saveOfflineRecords(batchTargetTableId, updatedRecordsList);

      batchPreviewList.forEach(item => {
        const transCount = Object.keys(item.translations).length;
        if (transCount > 0) {
          onAddLog('批量翻译', item.KW, item.中文, `自动回写了 ${transCount} 个语种的翻译`);
        }
      });

      setModifiedCells(updatedCellsDict);
      showStatus('success', `批量翻译写入成功！共回写 ${recordsToUpdate.length} 条记录。`);
      setBatchTranslateOpen(false);
      setBatchPreviewList([]);
    } catch (err) {
      showStatus('danger', `批量回写数据失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Batch Add Helper Functions
  const initBatchAddRows = () => {
    setBatchAddRows([{ KW: '', 中文: '', 所在页面: '', translations: {} }]);
    setBatchAddTargetTableId(selectedTableId);
    setIsTranslatingBatchAdd(false);
    setBatchAddProgress({ total: 0, current: 0, status: '' });
  };

  const handleAddBatchAddRow = () => {
    if (batchAddRows.length >= 15) {
      alert('一次最多批量新增 15 条词条！');
      return;
    }
    setBatchAddRows([...batchAddRows, { KW: '', 中文: '', 所在页面: '', translations: {} }]);
  };

  const handleRemoveBatchAddRow = (index) => {
    const updated = batchAddRows.filter((_, idx) => idx !== index);
    setBatchAddRows(updated.length > 0 ? updated : [{ KW: '', 中文: '', 所在页面: '', translations: {} }]);
  };

  const handleStartBatchAddTranslate = async () => {
    const activeRows = batchAddRows.filter(r => r.KW || r.中文 || r.所在页面);
    if (activeRows.length === 0) {
      alert('请至少填写一行词条信息！');
      return;
    }

    const invalidRow = activeRows.find(r => !r.KW || !r.中文 || !r.所在页面);
    if (invalidRow) {
      alert('KW、中文、所在页面为必填项，请补全内容！');
      return;
    }

    if (!difyConfigured) {
      alert('请先在“引擎设置”页签中配置 Dify 的 API 地址与密钥！');
      return;
    }

    setIsTranslatingBatchAdd(true);
    const updatedRows = [...batchAddRows];
    
    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      if (!row.KW || !row.中文 || !row.所在页面) continue;

      setBatchAddProgress({
        total: activeRows.length,
        current: i + 1,
        status: `正在翻译 (${i + 1}/${activeRows.length}): ${row.KW} - ${row.中文}`
      });

      try {
        const inputs = {
          KW: row.KW,
          text: row.中文,
          context: row.所在页面,
          target_languages: TARGET_LANGUAGES.join(',')
        };

        const resp = await apiFetch('/api/projects/proj-default/ai-translate', {
          method: 'POST',
          body: JSON.stringify({ inputs })
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${resp.status}`);
        }
        const result = await resp.json();
        
        const trans = {};
        TARGET_LANGUAGES.forEach(lang => {
          const val = findValueInDifyResult(lang, result);
          if (val !== undefined) {
            trans[lang] = val;
          }
        });
        
        row.translations = trans;
        setBatchAddRows([...updatedRows]);
      } catch (err) {
        console.error(`翻译行 ${i + 1} 失败:`, err);
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setIsTranslatingBatchAdd(false);
    setBatchAddProgress({ total: activeRows.length, current: activeRows.length, status: '批量翻译完成！仅录入翻译后数据完成的词条。' });
  };

  const handleConfirmBatchAddWrite = async () => {
    const completedRows = batchAddRows.filter(row => {
      if (!row.KW || !row.中文 || !row.所在页面) return false;
      return TARGET_LANGUAGES.some(lang => row.translations[lang] && row.translations[lang].trim() !== '');
    });

    if (completedRows.length === 0) {
      alert('没有已完成翻译的词条！请先执行“AI 批量翻译”并确认翻译结果不为空。');
      return;
    }

    setLoading(true);
    try {
      // Perform duplicate and similarity checks
      const existingList = await fetchTargetTableKWAndChinese(batchAddTargetTableId);
      
      // 1. Check duplicate KWs
      const batchKWSet = new Set();
      for (const row of completedRows) {
        const duplicateKWItem = existingList.find(item => item.kw.toLowerCase() === row.KW.trim().toLowerCase());
        if (duplicateKWItem) {
          alert(`无法保存！批处理中发现已维护相同KW词条：\n- KW: ${row.KW}\n- 已存在词条中文: ${duplicateKWItem.chinese}`);
          setLoading(false);
          return;
        }
        if (batchKWSet.has(row.KW.trim().toLowerCase())) {
          alert(`无法保存！批量列表中含有重复的KW：${row.KW}`);
          setLoading(false);
          return;
        }
        batchKWSet.add(row.KW.trim().toLowerCase());
      }
      
      // 2. Check similarity
      const getOverlap = (strA, strB) => {
        if (strA === strB) return 1.0;
        const setA = new Set(strA.split(''));
        const setB = new Set(strB.split(''));
        const intersection = new Set([...setA].filter(x => setB.has(x)));
        const union = new Set([...setA, ...setB]);
        return union.size > 0 ? intersection.size / union.size : 0;
      };

      for (const row of completedRows) {
        const similarItem = existingList.find(item => {
          const overlap = getOverlap(item.chinese, row.中文);
          const sharedCount = [...new Set(item.chinese.split(''))].filter(x => new Set(row.中文.split('')).has(x)).length;
          return overlap >= 0.5 && sharedCount >= 2;
        });

        if (similarItem) {
          const proceed = window.confirm(`批量新增中检测到同义或相近词条：\n\n- 已存在：【${similarItem.kw}】“${similarItem.chinese}”\n- 新增词条：【${row.KW}】“${row.中文}”\n\n是否确认继续写入整个批次？`);
          if (!proceed) {
            setLoading(false);
            return;
          }
        }
      }
      let targetFieldMap = {};
      if (isDemoMode) {
        targetFieldMap = { 'KW': 'KW', 'CN（中文）': 'CN（中文）', '所在页面': '所在页面', '字号类别': '字号类别' };
        TARGET_LANGUAGES.forEach(lang => {
          targetFieldMap[lang] = lang;
        });
      } else {
        const table = await bitable.base.getTableById(batchAddTargetTableId);
        const fieldMetaList = await table.getFieldMetaList();
        fieldMetaList.forEach(f => {
          targetFieldMap[f.name] = f.id;
        });
      }

      const newRecordIdsForHighlight = [];

      if (isDemoMode) {
        const newMockRecords = completedRows.map(row => {
          const newRecordId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const fields = {
            [targetFieldMap['KW']]: row.KW,
            [targetFieldMap['CN（中文）']]: row.中文,
            [targetFieldMap['所在页面']]: row.所在页面,
            [targetFieldMap['字号类别']]: 'AI/Manual'
          };
          TARGET_LANGUAGES.forEach(lang => {
            fields[lang] = row.translations[lang] || '';
          });

          newRecordIdsForHighlight.push(newRecordId);
          return {
            recordId: newRecordId,
            fields,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        });

        if (mockDatabaseRef.current[batchAddTargetTableId]) {
          setMockDatabase(prev => {
            const currentTable = prev[batchAddTargetTableId];
            return {
              ...prev,
              [batchAddTargetTableId]: {
                ...currentTable,
                records: [...(currentTable?.records || []), ...newMockRecords]
              }
            };
          });
        }

        let updatedRecordsList = [];
        if (batchAddTargetTableId === selectedTableId) {
          setRecords(prev => {
            updatedRecordsList = [...prev, ...newMockRecords];
            return updatedRecordsList;
          });
        } else {
          updatedRecordsList = [...(mockDatabaseRef.current[batchAddTargetTableId]?.records || []), ...newMockRecords];
        }

        saveOfflineRecords(batchAddTargetTableId, updatedRecordsList);

        const updatedCellsDict = { ...modifiedCells };
        newMockRecords.forEach((rec, idx) => {
          const row = completedRows[idx];
          const addedLangs = {};
          TARGET_LANGUAGES.forEach(lang => {
            if (row.translations[lang]) addedLangs[lang] = true;
          });
          updatedCellsDict[rec.recordId] = { ...addedLangs, isAdded: true };
          onAddLog('批量新增 (离线)', row.KW, row.中文);
        });
        setModifiedCells(updatedCellsDict);

        showStatus('success', `批量新增成功 (离线模式)！共写入 ${completedRows.length} 条已翻译词条。`);
        setBatchAddModalOpen(false);
        return;
      }

      const table = await bitable.base.getTableById(batchAddTargetTableId);
      
      const updatedCellsDict = { ...modifiedCells };

      const addedRecordsForSync = [];
      const nowStr = new Date().toISOString();

      for (let i = 0; i < completedRows.length; i++) {
        const row = completedRows[i];
        const fields = {};
        if (targetFieldMap['KW']) fields[targetFieldMap['KW']] = row.KW;
        if (targetFieldMap['CN（中文）']) fields[targetFieldMap['CN（中文）']] = row.中文;
        if (targetFieldMap['所在页面']) fields[targetFieldMap['所在页面']] = row.所在页面;
        if (targetFieldMap['字号类别']) fields[targetFieldMap['字号类别']] = 'AI/Manual';
        
        const addedLangs = {};
        TARGET_LANGUAGES.forEach(lang => {
          const fieldId = targetFieldMap[lang];
          if (fieldId && row.translations[lang]) {
            fields[fieldId] = row.translations[lang];
            addedLangs[lang] = true;
          }
        });

        const newRecordId = await table.addRecord({ fields });
        updatedCellsDict[newRecordId] = { ...addedLangs, isAdded: true };
        onAddLog('批量新增', row.KW, row.中文);

        addedRecordsForSync.push({
          recordId: newRecordId,
          fields,
          createdAt: nowStr,
          updatedAt: nowStr
        });
      }

      await syncRecordsToSqlite(batchAddTargetTableId, addedRecordsForSync);

      setModifiedCells(updatedCellsDict);
      showStatus('success', `批量新增成功！共写入 ${completedRows.length} 条已翻译词条。`);
      setBatchAddModalOpen(false);

      if (batchAddTargetTableId === selectedTableId) {
        await loadTableData(selectedTableId);
      }
    } catch (err) {
      showStatus('danger', `批量新增写入失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // AI Translate inside Edit Modal
  const handleEditModalAiTranslate = async () => {
    if (!editModalRecord.中文) {
      alert('请先输入中文源词！');
      return;
    }
    if (!difyConfigured) {
      alert('请先在“引擎设置”页签配置 Dify API 接口地址与密钥！');
      return;
    }

    setAiTranslatingSingle(true);
    try {
      const inputs = {
        KW: editModalRecord.KW || 'KW_TEMP',
        text: editModalRecord.中文,
        context: editModalRecord.所在页面 || '无',
        target_languages: TARGET_LANGUAGES.join(',')
      };

      const res = await apiFetch('/api/projects/proj-default/ai-translate', {
        method: 'POST',
        body: JSON.stringify({ inputs })
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'AI 翻译失败');
      }
      const result = await res.json();
      
      const updatedTrans = { ...editModalRecord.translations };
      TARGET_LANGUAGES.forEach(lang => {
        const val = findValueInDifyResult(lang, result);
        if (val !== undefined) {
          updatedTrans[lang] = val;
        }
      });
      setEditModalRecord(prev => ({ ...prev, translations: updatedTrans }));
      showStatus('success', 'AI 智能翻译完成，请审查并保存修改！');
    } catch (err) {
      showStatus('danger', `AI 翻译失败: ${err.message}`);
    } finally {
      setAiTranslatingSingle(false);
    }
  };

  // Delete Selected Terms
  const handleDeleteSelected = async () => {
    if (selectedRecordIds.size === 0) return;
    
    const confirmDelete = window.confirm(`确认要删除选中的 ${selectedRecordIds.size} 个词条吗？此操作将永久删除数据且无法撤销。`);
    if (!confirmDelete) return;

    setLoading(true);
    try {
      const idsToDelete = Array.from(selectedRecordIds);

      let updatedRecordsList = [];
      setRecords(prev => {
        updatedRecordsList = prev.filter(rec => !selectedRecordIds.has(rec.recordId));
        return updatedRecordsList;
      });
      
      // Sync deletions to SQLite in background
      await saveOfflineRecords(selectedTableId, updatedRecordsList);
      
      idsToDelete.forEach(id => {
        onAddLog('删除词条', `ID: ${id}`, '无');
      });

      setSelectedRecordIds(new Set());
      showStatus('success', `成功删除 ${idsToDelete.length} 个词条`);
    } catch (err) {
      showStatus('danger', `删除词条失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Clean empty data (missing KW or Chinese)
  const handleDataClean = async () => {
    const emptyRecords = records.filter(r => {
      const kw = getRecordValueByName(r, 'KW').trim();
      const cn = getRecordValueByName(r, 'CN（中文）').trim();
      return !kw || !cn;
    });

    if (emptyRecords.length === 0) {
      alert('当前数据表中未发现空词条（KW 或 CN（中文） 为空的词条）！');
      return;
    }

    const confirmMessage = `系统检测到当前版本表内有 ${emptyRecords.length} 条空词条（缺少 KW 或缺少 CN（中文））。\n\n是否确认清理并从数据表中永久删除这 ${emptyRecords.length} 条空词条？`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    try {
      const idsToDelete = emptyRecords.map(r => r.recordId);

      let updatedRecordsList = [];
      setRecords(prev => {
        updatedRecordsList = prev.filter(rec => !idsToDelete.includes(rec.recordId));
        return updatedRecordsList;
      });

      // Sync cleanup to SQLite in background
      await saveOfflineRecords(selectedTableId, updatedRecordsList);

      setSelectedRecordIds(prev => {
        const updated = new Set(prev);
        idsToDelete.forEach(id => updated.delete(id));
        return updated;
      });

      onAddLog('数据清理', `${emptyRecords.length}条空数据`, '无');
      showStatus('success', `数据清理成功！已清理 ${emptyRecords.length} 条空数据。`);
    } catch (err) {
      showStatus('danger', `数据清理失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // CSV Import
  const handleTriggerImport = () => {
    fileInputRef.current.click();
  };

  const handleCsvImportSelected = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setLoading(true);
        const text = event.target.result;
        const parsedRows = parseCSV(text);

        if (parsedRows.length < 2) {
          alert('CSV 文件数据不足（缺少表头或数据）');
          return;
        }

        const headers = parsedRows[0];
        const rows = parsedRows.slice(1);

        // Map column indexes
        const findHeaderIndex = (possibleNames) => {
          const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')');
          const normalizedPossibles = possibleNames.map(p => normalize(p));
          return headers.findIndex(h => normalizedPossibles.includes(normalize(h)));
        };

        const kwIdx = findHeaderIndex(['KW', 'KW (Key)', 'KW(Key)', 'KW（Key）', 'kw']);
        const zhIdx = findHeaderIndex(['CN（中文）', '中文', 'CN(中文)', 'CN (中文)', 'zh']);
        const pageIdx = findHeaderIndex(['所在页面', '页面', '词条所在界面（注意是界面不是模块！！）']);
        const ownerIdx = findHeaderIndex(['字号类别', '字号', '类别', '负责人']);

        if (kwIdx === -1 || zhIdx === -1) {
          alert('CSV 结构非法：必须包含 "KW" 和 "CN（中文）" 列！');
          return;
        }

        const updatedRecords = [...records];
        let localUpdateCount = 0;
        let localAddCount = 0;
        const updatedCellsDict = { ...modifiedCells };

        rows.forEach((row) => {
          const kw = row[kwIdx]?.trim();
          const zh = row[zhIdx]?.trim();
          if (!kw || !zh) return;

          const fields = {};
          fields['KW'] = kw;
          fields['CN（中文）'] = zh;
          fields['所在页面'] = (pageIdx !== -1 && row[pageIdx]) ? row[pageIdx] : '';
          fields['字号类别'] = (ownerIdx !== -1 && row[ownerIdx]) ? row[ownerIdx] : '';

          TARGET_LANGUAGES.forEach(lang => {
            const csvLangIdx = headers.findIndex(h => h.trim() === lang);
            if (csvLangIdx !== -1) {
              fields[lang] = row[csvLangIdx] || '';
            } else {
              fields[lang] = '';
            }
          });

          const existingIdx = updatedRecords.findIndex(r => r.fields.KW === kw);
          if (existingIdx !== -1) {
            const existingRecordObj = updatedRecords[existingIdx];
            TARGET_LANGUAGES.forEach(lang => {
              const csvLangIdx = headers.findIndex(h => h.trim() === lang);
              if (csvLangIdx !== -1) {
                const csvVal = row[csvLangIdx] || '';
                const oldVal = existingRecordObj.fields[lang] || '';
                if (csvVal !== oldVal) {
                  if (!updatedCellsDict[existingRecordObj.recordId]) {
                    updatedCellsDict[existingRecordObj.recordId] = {};
                  }
                  updatedCellsDict[existingRecordObj.recordId][lang] = true;
                }
              }
            });
            updatedRecords[existingIdx] = {
              ...updatedRecords[existingIdx],
              fields: {
                ...updatedRecords[existingIdx].fields,
                ...fields
              },
              updatedAt: new Date().toISOString()
            };
            localUpdateCount++;
          } else {
            const newRecordId = crypto.randomUUID();
            updatedCellsDict[newRecordId] = { isAdded: true };
            updatedRecords.push({
              recordId: newRecordId,
              fields,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            localAddCount++;
          }
        });

        setRecords(updatedRecords);
        
        // Sync imported CSV data to SQLite in background
        await saveOfflineRecords(selectedTableId, updatedRecords);
        setModifiedCells(updatedCellsDict);

        onAddLog('导入 CSV', '', '', `更新了 ${localUpdateCount} 条，新增了 ${localAddCount} 条词条`);
        showStatus('success', `导入成功！更新 ${localUpdateCount} 条，新增 ${localAddCount} 条。`);
      } catch (err) {
        showStatus('danger', `解析并导入 CSV 失败: ${err.message}`);
      } finally {
        setLoading(false);
        // Reset file input
        e.target.value = '';
      }
    };

    reader.readAsText(file, 'utf-8');
  };

  // CSV Export
  const handleExportCSV = () => {
    try {
      const headers = ['所在页面', '字号类别', 'KW', 'CN（中文）', ...TARGET_LANGUAGES];
      
      const csvData = filteredRecords.map(rec => {
        const row = [
          getRecordValueByName(rec, '所在页面'),
          getRecordValueByName(rec, '字号类别'),
          getRecordValueByName(rec, 'KW'),
          getRecordValueByName(rec, 'CN（中文）')
        ];
        
        TARGET_LANGUAGES.forEach(lang => {
          row.push(getRecordValueByName(rec, lang));
        });
        
        return row;
      });

      const csvContent = arrayToCSV(headers, csvData);
      
      // Download link trigger
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      const activeTableMeta = tables.find(t => t.id === selectedTableId);
      const tableName = activeTableMeta ? activeTableMeta.name : 'export';
      
      link.setAttribute('href', url);
      link.setAttribute('download', `GlossaHub_export_${tableName}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      onAddLog(`导出当前视图 CSV (表格: ${tableName})`);
      showStatus('success', 'CSV 导出成功！');
    } catch (err) {
      showStatus('danger', `导出 CSV 失败: ${err.message}`);
    }
  };

  // Sync all Bitable data to local SQLite database immediately
  const handleSyncAllTables = async () => {
    if (isDemoMode) {
      alert('当前处于离线模式，无法从飞书同步！请在飞书多维表格内运行插件以进行同步。');
      return;
    }
    
    showStatus('info', '正在开始从飞书同步所有词条数据表...');
    
    try {
      const tableMetaList = await bitable.base.getTableMetaList();
      if (tableMetaList.length === 0) {
        throw new Error('未在当前飞书多维表格中找到任何数据表');
      }

      let totalSyncedCount = 0;

      for (const tMeta of tableMetaList) {
        showStatus('info', `正在同步词条表: 【${tMeta.name}】...`);
        const table = await bitable.base.getTableById(tMeta.id);
        const fieldMetaList = await table.getFieldMetaList();
        
        const targetFieldMap = {};
        const revFMap = {};
        fieldMetaList.forEach(f => {
          targetFieldMap[f.name] = f.id;
          revFMap[f.id] = f.name;
        });

        let hasMore = true;
        let pageToken = undefined;
        const allRecords = [];
        while (hasMore) {
          const result = await table.getRecordsByPage({ pageToken, pageSize: 200 });
          allRecords.push(...(result.records || []));
          hasMore = result.hasMore;
          pageToken = result.pageToken;
        }

        const formattedRecords = allRecords.map(rec => {
          const fields = {};
          Object.keys(rec.fields).forEach(fId => {
            const fName = revFMap[fId] || fId;
            let val = rec.fields[fId];
            if (Array.isArray(val)) {
              val = val.map(s => s.text || '').join('');
            } else if (typeof val === 'object' && val !== null && val.text) {
              val = val.text;
            }
            fields[fName] = val;
          });

          return {
            recordId: rec.recordId,
            fields,
            createdAt: rec.createdAt || '',
            updatedAt: rec.updatedAt || ''
          };
        });

        const syncRes = await apiFetch('/api/sync-table', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableId: tMeta.id,
            tableName: tMeta.name,
            records: formattedRecords
          })
        });

        if (!syncRes.ok) {
          const errJson = await syncRes.json();
          throw new Error(`数据表 【${tMeta.name}】 同步失败: ${errJson.error || '服务器响应异常'}`);
        }

        totalSyncedCount += formattedRecords.length;
      }

      // Clean up local SQLite tables that are no longer present in Bitable
      const activeTableIds = tableMetaList.map(t => t.id);
      try {
        await apiFetch('/api/sync-cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activeTableIds })
        });
      } catch (cleanErr) {
        console.warn('⚠️ 清理本地冗余表格缓存失败:', cleanErr.message);
      }

      showStatus('success', `同步成功！已同步全部 ${tableMetaList.length} 个词条表，共计 ${totalSyncedCount} 条数据，并清理了已在飞书中删除的废弃表缓存。`);
    } catch (err) {
      showStatus('danger', `同步失败: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Search and Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span>当前词条表:</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(共 {records.length} 条)</span>
            </span>
            <select 
              value={selectedTableId} 
              onChange={(e) => setSelectedTableId(e.target.value)}
              className="select-input"
            >
              {tables.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

          </div>

          {/* Search bar */}
          <div className="search-wrapper">
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索 KW / 中文..."
              className="text-input search-input"
            />
          </div>

          {/* Filter Switch */}
          <div 
            onClick={() => setFilterUntranslated(!filterUntranslated)}
            className={`toggle-wrapper ${filterUntranslated ? 'active' : ''}`}
          >
            <div className="toggle-switch"></div>
            <span>只看未翻译 ({filteredRecords.length})</span>
          </div>

          {/* Column Filter Dropdown */}
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setColDropdownOpen(!colDropdownOpen)}
              className={`btn btn-secondary ${colDropdownOpen ? 'active' : ''}`}
              style={{ height: '34px', fontSize: '0.8rem', padding: '0 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: colDropdownOpen ? 'var(--accent)' : 'var(--border-color)' }}
            >
              <span>🌐 显示列 ({visibleLanguages.length})</span>
            </button>
            
            {colDropdownOpen && (
              <div 
                style={{ 
                  position: 'absolute', 
                  left: 0, 
                  top: '40px', 
                  width: '200px', 
                  maxHeight: '300px', 
                  overflowY: 'auto', 
                  backgroundColor: 'var(--bg-secondary)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: 'var(--radius-md)', 
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)', 
                  zIndex: 150, 
                  padding: '0.5rem' 
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem', marginBottom: '0.4rem' }}>
                  <button 
                    onClick={() => setVisibleLanguages(TARGET_LANGUAGES)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '500' }}
                  >
                    全选
                  </button>
                  <button 
                    onClick={() => setVisibleLanguages([])}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '500' }}
                  >
                    清除
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {TARGET_LANGUAGES.map(lang => {
                    const isChecked = visibleLanguages.includes(lang);
                    return (
                      <label 
                        key={lang} 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-primary)' }}
                      >
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setVisibleLanguages(prev => prev.filter(l => l !== lang));
                            } else {
                              setVisibleLanguages(prev => [...prev, lang]);
                            }
                          }}
                        />
                        {lang}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sort Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>排序:</span>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="select-input"
              style={{ height: '34px', fontSize: '0.8rem', padding: '0 0.4rem' }}
            >
              <option value="changeFirst">变更/新增优先</option>
              <option value="default">默认顺序</option>
            </select>
          </div>
        </div>

        <div className="toolbar-right">
          <button onClick={() => { setAddTargetTableId(selectedTableId); setAddModalOpen(true); }} className="btn btn-secondary">
            <Plus size={13} /> 新增
          </button>

          <button onClick={() => { setBatchAddModalOpen(true); initBatchAddRows(); }} className="btn btn-secondary">
            <Layers size={13} /> 批量新增
          </button>

          <button onClick={handleDataClean} className="btn btn-secondary" title="清除无 KW 或无中文的空记录">
            <Trash2 size={13} /> 数据清理
          </button>
          
          <button onClick={handleOpenBatchTranslate} className="btn btn-primary">
            <RefreshCw size={12} /> 批量翻译
          </button>

          {selectedRecordIds.size > 0 && (
            <button 
              onClick={handleDeleteSelected} 
              className="btn btn-danger" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', height: '28px', fontSize: '0.72rem', padding: '0 0.45rem' }}
            >
              删除选中 ({selectedRecordIds.size})
            </button>
          )}

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleCsvImportSelected} 
            accept=".csv" 
            style={{ display: 'none' }} 
          />
          
          <button onClick={handleTriggerImport} className="btn btn-secondary" title="导入 CSV">
            <FileInput size={13} /> 导入
          </button>
          
          <button onClick={handleExportCSV} className="btn btn-secondary" title="导出 CSV">
            <FileOutput size={13} /> 导出
          </button>
        </div>
      </div>

      {/* Status Warning Alerts */}
      {statusMessage && (
        <div style={{ padding: '0.5rem 1.5rem', backgroundColor: 'var(--bg-secondary)' }}>
          <div className={`alert-box alert-box-${statusMessage.type === 'success' ? 'success' : 'danger'}`}>
            <AlertCircle size={16} />
            <span>{statusMessage.text}</span>
          </div>
        </div>
      )}

      {/* Data Grid Widescreen View */}
      <div className="grid-container">
        {loading ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', gap: '0.8rem' }}>
            <Loader2 className="animate-spin" size={24} color="var(--accent)" />
            <span style={{ color: 'var(--text-secondary)' }}>正在读取多维表格数据...</span>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            没有匹配的词条数据
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input 
                    type="checkbox" 
                    checked={filteredRecords.length > 0 && filteredRecords.every(rec => selectedRecordIds.has(rec.recordId))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRecordIds(new Set(filteredRecords.map(r => r.recordId)));
                      } else {
                        setSelectedRecordIds(new Set());
                      }
                    }}
                  />
                </th>
                <th className="sticky-col-1" style={{ width: '150px' }}>KW (Key)</th>
                <th className="sticky-col-2" style={{ width: '180px' }}>CN（中文）</th>
                <th style={{ width: '150px' }}>所在页面</th>
                <th style={{ width: '100px' }}>字号类别</th>
                {TARGET_LANGUAGES.map(lang => {
                  if (!visibleLanguages.includes(lang)) return null;
                  return <th key={lang} style={{ width: '160px' }}>{lang}</th>;
                })}
                <th style={{ width: '60px', textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map(rec => {
                const recId = rec.recordId;
                const kw = getRecordValueByName(rec, 'KW');
                const zh = getRecordValueByName(rec, 'CN（中文）');
                const page = getRecordValueByName(rec, '所在页面');
                const owner = getRecordValueByName(rec, '字号类别');
                const rowModified = modifiedCells[recId] || {};

                return (
                  <tr key={recId} onDoubleClick={() => handleRowDoubleClick(rec)} className={selectedRecordIds.has(recId) ? 'row-selected' : ''}>
                    <td style={{ textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedRecordIds.has(recId)}
                        onChange={(e) => {
                          const updated = new Set(selectedRecordIds);
                          if (e.target.checked) {
                            updated.add(recId);
                          } else {
                            updated.delete(recId);
                          }
                          setSelectedRecordIds(updated);
                        }}
                      />
                    </td>
                    <td className={`sticky-col-1 mono ${rowModified.isAdded ? 'cell-added' : ''}`} title={kw}>{kw}</td>
                    <td className={`sticky-col-2 ${rowModified.isAdded ? 'cell-added' : ''}`} title={zh} style={{ fontWeight: '500' }}>{zh}</td>
                    <td className={rowModified.isAdded ? 'cell-added' : ''} title={page}>{page || <span className="cell-empty">未填</span>}</td>
                    <td className={rowModified.isAdded ? 'cell-added' : ''} title={owner}>{owner || <span className="cell-empty">未填</span>}</td>
                    {TARGET_LANGUAGES.map(lang => {
                      if (!visibleLanguages.includes(lang)) return null;
                      const val = getRecordValueByName(rec, lang);
                      const isModified = rowModified[lang];
                      const isAdded = rowModified.isAdded;
                      
                      let cellClass = '';
                      if (isModified) {
                        cellClass = 'cell-modified';
                      } else if (isAdded) {
                        cellClass = 'cell-added';
                      }

                      return (
                        <td 
                          key={lang} 
                          className={cellClass} 
                          title={val}
                        >
                          {val || <span className="cell-empty">未翻译</span>}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        onClick={() => handleRowDoubleClick(rec)}
                        className="btn btn-secondary btn-icon-only"
                        style={{ height: '24px', width: '24px' }}
                      >
                        <Edit2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal 1: Edit Modal */}
      {editModalRecord && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">编辑词条翻译 - {editModalRecord.KW}</h3>
              <button onClick={() => setEditModalRecord(null)} className="modal-close">✕</button>
            </div>
            <div className="modal-body">
              <div className="edit-grid">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>KW 标识 (唯一主键)</label>
                  <input 
                    type="text" 
                    value={editModalRecord.KW} 
                    onChange={(e) => setEditModalRecord({ ...editModalRecord, KW: e.target.value })}
                    className="text-input"
                  />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>CN（中文）</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      value={editModalRecord.中文} 
                      onChange={(e) => setEditModalRecord({ ...editModalRecord, 中文: e.target.value })}
                      className="text-input"
                      style={{ flex: 1 }}
                    />
                    <button 
                      onClick={handleEditModalAiTranslate} 
                      disabled={aiTranslatingSingle}
                      className="btn btn-secondary"
                      title="调用 Dify 进行 AI 自动预翻译"
                    >
                      {aiTranslatingSingle ? <Loader2 className="animate-spin" size={14} /> : 'AI 智能翻译'}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>所在页面</label>
                  <input 
                    type="text" 
                    value={editModalRecord.所在页面} 
                    onChange={(e) => setEditModalRecord({ ...editModalRecord, 所在页面: e.target.value })}
                    className="text-input"
                  />
                </div>
                <div className="form-group">
                  <label>字号类别</label>
                  <input 
                    type="text" 
                    value={editModalRecord.字号类别} 
                    onChange={(e) => setEditModalRecord({ ...editModalRecord, 字号类别: e.target.value })}
                    className="text-input"
                  />
                </div>

                <div style={{ gridColumn: 'span 2', borderTop: '1px solid var(--border-color)', margin: '0.8rem 0' }}></div>
                
                {TARGET_LANGUAGES.map(lang => (
                  <div key={lang} className="form-group">
                    <label>{lang}</label>
                    <input 
                      type="text" 
                      value={editModalRecord.translations[lang] || ''} 
                      onChange={(e) => {
                        const trans = { ...editModalRecord.translations, [lang]: e.target.value };
                        setEditModalRecord({ ...editModalRecord, translations: trans });
                      }}
                      className="text-input"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setEditModalRecord(null)} className="btn btn-secondary">取消</button>
              <button onClick={handleSaveEdit} className="btn btn-primary">保存修改</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Add Modal */}
      {addModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">新增翻译词条</h3>
              <button onClick={() => setAddModalOpen(false)} className="modal-close">✕</button>
            </div>
            <div className="modal-body">
              <div className="edit-grid">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>目标版本 (数据表)</label>
                  <select 
                    value={addTargetTableId} 
                    onChange={(e) => setAddTargetTableId(e.target.value)}
                    className="select-input"
                    style={{ width: '100%' }}
                  >
                    {tables.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>KW 标识 (例如: KW_AVG_CADENCE)</label>
                  <input 
                    type="text" 
                    value={newTerm.KW} 
                    onChange={(e) => setNewTerm({ ...newTerm, KW: e.target.value })}
                    className="text-input"
                    placeholder="请输入大写唯一键"
                  />
                </div>
                
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>CN（中文） (必填)</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      value={newTerm.中文} 
                      onChange={(e) => setNewTerm({ ...newTerm, 中文: e.target.value })}
                      className="text-input"
                      placeholder="例如: 平均踏频"
                      style={{ flex: 1 }}
                    />
                    <button 
                      onClick={handleSingleAiTranslate} 
                      disabled={aiTranslatingSingle}
                      className="btn btn-secondary"
                      title="调用 Dify 进行 AI 自动预翻译"
                    >
                      {aiTranslatingSingle ? <Loader2 className="animate-spin" size={14} /> : 'AI 预翻译'}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>所在页面</label>
                  <input 
                    type="text" 
                    value={newTerm.所在页面} 
                    onChange={(e) => setNewTerm({ ...newTerm, 所在页面: e.target.value })}
                    className="text-input"
                    placeholder="如: 表盘页面"
                  />
                </div>
                <div className="form-group">
                  <label>字号类别</label>
                  <input 
                    type="text" 
                    value={newTerm.字号类别} 
                    onChange={(e) => setNewTerm({ ...newTerm, 字号类别: e.target.value })}
                    className="text-input"
                    placeholder="例如: H3、H5"
                  />
                </div>

                <div style={{ gridColumn: 'span 2', borderTop: '1px solid var(--border-color)', margin: '0.8rem 0' }}></div>

                {TARGET_LANGUAGES.map(lang => (
                  <div key={lang} className="form-group">
                    <label>{lang}</label>
                    <input 
                      type="text" 
                      value={newTerm.translations[lang] || ''} 
                      onChange={(e) => {
                        const trans = { ...newTerm.translations, [lang]: e.target.value };
                        setNewTerm({ ...newTerm, translations: trans });
                      }}
                      className="text-input"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setAddModalOpen(false)} className="btn btn-secondary">取消</button>
              <button onClick={handleSaveAdd} className="btn btn-primary">保存新增</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Batch Translate Preview & Status */}
      {batchTranslateOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '900px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Dify 批量智能翻译工作流 ({batchPreviewList.length} 条待翻译)</h3>
              <button 
                onClick={() => !isTranslatingBatch && setBatchTranslateOpen(false)} 
                className="modal-close"
                disabled={isTranslatingBatch}
              >
                ✕
              </button>
            </div>
            
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Target Table Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>目标版本 (数据表):</span>
                <select 
                  value={batchTargetTableId} 
                  onChange={(e) => handleBatchTargetTableChange(e.target.value)}
                  className="select-input"
                  style={{ width: '200px' }}
                  disabled={isTranslatingBatch}
                >
                  {tables.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Progress and status alert */}
              <div className="alert-box alert-box-info" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontWeight: '600' }}>{batchProgress.status}</div>
                {batchProgress.total > 0 && (
                  <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden', marginTop: '0.25rem' }}>
                    <div 
                      style={{ 
                        height: '100%', 
                        backgroundColor: 'var(--accent)', 
                        width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                        transition: 'width 0.2s'
                      }}
                    ></div>
                  </div>
                )}
              </div>

              {/* Data Preview Table */}
              <div style={{ flex: 1, overflow: 'auto', maxHeight: '45vh', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>KW</th>
                      <th>中文</th>
                      <th>待翻译语种</th>
                      <th>AI 翻译预览 (双击可修改)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchPreviewList.map((item, idx) => (
                      <tr key={idx}>
                        <td className="mono">{item.KW}</td>
                        <td>{item.中文}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {item.missingLangs.join(', ')}
                        </td>
                        <td>
                          {Object.keys(item.translations).length === 0 ? (
                            <span className="cell-empty">等待运行...</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              {Object.keys(item.translations).map(lang => (
                                <div key={lang} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: '60px' }}>{lang}:</span>
                                  <input 
                                    type="text" 
                                    value={item.translations[lang]}
                                    onChange={(e) => {
                                      const updatedList = [...batchPreviewList];
                                      updatedList[idx].translations[lang] = e.target.value;
                                      setBatchPreviewList(updatedList);
                                    }}
                                    className="text-input"
                                    style={{ height: '22px', fontSize: '0.75rem', padding: '0 0.4rem', flex: 1 }}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                onClick={() => setBatchTranslateOpen(false)} 
                className="btn btn-secondary"
                disabled={isTranslatingBatch}
              >
                取消
              </button>
              
              <button 
                onClick={handleStartBatchTranslate} 
                className="btn btn-secondary" 
                disabled={isTranslatingBatch}
              >
                {isTranslatingBatch ? '正在自动翻中...' : '开始 Dify 翻译'}
              </button>

              <button 
                onClick={handleConfirmBatchWrite} 
                className="btn btn-primary"
                disabled={isTranslatingBatch || batchPreviewList.every(i => Object.keys(i.translations).length === 0)}
              >
                <Check size={14} /> 确认并写入多维表格
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal 4: Batch Add Terms */}
      {batchAddModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '1000px', width: '95vw' }}>
            <div className="modal-header">
              <h3 className="modal-title">手动批量新增词条 (最多15条)</h3>
              <button 
                onClick={() => !isTranslatingBatchAdd && setBatchAddModalOpen(false)} 
                className="modal-close"
                disabled={isTranslatingBatchAdd}
              >
                ✕
              </button>
            </div>
            
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Target Table Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>目标版本 (数据表):</span>
                <select 
                  value={batchAddTargetTableId} 
                  onChange={(e) => setBatchAddTargetTableId(e.target.value)}
                  className="select-input"
                  style={{ width: '200px' }}
                  disabled={isTranslatingBatchAdd}
                >
                  {tables.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Progress and status alert */}
              {batchAddProgress.status && (
                <div className="alert-box alert-box-info" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ fontWeight: '600' }}>{batchAddProgress.status}</div>
                  {batchAddProgress.total > 0 && (
                    <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden', marginTop: '0.25rem' }}>
                      <div 
                        style={{ 
                          height: '100%', 
                          backgroundColor: 'var(--accent)', 
                          width: `${(batchAddProgress.current / batchAddProgress.total) * 100}%`,
                          transition: 'width 0.2s'
                        }}
                      ></div>
                    </div>
                  )}
                </div>
              )}

              {/* Input Table */}
              <div style={{ flex: 1, overflow: 'auto', maxHeight: '50vh', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>#</th>
                      <th style={{ width: '220px' }}>KW 标识 <span style={{ color: 'red' }}>*</span></th>
                      <th style={{ width: '220px' }}>中文源词 <span style={{ color: 'red' }}>*</span></th>
                      <th style={{ width: '180px' }}>所在页面 <span style={{ color: 'red' }}>*</span></th>
                      <th>翻译预览 (AI 翻译后生成)</th>
                      <th style={{ width: '60px' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchAddRows.map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{idx + 1}</td>
                        <td>
                          <input 
                            type="text" 
                            value={row.KW}
                            onChange={(e) => {
                              const updated = [...batchAddRows];
                              updated[idx].KW = e.target.value;
                              setBatchAddRows(updated);
                            }}
                            className="text-input"
                            placeholder="例如: KW_HOME_TITLE"
                            disabled={isTranslatingBatchAdd}
                          />
                        </td>
                        <td>
                          <input 
                            type="text" 
                            value={row.中文}
                            onChange={(e) => {
                              const updated = [...batchAddRows];
                              updated[idx].中文 = e.target.value;
                              setBatchAddRows(updated);
                            }}
                            className="text-input"
                            placeholder="请输入中文源词"
                            disabled={isTranslatingBatchAdd}
                          />
                        </td>
                        <td>
                          <input 
                            type="text" 
                            value={row.所在页面}
                            onChange={(e) => {
                              const updated = [...batchAddRows];
                              updated[idx].所在页面 = e.target.value;
                              setBatchAddRows(updated);
                            }}
                            className="text-input"
                            placeholder="例如: 首页"
                            disabled={isTranslatingBatchAdd}
                          />
                        </td>
                        <td>
                          {Object.keys(row.translations).length === 0 ? (
                            <span className="cell-empty">等待运行...</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              {TARGET_LANGUAGES.map(lang => (
                                <div key={lang} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: '60px' }}>{lang}:</span>
                                  <input 
                                    type="text" 
                                    value={row.translations[lang] || ''}
                                    onChange={(e) => {
                                      const updated = [...batchAddRows];
                                      updated[idx].translations[lang] = e.target.value;
                                      setBatchAddRows(updated);
                                    }}
                                    className="text-input"
                                    style={{ height: '22px', fontSize: '0.75rem', padding: '0 0.4rem', flex: 1 }}
                                    disabled={isTranslatingBatchAdd}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button 
                            onClick={() => handleRemoveBatchAddRow(idx)}
                            className="btn btn-icon btn-danger"
                            disabled={isTranslatingBatchAdd}
                            title="删除此行"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add row trigger */}
              <div>
                <button 
                  onClick={handleAddBatchAddRow} 
                  className="btn btn-secondary" 
                  style={{ gap: '0.3rem' }}
                  disabled={isTranslatingBatchAdd || batchAddRows.length >= 15}
                >
                  <Plus size={14} /> 添加一行 ({batchAddRows.length}/15)
                </button>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                onClick={() => setBatchAddModalOpen(false)} 
                className="btn btn-secondary"
                disabled={isTranslatingBatchAdd}
              >
                取消
              </button>
              <button 
                onClick={handleStartBatchAddTranslate} 
                className="btn btn-secondary"
                disabled={isTranslatingBatchAdd}
              >
                {isTranslatingBatchAdd ? '正在翻译...' : 'AI 批量翻译'}
              </button>
              <button 
                onClick={handleConfirmBatchAddWrite} 
                className="btn btn-primary"
                disabled={isTranslatingBatchAdd}
              >
                确认批量写入 (仅完成翻译词条)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
