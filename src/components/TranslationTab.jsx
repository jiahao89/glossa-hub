import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { bitable } from '@lark-base-open/js-sdk';
import { runDifyWorkflow } from '../utils/difyHelper';
import { parseCSV, arrayToCSV } from '../utils/csvHelper';
import { Search, Loader2, Plus, RefreshCw, FileInput, FileOutput, Edit2, Check, AlertCircle, Layers, Trash2 } from 'lucide-react';

const TARGET_LANGUAGES = [
  'EN（英文）', 'FR（法）', 'DE（德）', 'ES（西班牙）', 'IT（意大利）', 'PT（葡萄牙）', 
  'KO（韩）', 'JP（日）', 'RU（俄罗斯）', 'PL（波兰）', 'TC（繁）', 'DA（丹麦）', 
  'CZ(捷克)', '瑞典', '挪威', '荷兰'
];

export default function TranslationTab({ 
  difyUrl, 
  difyKey, 
  onAddLog: onAddLogOriginal, 
  modifiedCells, 
  setModifiedCells 
}) {

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

  // Load Bitable Tables
  useEffect(() => {
    async function loadTables() {
      try {
        setLoading(true);
        // Create a timeout race to prevent hanging outside Feishu iframe
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('SDK 连接超时，可能未运行在飞书环境中')), 1500)
        );
        const tableMetaList = await Promise.race([
          bitable.base.getTableMetaList(),
          timeoutPromise
        ]);
        setTables(tableMetaList);
        if (tableMetaList.length > 0) {
          setSelectedTableId(tableMetaList[0].id);
        }
      } catch (err) {
        console.warn('⚠️ 无法加载飞书 Bitable 数据表，切换为离线演示模式:', err.message);
        setIsDemoMode(true);
        
        // Try fetching synced tables from SQLite/JSON database
        try {
          const res = await fetch('/api/tables');
          if (res.ok) {
            const syncedTables = await res.json();
            if (syncedTables.length > 0) {
              setTables(syncedTables);
              setSelectedTableId(syncedTables[0].id);
              showStatus('success', `已载入本地历史同步数据 (${syncedTables.length} 个版本表)`);
              setLoading(false);
              return;
            }
          }
        } catch (dbErr) {
          console.warn('⚠️ 无法从本地 SQLite 读取历史表格:', dbErr.message);
        }

        const mockTables = [
          { id: 'tbl_3_1', name: '3.1' },
          { id: 'tbl_3_2', name: '3.2' }
        ];
        setTables(mockTables);
        setSelectedTableId('tbl_3_1');
        showStatus('success', '已启用本地演示模式 (数据在内存中保存)');
      } finally {
        setLoading(false);
      }
    }
    loadTables();
  }, []);

  const loadTableData = useCallback(async (tableId) => {
    try {
      setLoading(true);

      if (isDemoMode) {
        const mockTable = mockDatabase[tableId];
        if (mockTable) {
          const fMap = {};
          const revFMap = {};
          mockTable.fields.forEach(f => {
            fMap[f.name] = f.id;
            revFMap[f.id] = f.name;
          });
          setFieldMap(fMap);
          setRevFieldMap(revFMap);
          setRecords(mockTable.records);
          return;
        } else {
          // Sync database table load!
          try {
            const res = await fetch(`/api/tables/${tableId}/records`);
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
              return;
            }
          } catch (dbErr) {
            console.error('⚠️ 无法从本地 SQLite 读取词条数据:', dbErr.message);
          }
        }
        return;
      }

      const table = await bitable.base.getTableById(tableId);
      
      // Load Field Metas
      const fieldMetaList = await table.getFieldMetaList();
      setFields(fieldMetaList);
      
      const fMap = {};
      const revFMap = {};
      fieldMetaList.forEach(f => {
        fMap[f.name] = f.id;
        revFMap[f.id] = f.name;
      });
      setFieldMap(fMap);
      setRevFieldMap(revFMap);

      // Load Records
      let pageToken = undefined;
      let hasMore = true;
      let allRecords = [];

      while (hasMore) {
        const result = await table.getRecordsByPage({ pageToken, pageSize: 200 });
        allRecords = [...allRecords, ...result.records];
        hasMore = result.hasMore;
        pageToken = result.pageToken;
      }
      
      setRecords(allRecords);

      // Auto sync to SQLite backend in background
      try {
        const activeTableMeta = tables.find(t => t.id === tableId);
        const tableName = activeTableMeta ? activeTableMeta.name : 'Unknown';
        
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

        fetch('/api/sync-table', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tableId,
            tableName,
            records: formattedRecords
          })
        }).then(res => {
          if (res.ok) {
            console.log(`⚡ [SQLite] 表格【${tableName}】及其 ${formattedRecords.length} 条数据已自动同步到本地数据库`);
          }
        }).catch(err => {
          console.warn('⚠️ 自动同步数据表到本地失败:', err.message);
        });
      } catch (syncErr) {
        console.warn('⚠️ 构造同步数据负载失败:', syncErr.message);
      }
    } catch (err) {
      showStatus('danger', `读取数据表失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [isDemoMode, mockDatabase, tables]);

  // Load Fields and Records when selected table changes
  useEffect(() => {
    if (!selectedTableId) return;
    loadTableData(selectedTableId);
  }, [selectedTableId, loadTableData]);

  // Reset selection on table change
  useEffect(() => {
    setSelectedRecordIds(new Set());
  }, [selectedTableId]);

  // Real-time Bitable Event Listeners for Client-side Sync (Option A)
  useEffect(() => {
    if (isDemoMode || !selectedTableId) return;

    let unsubscribes = [];
    let timeoutId = null;

    const setupListeners = async () => {
      try {
        const table = await bitable.base.getTableById(selectedTableId);
        
        // Debounced synchronization callback
        const triggerSilentSync = () => {
          if (timeoutId) clearTimeout(timeoutId);
          timeoutId = setTimeout(async () => {
            console.log('🔄 Bitable data changed. Triggering silent background synchronization...');
            try {
              // Silently fetch and sync records
              const fieldMetaList = await table.getFieldMetaList();
              const revFMap = {};
              fieldMetaList.forEach(f => {
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

              await fetch('/api/sync-table', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tableId: selectedTableId,
                  tableName: tables.find(t => t.id === selectedTableId)?.name || '未名',
                  records: formattedRecords
                })
              });
              
              // Update local state without showing a blocking loading spinner
              setRecords(allRecords);
            } catch (err) {
              console.warn('❌ Silent synchronization failed:', err);
            }
          }, 1500); // 1.5s debounce to group consecutive typing/edits
        };

        const unsubAdd = table.onRecordAdd(() => {
          triggerSilentSync();
        });
        const unsubMod = table.onRecordModify(() => {
          triggerSilentSync();
        });
        const unsubDel = table.onRecordDelete(() => {
          triggerSilentSync();
        });

        unsubscribes.push(unsubAdd, unsubMod, unsubDel);
      } catch (err) {
        console.warn('⚠️ Registering Bitable event listeners failed:', err);
      }
    };

    setupListeners();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      // Unsubscribe all listeners on table change or unmount
      unsubscribes.forEach(unsub => {
        try {
          if (typeof unsub === 'function') unsub();
        } catch (e) {
          console.warn('Unsubscribing Bitable listener failed:', e);
        }
      });
    };
  }, [selectedTableId, isDemoMode, tables]);

  const showStatus = (type, text) => {
    setStatusMessage({ type, text });
    if (type === 'success') {
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  // Helpers to get field value by Name
  const getRecordValueByName = useCallback((record, fieldName) => {
    const fId = fieldMap[fieldName];
    if (!fId) return '';
    const cell = record.fields[fId];
    if (!cell) return '';
    // Handle rich text array or string
    if (Array.isArray(cell)) {
      return cell.map(seg => seg.text || '').join('');
    }
    if (typeof cell === 'object' && cell.text) return cell.text;
    return String(cell);
  }, [fieldMap]);

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
        // Find if at least one visible language is empty
        const langsToCheck = visibleLanguages.length > 0 ? visibleLanguages : TARGET_LANGUAGES;
        return langsToCheck.some(lang => {
          const val = getRecordValueByName(rec, lang);
          return !val || val.trim() === '';
        });
      }
      
      return true;
    });

    if (sortBy === 'changeFirst') {
      return [...list].sort((a, b) => {
        const isModA = modifiedCells[a.recordId] ? 1 : 0;
        const isModB = modifiedCells[b.recordId] ? 1 : 0;
        if (isModA !== isModB) {
          return isModB - isModA;
        }

        const timeA = Math.max(
          a.updatedAt ? new Date(a.updatedAt).getTime() : 0,
          a.createdAt ? new Date(a.createdAt).getTime() : 0
        );
        const timeB = Math.max(
          b.updatedAt ? new Date(b.updatedAt).getTime() : 0,
          b.createdAt ? new Date(b.createdAt).getTime() : 0
        );
        if (timeA && timeB && timeA !== timeB) {
          return timeB - timeA;
        }

        const idxA = recordIndexMap[a.recordId] ?? 0;
        const idxB = recordIndexMap[b.recordId] ?? 0;
        return idxB - idxA;
      });
    }

    if (sortBy === 'createdTime') {
      return [...list].sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA && timeB && timeA !== timeB) {
          return timeB - timeA;
        }
        const idxA = recordIndexMap[a.recordId] ?? 0;
        const idxB = recordIndexMap[b.recordId] ?? 0;
        return idxB - idxA;
      });
    }

    if (sortBy === 'modifiedTime') {
      return [...list].sort((a, b) => {
        const isModA = modifiedCells[a.recordId] ? 1 : 0;
        const isModB = modifiedCells[b.recordId] ? 1 : 0;
        if (isModA !== isModB) {
          return isModB - isModA; // Session edits float to top
        }

        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        if (timeA && timeB && timeA !== timeB) {
          return timeB - timeA;
        }

        const idxA = recordIndexMap[a.recordId] ?? 0;
        const idxB = recordIndexMap[b.recordId] ?? 0;
        return idxB - idxA;
      });
    }

  }, [records, searchQuery, filterUntranslated, getRecordValueByName, sortBy, modifiedCells, recordIndexMap, visibleLanguages]);

  // Open Edit Modal
  const handleRowDoubleClick = (record) => {
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

      TARGET_LANGUAGES.forEach(lang => {
        const newValue = editModalRecord.translations[lang] || '';
        const oldValue = getRecordValueByName(
          records.find(r => r.recordId === editModalRecord.recordId), 
          lang
        );
        
        if (newValue !== oldValue) {
          // Track modification
          currentCellSessionModified[lang] = true;
          logsList.push({ lang, oldVal: oldValue, newVal: newValue });
        }
      });

      if (isDemoMode) {
        setMockDatabase(prev => {
          const currentTable = prev[selectedTableId];
          const updatedRecords = currentTable.records.map(rec => {
            if (rec.recordId === editModalRecord.recordId) {
              const updatedFields = { ...rec.fields };
              TARGET_LANGUAGES.forEach(lang => {
                const fId = fieldMap[lang];
                if (fId) {
                  updatedFields[fId] = editModalRecord.translations[lang] || '';
                }
              });
              updatedFields[fieldMap['KW']] = editModalRecord.KW;
              updatedFields[fieldMap['CN（中文）']] = editModalRecord.中文;
              updatedFields[fieldMap['所在页面']] = editModalRecord.所在页面;
              updatedFields[fieldMap['字号类别']] = editModalRecord.字号类别;
              return { 
                ...rec, 
                fields: updatedFields,
                updatedAt: new Date().toISOString()
              };
            }
            return rec;
          });
          return {
            ...prev,
            [selectedTableId]: {
              ...currentTable,
              records: updatedRecords
            }
          };
        });

        setRecords(prev => prev.map(rec => {
          if (rec.recordId === editModalRecord.recordId) {
            const updatedFields = { ...rec.fields };
            TARGET_LANGUAGES.forEach(lang => {
              const fId = fieldMap[lang];
              if (fId) {
                updatedFields[fId] = editModalRecord.translations[lang] || '';
              }
            });
            updatedFields[fieldMap['KW']] = editModalRecord.KW;
            updatedFields[fieldMap['CN（中文）']] = editModalRecord.中文;
            updatedFields[fieldMap['所在页面']] = editModalRecord.所在页面;
            updatedFields[fieldMap['字号类别']] = editModalRecord.字号类别;
            return { 
              ...rec, 
              fields: updatedFields,
              updatedAt: new Date().toISOString()
            };
          }
          return rec;
        }));

        logsList.forEach(log => {
          onAddLog('修改翻译 (离线)', editModalRecord.KW, editModalRecord.中文, `【${log.lang}】从 "${log.oldVal || '空'}" 修改为 "${log.newVal}"`);
        });

        setModifiedCells(prev => ({
          ...prev,
          [editModalRecord.recordId]: currentCellSessionModified
        }));

        showStatus('success', '词条修改成功 (离线模式)！');
        setEditModalRecord(null);
        return;
      }

      const table = await bitable.base.getTableById(selectedTableId);
      const fieldsToUpdate = {};
      
      // Standard Fields
      if (fieldMap['KW']) fieldsToUpdate[fieldMap['KW']] = editModalRecord.KW;
      if (fieldMap['CN（中文）']) fieldsToUpdate[fieldMap['CN（中文）']] = editModalRecord.中文;
      if (fieldMap['所在页面']) fieldsToUpdate[fieldMap['所在页面']] = editModalRecord.所在页面;
      if (fieldMap['字号类别']) fieldsToUpdate[fieldMap['字号类别']] = editModalRecord.字号类别;
      
      TARGET_LANGUAGES.forEach(lang => {
        const fieldId = fieldMap[lang];
        if (fieldId) {
          fieldsToUpdate[fieldId] = editModalRecord.translations[lang] || '';
        }
      });

      await table.setRecord(editModalRecord.recordId, { fields: fieldsToUpdate });
      
      logsList.forEach(log => {
        onAddLog('修改翻译', editModalRecord.KW, editModalRecord.中文, `【${log.lang}】从 "${log.oldVal || '空'}" 修改为 "${log.newVal}"`);
      });

      // Update local highlights
      setModifiedCells(prev => ({
        ...prev,
        [editModalRecord.recordId]: currentCellSessionModified
      }));

      showStatus('success', '词条修改成功！');
      setEditModalRecord(null);
      await loadTableData(selectedTableId);
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
    if (!difyUrl || !difyKey) {
      alert('请先在“引擎设置”页签配置 Dify API 接口地址与密钥！');
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

      const result = await runDifyWorkflow(difyUrl, difyKey, inputs);
      
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
    if (isDemoMode) {
      const dbRecords = mockDatabase[targetTableId]?.records || [];
      if (dbRecords.length > 0) {
        return dbRecords.map(r => {
          let kwVal = '';
          let cnVal = '';
          Object.keys(r.fields).forEach(key => {
            if (key === 'KW') kwVal = r.fields[key];
            if (key === 'CN（中文）') cnVal = r.fields[key];
          });
          return { kw: (kwVal || '').toString().trim(), chinese: (cnVal || '').toString().trim() };
        });
      } else {
        try {
          const res = await fetch(`/api/tables/${targetTableId}/records`);
          if (res.ok) {
            const synced = await res.json();
            return synced.map(r => ({
              kw: (r.fields.KW || '').toString().trim(),
              chinese: (r.fields.中文 || '').toString().trim()
            }));
          }
        } catch (err) {
          console.warn('读取本地数据表记录失败:', err);
        }
      }
      return [];
    }

    try {
      const table = await bitable.base.getTableById(targetTableId);
      const fieldMetaList = await table.getFieldMetaList();
      const fieldMap = {};
      fieldMetaList.forEach(f => {
        fieldMap[f.name] = f.id;
      });
      const kwId = fieldMap['KW'];
      const cnId = fieldMap['CN（中文）'];
      if (!kwId || !cnId) return [];

      let hasMore = true;
      let pageToken = undefined;
      const list = [];
      while (hasMore) {
        const result = await table.getRecordsByPage({ pageToken, pageSize: 200 });
        (result.records || []).forEach(rec => {
          const kwVal = rec.fields[kwId];
          const cnVal = rec.fields[cnId];
          
          let kwText = '';
          let cnText = '';
          if (Array.isArray(kwVal)) {
            kwText = kwVal.map(s => s.text || '').join('');
          } else if (typeof kwVal === 'object' && kwVal !== null) {
            kwText = kwVal.text || '';
          } else {
            kwText = kwVal || '';
          }

          if (Array.isArray(cnVal)) {
            cnText = cnVal.map(s => s.text || '').join('');
          } else if (typeof cnVal === 'object' && cnVal !== null) {
            cnText = cnVal.text || '';
          } else {
            cnText = cnVal || '';
          }

          list.push({ kw: kwText.toString().trim(), chinese: cnText.toString().trim() });
        });
        hasMore = result.hasMore;
        pageToken = result.pageToken;
      }
      return list;
    } catch (err) {
      console.error('获取 Bitable 数据表记录失败:', err);
      return [];
    }
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

      if (isDemoMode) {
        const newRecordId = `rec_${Date.now()}`;
        
        const targetFieldMap = {
          'KW': 'KW',
          'CN（中文）': 'CN（中文）',
          '所在页面': '所在页面',
          '字号类别': '字号类别'
        };
        TARGET_LANGUAGES.forEach(lang => {
          targetFieldMap[lang] = lang;
        });

        const newFields = {
          [targetFieldMap['KW']]: newTerm.KW,
          [targetFieldMap['CN（中文）']]: newTerm.中文,
          [targetFieldMap['所在页面']]: newTerm.所在页面 || '',
          [targetFieldMap['字号类别']]: newTerm.字号类别 || ''
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

        setMockDatabase(prev => {
          const targetTable = prev[addTargetTableId];
          return {
            ...prev,
            [addTargetTableId]: {
              ...targetTable,
              records: [...(targetTable?.records || []), newRecObj]
            }
          };
        });

        if (addTargetTableId === selectedTableId) {
          setRecords(prev => [...prev, newRecObj]);
        }

        onAddLog('新增词条 (离线)', newTerm.KW, newTerm.中文);
        setModifiedCells(prev => ({
          ...prev,
          [newRecordId]: { ...addedLangs, isAdded: true }
        }));

        showStatus('success', `成功新增词条 (目标版本: ${tables.find(t => t.id === addTargetTableId)?.name || '未名'})！`);
        setAddModalOpen(false);
        setNewTerm({ KW: '', 中文: '', 所在页面: '', 字号类别: '', translations: {} });
        return;
      }

      const targetTable = await bitable.base.getTableById(addTargetTableId);
      const fieldMetaList = await targetTable.getFieldMetaList();
      const targetFieldMap = {};
      fieldMetaList.forEach(f => {
        targetFieldMap[f.name] = f.id;
      });

      const newFields = {};
      if (targetFieldMap['KW']) newFields[targetFieldMap['KW']] = newTerm.KW;
      if (targetFieldMap['CN（中文）']) newFields[targetFieldMap['CN（中文）']] = newTerm.中文;
      if (targetFieldMap['所在页面']) newFields[targetFieldMap['所在页面']] = newTerm.所在页面;
      if (targetFieldMap['字号类别']) newFields[targetFieldMap['字号类别']] = newTerm.字号类别;
      
      TARGET_LANGUAGES.forEach(lang => {
        const fieldId = targetFieldMap[lang];
        if (fieldId) {
          newFields[fieldId] = newTerm.translations[lang] || '';
        }
      });

      const newRecordId = await targetTable.addRecord({ fields: newFields });
      
      setModifiedCells(prev => ({
        ...prev,
        [newRecordId]: { ...addedLangs, isAdded: true }
      }));

      onAddLog('新增词条', newTerm.KW, newTerm.中文);
      showStatus('success', `成功新增词条 (目标版本: ${tables.find(t => t.id === addTargetTableId)?.name || '未名'})！`);
      setAddModalOpen(false);
      setNewTerm({ KW: '', 中文: '', 所在页面: '', 负责人: '', translations: {} });
      
      if (addTargetTableId === selectedTableId) {
        await loadTableData(selectedTableId);
      }
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
          const res = await fetch(`/api/tables/${tableId}/records`);
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

  // Batch Translation Flow
  const handleOpenBatchTranslate = async () => {
    if (!difyUrl || !difyKey) {
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

        const result = await runDifyWorkflow(difyUrl, difyKey, inputs);
        
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

      // Fetch or define target field mappings
      let targetFieldMap = {};
      if (isDemoMode) {
        targetFieldMap = { 'KW': 'KW', 'CN（中文）': 'CN（中文）', '所在页面': '所在页面', '字号类别': '字号类别' };
        TARGET_LANGUAGES.forEach(lang => {
          targetFieldMap[lang] = lang;
        });
      } else {
        const table = await bitable.base.getTableById(batchTargetTableId);
        const fieldMetaList = await table.getFieldMetaList();
        fieldMetaList.forEach(f => {
          targetFieldMap[f.name] = f.id;
        });
      }

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

      if (isDemoMode) {
        setMockDatabase(prev => {
          const currentTable = prev[batchTargetTableId];
          const updatedRecords = (currentTable?.records || []).map(rec => {
            const updateItem = recordsToUpdate.find(r => r.recordId === rec.recordId);
            if (updateItem) {
              return {
                ...rec,
                fields: {
                  ...rec.fields,
                  ...updateItem.fields
                }
              };
            }
            return rec;
          });
          return {
            ...prev,
            [batchTargetTableId]: {
              ...currentTable,
              records: updatedRecords
            }
          };
        });

        if (batchTargetTableId === selectedTableId) {
          setRecords(prev => prev.map(rec => {
            const updateItem = recordsToUpdate.find(r => r.recordId === rec.recordId);
            if (updateItem) {
              return {
                ...rec,
                fields: {
                  ...rec.fields,
                  ...updateItem.fields
                }
              };
            }
            return rec;
          }));
        }

        batchPreviewList.forEach(item => {
          const transCount = Object.keys(item.translations).length;
          if (transCount > 0) {
            onAddLog('批量翻译 (离线)', item.KW, item.中文, `自动回写了 ${transCount} 个语种的翻译`);
          }
        });

        setModifiedCells(updatedCellsDict);
        showStatus('success', `批量翻译写入成功 (离线模式)！共回写 ${recordsToUpdate.length} 条记录。`);
        setBatchTranslateOpen(false);
        setBatchPreviewList([]);
        return;
      }

      const table = await bitable.base.getTableById(batchTargetTableId);

      batchPreviewList.forEach(item => {
        let hasNewTrans = false;
        Object.keys(item.translations).forEach(lang => {
          const fieldId = targetFieldMap[lang];
          if (fieldId && item.translations[lang]) {
            hasNewTrans = true;
          }
        });
        if (hasNewTrans) {
          onAddLog('批量翻译', item.KW, item.中文, `自动回写了 ${Object.keys(item.translations).length} 个语种的翻译`);
        }
      });

      // Write in chunks of 200
      const chunkSize = 200;
      for (let i = 0; i < recordsToUpdate.length; i += chunkSize) {
        const chunk = recordsToUpdate.slice(i, i + chunkSize);
        await table.setRecords(chunk);
      }

      setModifiedCells(updatedCellsDict);
      showStatus('success', `批量翻译写入成功！共回写 ${recordsToUpdate.length} 条记录。`);
      setBatchTranslateOpen(false);
      
      if (batchTargetTableId === selectedTableId) {
        await loadTableData(selectedTableId);
      }
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

    if (!difyUrl || !difyKey) {
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

        const result = await runDifyWorkflow(difyUrl, difyKey, inputs);
        
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

        if (batchAddTargetTableId === selectedTableId) {
          setRecords(prev => [...prev, ...newMockRecords]);
        }

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
      }

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
    if (!difyUrl || !difyKey) {
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

      const result = await runDifyWorkflow(difyUrl, difyKey, inputs);
      
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

      if (isDemoMode) {
        setMockDatabase(prev => {
          const currentTable = prev[selectedTableId];
          const updatedRecords = (currentTable?.records || []).filter(rec => !selectedRecordIds.has(rec.recordId));
          return {
            ...prev,
            [selectedTableId]: {
              ...currentTable,
              records: updatedRecords
            }
          };
        });

        setRecords(prev => prev.filter(rec => !selectedRecordIds.has(rec.recordId)));
        
        idsToDelete.forEach(id => {
          onAddLog('删除词条 (离线)', `ID: ${id}`, '无');
        });

        setSelectedRecordIds(new Set());
        showStatus('success', `成功删除 ${idsToDelete.length} 个词条 (离线模式)`);
        return;
      }

      const table = await bitable.base.getTableById(selectedTableId);
      
      const chunkSize = 200;
      for (let i = 0; i < idsToDelete.length; i += chunkSize) {
        const chunk = idsToDelete.slice(i, i + chunkSize);
        await table.deleteRecords(chunk);
      }

      idsToDelete.forEach(id => {
        onAddLog('删除词条', `ID: ${id}`, '无');
      });

      setSelectedRecordIds(new Set());
      showStatus('success', `成功删除 ${idsToDelete.length} 个词条`);
      await loadTableData(selectedTableId);
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

      if (isDemoMode) {
        // Offline Mock mode
        setMockDatabase(prev => {
          const currentTable = prev[selectedTableId];
          const updatedRecords = (currentTable?.records || []).filter(rec => !idsToDelete.includes(rec.recordId));
          return {
            ...prev,
            [selectedTableId]: {
              ...currentTable,
              records: updatedRecords
            }
          };
        });

        setRecords(prev => prev.filter(rec => !idsToDelete.includes(rec.recordId)));

        setSelectedRecordIds(prev => {
          const updated = new Set(prev);
          idsToDelete.forEach(id => updated.delete(id));
          return updated;
        });

        onAddLog('数据清理 (离线)', `${emptyRecords.length}条空数据`, '无');
        showStatus('success', `数据清理成功！已清理 ${emptyRecords.length} 条空数据。`);
        return;
      }

      // Online Bitable mode
      const table = await bitable.base.getTableById(selectedTableId);
      const chunkSize = 200;
      for (let i = 0; i < idsToDelete.length; i += chunkSize) {
        const chunk = idsToDelete.slice(i, i + chunkSize);
        await table.deleteRecords(chunk);
      }

      onAddLog('数据清理', `${emptyRecords.length}条空数据`, '无');
      
      setSelectedRecordIds(prev => {
        const updated = new Set(prev);
        idsToDelete.forEach(id => updated.delete(id));
        return updated;
      });

      showStatus('success', `数据清理成功！已清理 ${emptyRecords.length} 条空数据。`);
      await loadTableData(selectedTableId);
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
        const kwIdx = headers.findIndex(h => h.trim() === 'KW');
        const zhIdx = headers.findIndex(h => h.trim() === 'CN（中文）' || h.trim() === '中文');
        const pageIdx = headers.findIndex(h => h.trim() === '词条所在界面（注意是界面不是模块！！）' || h.trim() === '所在页面');
        const ownerIdx = headers.findIndex(h => h.trim() === '字号类别' || h.trim() === '负责人');

        if (kwIdx === -1 || zhIdx === -1) {
          alert('CSV 结构非法：必须包含 "KW" 和 "CN（中文）" 列！');
          return;
        }

        if (isDemoMode) {
          const updatedRecords = [...records];
          let localUpdateCount = 0;
          let localAddCount = 0;
          const updatedCellsDict = { ...modifiedCells };

          rows.forEach((row) => {
            const kw = row[kwIdx]?.trim();
            const zh = row[zhIdx]?.trim();
            if (!kw || !zh) return;

            const fields = {};
            fields[fieldMap['KW']] = kw;
            fields[fieldMap['CN（中文）']] = zh;
            if (pageIdx !== -1) fields[fieldMap['所在页面']] = row[pageIdx] || '';
            if (ownerIdx !== -1) fields[fieldMap['字号类别']] = row[ownerIdx] || '';

            TARGET_LANGUAGES.forEach(lang => {
              const fieldId = fieldMap[lang];
              if (fieldId) {
                const csvLangIdx = headers.findIndex(h => h.trim() === lang);
                if (csvLangIdx !== -1) {
                  fields[fieldId] = row[csvLangIdx] || '';
                }
              }
            });

            const existingIdx = updatedRecords.findIndex(r => r.fields[fieldMap['KW']] === kw);
            if (existingIdx !== -1) {
              const existingRecordObj = updatedRecords[existingIdx];
              TARGET_LANGUAGES.forEach(lang => {
                const fieldId = fieldMap[lang];
                const csvLangIdx = headers.findIndex(h => h.trim() === lang);
                if (csvLangIdx !== -1) {
                  const csvVal = row[csvLangIdx] || '';
                  const oldVal = existingRecordObj.fields[fieldId] || '';
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
                }
              };
              localUpdateCount++;
            } else {
              const newRecordId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
              updatedCellsDict[newRecordId] = { isAdded: true };
              updatedRecords.push({
                recordId: newRecordId,
                fields
              });
              localAddCount++;
            }
          });

          setMockDatabase(prev => ({
            ...prev,
            [selectedTableId]: {
              ...prev[selectedTableId],
              records: updatedRecords
            }
          }));
          setRecords(updatedRecords);
          setModifiedCells(updatedCellsDict);

          onAddLog('导入 CSV (离线)', '', '', `更新了 ${localUpdateCount} 条，新增了 ${localAddCount} 条词条`);
          showStatus('success', `导入成功 (离线模式)！更新 ${localUpdateCount} 条，新增 ${localAddCount} 条。`);
          e.target.value = '';
          return;
        }

        const table = await bitable.base.getTableById(selectedTableId);
        
        const existingKwsMap = {}; // { kw: recordId }
        records.forEach(rec => {
          const kw = getRecordValueByName(rec, 'KW');
          if (kw) {
            existingKwsMap[kw] = rec.recordId;
          }
        });

        const recordsToUpdate = [];
        const recordsToAdd = [];
        let updateCount = 0;
        let addCount = 0;

        rows.forEach((row) => {
          const kw = row[kwIdx]?.trim();
          const zh = row[zhIdx]?.trim();
          if (!kw || !zh) return;

          const fields = {};
          if (fieldMap['KW']) fields[fieldMap['KW']] = kw;
          if (fieldMap['CN（中文）']) fields[fieldMap['CN（中文）']] = zh;
          if (pageIdx !== -1 && fieldMap['所在页面']) fields[fieldMap['所在页面']] = row[pageIdx] || '';
          if (ownerIdx !== -1 && fieldMap['字号类别']) fields[fieldMap['字号类别']] = row[ownerIdx] || '';

          TARGET_LANGUAGES.forEach(lang => {
            const fieldId = fieldMap[lang];
            if (fieldId) {
              const csvLangIdx = headers.findIndex(h => h.trim() === lang);
              if (csvLangIdx !== -1) {
                fields[fieldId] = row[csvLangIdx] || '';
              }
            }
          });

          if (existingKwsMap[kw]) {
            recordsToUpdate.push({
              recordId: existingKwsMap[kw],
              fields
            });
            updateCount++;
          } else {
            recordsToAdd.push({
              fields
            });
            addCount++;
          }
        });

        const updatedCellsDict = { ...modifiedCells };

        recordsToUpdate.forEach(item => {
          const existingRec = records.find(r => r.recordId === item.recordId);
          if (existingRec) {
            TARGET_LANGUAGES.forEach(lang => {
              const fieldId = fieldMap[lang];
              if (fieldId && item.fields[fieldId] !== undefined) {
                const csvVal = item.fields[fieldId];
                const oldVal = getRecordValueByName(existingRec, lang);
                if (csvVal !== oldVal) {
                  if (!updatedCellsDict[item.recordId]) {
                    updatedCellsDict[item.recordId] = {};
                  }
                  updatedCellsDict[item.recordId][lang] = true;
                }
              }
            });
          }
        });

        const chunkSize = 200;
        
        for (let i = 0; i < recordsToUpdate.length; i += chunkSize) {
          const chunk = recordsToUpdate.slice(i, i + chunkSize);
          await table.setRecords(chunk);
        }

        for (let i = 0; i < recordsToAdd.length; i += chunkSize) {
          const chunk = recordsToAdd.slice(i, i + chunkSize);
          const chunkIds = await table.addRecords(chunk);
          if (Array.isArray(chunkIds)) {
            chunkIds.forEach(id => {
              updatedCellsDict[id] = { isAdded: true };
            });
          }
        }

        setModifiedCells(updatedCellsDict);

        onAddLog('导入 CSV', '', '', `更新了 ${updateCount} 条，新增了 ${addCount} 条词条`);
        showStatus('success', `导入成功！更新 ${updateCount} 条，新增 ${addCount} 条。`);
        await loadTableData(selectedTableId);
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
    
    setLoading(true);
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

        const syncRes = await fetch('/api/sync-table', {
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
        await fetch('/api/sync-cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activeTableIds })
        });
      } catch (cleanErr) {
        console.warn('⚠️ 清理本地冗余表格缓存失败:', cleanErr.message);
      }

      setTables(tableMetaList);
      showStatus('success', `同步成功！已同步全部 ${tableMetaList.length} 个词条表，共计 ${totalSyncedCount} 条数据，并清理了已在飞书中删除的废弃表缓存。`);
    } catch (err) {
      showStatus('danger', `同步失败: ${err.message}`);
    } finally {
      setLoading(false);
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
            
            {!isDemoMode ? (
              <button 
                onClick={handleSyncAllTables} 
                className="btn btn-secondary" 
                style={{ height: '34px', fontSize: '0.8rem', padding: '0 0.6rem', color: 'var(--accent)', borderColor: 'var(--accent)', gap: '0.2rem' }}
                title="一键同步当前飞书多维表格中所有词条数据表到本地 SQLite"
              >
                🔄 一键同步
              </button>
            ) : (
              <span 
                style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-color)', whiteSpace: 'nowrap' }}
                title="提示：离线状态下数据可能有延迟。要在本地获取最新数据，请在飞书多维表格插件里打开本插件并执行自动同步。"
              >
                ℹ️ 离线模式
              </span>
            )}
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
              <option value="createdTime">创建时间 (新→旧)</option>
              <option value="modifiedTime">修改时间 (新→旧)</option>
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
