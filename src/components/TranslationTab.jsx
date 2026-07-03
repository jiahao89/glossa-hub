import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { parseCSV, arrayToCSV } from '../utils/csvHelper';
import { apiFetch } from '../utils/api';
import { Search, Loader2, Plus, RefreshCw, FileInput, FileOutput, Edit2, Check, AlertCircle, Layers, Trash2, Lock, Unlock } from 'lucide-react';

const DEFAULT_TARGET_LANGUAGES = [
  'EN（英文）', 'FR（法）', 'DE（德）', 'ES（西班牙）', 'IT（意大利）', 'PT（葡萄牙）', 
  'KO（韩）', 'JP（日）', 'RU（俄罗斯）', 'PL（波兰）', 'TC（繁）', 'DA（丹麦）', 
  'CZ(捷克)', '瑞典', '挪威', '荷兰'
];

export default function TranslationTab({ 
  difyConnected = false,
  onAddLog: onAddLogOriginal, 
  modifiedCells = {},
  setModifiedCells = () => {},
  selectedTableId: propSelectedTableId,
  setSelectedTableId: propSetSelectedTableId
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
  const [internalSelectedTableId, setInternalSelectedTableId] = useState('');
  const selectedTableId = (propSelectedTableId !== undefined && propSelectedTableId !== '') ? propSelectedTableId : internalSelectedTableId;
  const setSelectedTableId = (val) => {
    if (propSetSelectedTableId) {
      propSetSelectedTableId(val);
    } else {
      setInternalSelectedTableId(val);
    }
  };
  const [_fields, setFields] = useState([]); // [{ id, name, type }]
  const [records, setRecords] = useState([]); // [{ id, fields: { fieldId: val } }]
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type, text }


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

  // v1.2 state hooks
  const [tmReferences, setTmReferences] = useState([]);
  const [loadingTm, setLoadingTm] = useState(false);
  const [batchUpdateOpen, setBatchUpdateOpen] = useState(false);
  const [batchCopyOpen, setBatchCopyOpen] = useState(false);
  const [batchUpdateFields, setBatchUpdateFields] = useState({ context: '', owner: '' });
  const [batchCopyTargetTableId, setBatchCopyTargetTableId] = useState('');
  const [batchCopyDuplicateStrategy, setBatchCopyDuplicateStrategy] = useState('skip');
  const [syncInheritOpen, setSyncInheritOpen] = useState(false);
  const [syncInheritSourceId, setSyncInheritSourceId] = useState('');
  const [inheriting, setInheriting] = useState(false);
  const [lockLoadingId, setLockLoadingId] = useState('');

  // v1.3 state hooks
  const [activeRightTab, setActiveRightTab] = useState('tm'); // 'tm' | 'history'
  const [snapshots, setSnapshots] = useState([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [batchApproveOpen, setBatchApproveOpen] = useState(false);
  const [batchApproveStatus, setBatchApproveStatus] = useState('APPROVED');
  const [batchApproveRejectReason, setBatchApproveRejectReason] = useState('');
  const [rollingBackId, setRollingBackId] = useState('');

  const currentUser = useMemo(() => {
    try {
      const uStr = localStorage.getItem('user');
      return uStr ? JSON.parse(uStr) : null;
    } catch {
      return null;
    }
  }, []);

  const loadTmReferences = useCallback(async (kw) => {
    if (!kw || !selectedTableId) return;
    try {
      setLoadingTm(true);
      const res = await apiFetch(`/api/versions/${selectedTableId}/terms/${encodeURIComponent(kw)}/references`);
      if (res.ok) {
        const data = await res.json();
        setTmReferences(data);
      } else {
        setTmReferences([]);
      }
    } catch (e) {
      console.error('加载跨版本翻译参考失败:', e);
      setTmReferences([]);
    } finally {
      setLoadingTm(false);
    }
  }, [selectedTableId]);

  useEffect(() => {
    if (editModalRecord && editModalRecord.fields && editModalRecord.fields.KW) {
      loadTmReferences(editModalRecord.fields.KW);
    } else {
      setTmReferences([]);
    }
  }, [editModalRecord, loadTmReferences]);

  const handleApplyTmReference = (refTrans) => {
    if (!editModalRecord) return;
    const mergedTrans = { ...editModalRecord.translations };
    Object.keys(refTrans).forEach(lang => {
      if (refTrans[lang] && refTrans[lang].trim() !== '') {
        mergedTrans[lang] = refTrans[lang];
      }
    });
    setEditModalRecord({
      ...editModalRecord,
      translations: mergedTrans
    });
  };

  const loadSnapshots = useCallback(async (termId) => {
    if (!termId) return;
    try {
      setLoadingSnapshots(true);
      const res = await apiFetch(`/api/terms/${termId}/snapshots`);
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data);
      } else {
        setSnapshots([]);
      }
    } catch (e) {
      console.error('加载历史快照失败:', e);
      setSnapshots([]);
    } finally {
      setLoadingSnapshots(false);
    }
  }, []);

  useEffect(() => {
    if (editModalRecord && editModalRecord.recordId) {
      loadSnapshots(editModalRecord.recordId);
    } else {
      setSnapshots([]);
    }
  }, [editModalRecord, loadSnapshots]);

  const handleRollbackSnapshot = async (snapshotId) => {
    if (!editModalRecord) return;
    const termId = editModalRecord.recordId;
    const confirmRollback = window.confirm('您确定要将当前词条的翻译回退到该快照版本吗？\n当前版本的最新数据会被保存为一个新快照，您可以通过相同方式撤回。');
    if (!confirmRollback) return;

    try {
      setRollingBackId(snapshotId);
      const res = await apiFetch(`/api/terms/${termId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId })
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message || '回退成功！');
        await loadSnapshots(termId);
        await loadTableData(selectedTableId);
        setEditModalRecord(null); // 关闭弹窗刷新
      } else {
        const err = await res.json();
        alert(`回退失败: ${err.error || '未知原因'}`);
      }
    } catch (e) {
      console.error(e);
      alert('回退网络或服务器异常。');
    } finally {
      setRollingBackId('');
    }
  };

  const handleBatchApproveSubmit = async () => {
    if (selectedRecordIds.size === 0) return;
    const termIds = Array.from(selectedRecordIds);
    try {
      setLoading(true);
      const res = await apiFetch('/api/terms/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termIds,
          status: batchApproveStatus,
          rejectReason: batchApproveStatus === 'REJECTED' ? batchApproveRejectReason : undefined
        })
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message || '批量审核设置成功！');
        setBatchApproveOpen(false);
        setSelectedRecordIds(new Set());
        await loadTableData(selectedTableId);
      } else {
        const err = await res.json();
        alert(`审核操作失败: ${err.error || '未知原因'}`);
      }
    } catch (e) {
      console.error(e);
      alert('批量审核提交时发生异常。');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRowLock = async (recId, currentLockState) => {
    if (currentUser?.role !== 'admin') {
      alert('只有管理员有权锁定/解锁词条！');
      return;
    }
    try {
      setLockLoadingId(recId);
      const res = await apiFetch(`/api/terms/${recId}/lock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLocked: !currentLockState })
      });
      if (res.ok) {
        const data = await res.json();
        setRecords(prev => prev.map(r => r.recordId === recId ? { ...r, isLocked: data.is_locked } : r));
        showStatus('success', data.message || '操作成功！');
      } else {
        const errData = await res.json();
        alert(`锁定操作失败: ${errData.error || '未知错误'}`);
      }
    } catch (e) {
      console.error('锁定操作失败:', e);
      alert('网络连接错误，锁定失败');
    } finally {
      setLockLoadingId('');
    }
  };

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
        const isModA = (modifiedCells || {})[a.recordId] ? 1 : 0;
        const isModB = (modifiedCells || {})[b.recordId] ? 1 : 0;
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
      isLocked: record.isLocked || 0,
      translations: {}
    };
    TARGET_LANGUAGES.forEach(lang => {
      data.translations[lang] = getRecordValueByName(record, lang);
    });
    setEditModalRecord(data);
  };

  const handleBatchUpdateFields = async () => {
    if (selectedRecordIds.size === 0) return;
    const termIds = Array.from(selectedRecordIds);

    const payloadUpdates = {};
    if (batchUpdateFields.context && batchUpdateFields.context.trim() !== '') {
      payloadUpdates.context = batchUpdateFields.context.trim();
    }
    if (batchUpdateFields.owner && batchUpdateFields.owner.trim() !== '') {
      payloadUpdates.owner = batchUpdateFields.owner.trim();
    }

    if (Object.keys(payloadUpdates).length === 0) {
      alert('请至少填写一个需要批量设置的分类字段！');
      return;
    }

    try {
      setLoading(true);
      const res = await apiFetch('/api/terms/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termIds, updates: payloadUpdates })
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message || '批量更新分类字段成功！');
        setBatchUpdateOpen(false);
        setSelectedRecordIds(new Set());
        await loadTableData(selectedTableId);
      } else {
        const err = await res.json();
        alert(`修改失败: ${err.error || '未知原因'}`);
      }
    } catch (e) {
      console.error(e);
      alert('批量修改发生异常错误。');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchCopyVersions = async () => {
    if (selectedRecordIds.size === 0 || !batchCopyTargetTableId) return;
    const termIds = Array.from(selectedRecordIds);
    try {
      setLoading(true);
      const res = await apiFetch('/api/terms/batch-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termIds,
          targetVersionId: batchCopyTargetTableId,
          duplicateStrategy: batchCopyDuplicateStrategy
        })
      });
      if (res.ok) {
        const data = await res.json();
        alert(`批量复制完成！\n- 新增: ${data.addedCount} 条\n- 覆盖: ${data.overwrittenCount} 条\n- 跳过(重复/被锁定): ${data.skippedCount} 条`);
        setBatchCopyOpen(false);
        setSelectedRecordIds(new Set());
      } else {
        const err = await res.json();
        alert(`复制失败: ${err.error || '未知原因'}`);
      }
    } catch (e) {
      console.error(e);
      alert('批量复制发送网络异常。');
    } finally {
      setLoading(false);
    }
  };

  const handleInheritTranslationsSubmit = async () => {
    if (!syncInheritSourceId) {
      alert('请先选择继承的源大表版本！');
      return;
    }
    try {
      setInheriting(true);
      const res = await apiFetch(`/api/versions/${selectedTableId}/inherit-translations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceVersionId: syncInheritSourceId })
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message || '继承补全成功！');
        setSyncInheritOpen(false);
        await loadTableData(selectedTableId);
      } else {
        const err = await res.json();
        alert(`继承失败: ${err.error || '未知错误'}`);
      }
    } catch (e) {
      console.error(e);
      alert('继承失败，网络或后端异常。');
    } finally {
      setInheriting(false);
    }
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

  // Helper to fetch untranslated records for a specific table
  const getUntranslatedRecordsForTable = async (tableId) => {
    let targetRecordsList = [];
    let targetFieldMap = {};

    try {
      const res = await apiFetch(`/api/tables/${tableId}/records`);
      if (res.ok) {
        targetRecordsList = await res.json();
        targetFieldMap = { 'KW': 'KW', 'CN（中文）': 'CN（中文）', '所在页面': '所在页面', '字号类别': '字号类别' };
        TARGET_LANGUAGES.forEach(lang => { targetFieldMap[lang] = lang; });
      }
    } catch (err) {
      console.error('⚠️ 无法读取词条数据:', err.message);
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
      // 字段映射：API 返回的 records 以字段名为 key（与 SQLite 存储一致）
      const targetFieldMap = {
        'KW': 'KW',
        'CN（中文）': 'CN（中文）',
        '所在页面': '所在页面',
        '字号类别': '字号类别'
      };
      TARGET_LANGUAGES.forEach(lang => { targetFieldMap[lang] = lang; });

      const updatedCellsDict = { ...modifiedCells };
      const addedRecordsForSync = [];
      const nowStr = new Date().toISOString();

      for (let i = 0; i < completedRows.length; i++) {
        const row = completedRows[i];
        const fields = {
          'KW': row.KW,
          'CN（中文）': row.中文,
          '所在页面': row.所在页面,
          '字号类别': 'AI/Manual'
        };

        const addedLangs = {};
        TARGET_LANGUAGES.forEach(lang => {
          if (row.translations[lang]) {
            fields[lang] = row.translations[lang];
            addedLangs[lang] = true;
          }
        });

        const newRecordId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
              disabled={tables.length === 0}
            >
              {tables.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              {tables.length === 0 && (
                <option value="">-- 请先在左侧新建数据表 --</option>
              )}
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
            <>
              {currentUser?.role === 'admin' && (
                <button 
                  onClick={() => { setBatchApproveStatus('APPROVED'); setBatchApproveRejectReason(''); setBatchApproveOpen(true); }}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', height: '28px', fontSize: '0.72rem', padding: '0 0.45rem', borderColor: 'var(--green)', color: 'var(--green)', background: 'transparent' }}
                >
                  批量审核 ({selectedRecordIds.size})
                </button>
              )}

              <button 
                onClick={() => { setBatchUpdateFields({ context: '', owner: '' }); setBatchUpdateOpen(true); }}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', height: '28px', fontSize: '0.72rem', padding: '0 0.45rem', borderColor: 'var(--yellow)', color: 'var(--yellow)', background: 'transparent' }}
              >
                批量设置 ({selectedRecordIds.size})
              </button>
              
              <button 
                onClick={() => { setBatchCopyTargetTableId(tables.find(t => t.id !== selectedTableId)?.id || ''); setBatchCopyDuplicateStrategy('skip'); setBatchCopyOpen(true); }}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', height: '28px', fontSize: '0.72rem', padding: '0 0.45rem', borderColor: 'var(--accent)', color: 'var(--accent)', background: 'transparent' }}
              >
                复制到其他版本 ({selectedRecordIds.size})
              </button>

              <button 
                onClick={handleDeleteSelected} 
                className="btn btn-danger" 
                style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', height: '28px', fontSize: '0.72rem', padding: '0 0.45rem' }}
              >
                删除选中 ({selectedRecordIds.size})
              </button>
            </>
          )}

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleCsvImportSelected} 
            accept=".csv" 
            style={{ display: 'none' }} 
          />

          <button onClick={() => { setSyncInheritSourceId(''); setSyncInheritOpen(true); }} className="btn btn-secondary" title="从其他大表继承补全缺失翻译">
            <Layers size={13} /> 继承翻译
          </button>
          
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
        ) : tables.length === 0 ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', gap: '0.8rem' }}>
            <AlertCircle size={32} style={{ opacity: 0.5, color: 'var(--accent)' }} />
            <span>暂无数据表。请先前往左侧“数据表管理”新建大表！</span>
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
                <th style={{ width: '120px', textAlign: 'center' }}>状态</th>
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
                const isLocked = rec.isLocked === 1 || rec.isLocked === true;

                return (
                  <tr 
                    key={recId} 
                    onDoubleClick={() => handleRowDoubleClick(rec)} 
                    className={`${selectedRecordIds.has(recId) ? 'row-selected' : ''} ${isLocked ? 'row-locked' : ''}`}
                    style={isLocked ? { backgroundColor: 'var(--bg-tertiary)', opacity: 0.8 } : undefined}
                  >
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
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                        {lockLoadingId === recId ? (
                          <Loader2 className="animate-spin" size={12} color="var(--accent)" />
                        ) : isLocked ? (
                          <Lock 
                            size={12} 
                            style={{ color: 'var(--red)', cursor: currentUser?.role === 'admin' ? 'pointer' : 'not-allowed' }} 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (currentUser?.role === 'admin') handleToggleRowLock(recId, true);
                            }}
                            title="已被管理员锁定只读"
                          />
                        ) : (
                          <Unlock 
                            size={12} 
                            className="unlock-icon-hover"
                            style={{ color: 'var(--text-muted)', opacity: 0.25, cursor: currentUser?.role === 'admin' ? 'pointer' : 'default' }} 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (currentUser?.role === 'admin') handleToggleRowLock(recId, false);
                            }}
                            title={currentUser?.role === 'admin' ? "点击锁定此行" : "未锁定"}
                          />
                        )}
                        
                        {(() => {
                          const recStatus = rec.status || 'DRAFT';
                          if (recStatus === 'DRAFT') {
                            return <span className="diff-tag" style={{ backgroundColor: 'var(--border-color)', color: 'var(--text-muted)', fontSize: '0.68rem', padding: '0.05rem 0.35rem' }}>草稿</span>;
                          } else if (recStatus === 'PENDING_REVIEW') {
                            return <span className="diff-tag" style={{ backgroundColor: 'var(--yellow)', color: '#000', fontSize: '0.68rem', padding: '0.05rem 0.35rem' }}>待审核</span>;
                          } else if (recStatus === 'APPROVED') {
                            return <span className="diff-tag" style={{ backgroundColor: 'var(--green)', color: '#fff', fontSize: '0.68rem', padding: '0.05rem 0.35rem' }}>已审核</span>;
                          } else if (recStatus === 'REJECTED') {
                            return <span className="diff-tag" style={{ backgroundColor: 'var(--red)', color: '#fff', fontSize: '0.68rem', padding: '0.05rem 0.35rem' }} title={rec.rejectReason || '已驳回'}>已驳回</span>;
                          } else if (recStatus === 'PUBLISHED') {
                            return <span className="diff-tag" style={{ backgroundColor: 'var(--accent)', color: '#fff', fontSize: '0.68rem', padding: '0.05rem 0.35rem' }}>已发布</span>;
                          }
                          return null;
                        })()}
                      </div>
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
          <div className="modal-content" style={{ maxWidth: '1000px', width: '95%' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                编辑词条翻译 - {editModalRecord.KW}
                {(editModalRecord.isLocked === 1 || editModalRecord.isLocked === true) && (
                  <span className="diff-tag" style={{ backgroundColor: 'var(--red)', color: '#fff', fontSize: '0.75rem', padding: '0.1rem 0.5rem' }}>
                    🔒 锁定只读
                  </span>
                )}
              </h3>
              <button onClick={() => setEditModalRecord(null)} className="modal-close">✕</button>
            </div>
            
            {(editModalRecord.isLocked === 1 || editModalRecord.isLocked === true) && (
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderBottom: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.6rem 1.5rem', color: 'var(--red)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={14} />
                <span>此词条已被管理员锁定。普通翻译用户仅可查看数据，无法提交保存修改。</span>
              </div>
            )}

            <div className="modal-body" style={{ display: 'flex', gap: '1.5rem', maxHeight: '68vh', overflowY: 'auto' }}>
              
              {/* 左侧主要修改表单 */}
              <div style={{ flex: 3, minWidth: '450px' }}>
                <div className="edit-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>KW 标识 (唯一主键)</label>
                    <input 
                      type="text" 
                      value={editModalRecord.KW} 
                      onChange={(e) => setEditModalRecord({ ...editModalRecord, KW: e.target.value })}
                      disabled={editModalRecord.isLocked === 1 || editModalRecord.isLocked === true}
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
                        disabled={editModalRecord.isLocked === 1 || editModalRecord.isLocked === true}
                        className="text-input"
                        style={{ flex: 1 }}
                      />
                      <button 
                        onClick={handleEditModalAiTranslate} 
                        disabled={aiTranslatingSingle || editModalRecord.isLocked === 1 || editModalRecord.isLocked === true}
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
                      disabled={editModalRecord.isLocked === 1 || editModalRecord.isLocked === true}
                      className="text-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>字号类别</label>
                    <input 
                      type="text" 
                      value={editModalRecord.字号类别} 
                      onChange={(e) => setEditModalRecord({ ...editModalRecord, 字号类别: e.target.value })}
                      disabled={editModalRecord.isLocked === 1 || editModalRecord.isLocked === true}
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
                        disabled={editModalRecord.isLocked === 1 || editModalRecord.isLocked === true}
                        className="text-input"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* 右侧翻译建议 / 历史记录双标签切换栏 */}
              <div style={{ flex: 2, minWidth: '320px', borderLeft: '1px solid var(--border-color)', paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
                  <button 
                    onClick={() => setActiveRightTab('tm')}
                    className={`btn ${activeRightTab === 'tm' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, height: '30px', fontSize: '0.8rem', padding: '0', background: activeRightTab === 'tm' ? 'var(--accent)' : 'transparent', color: activeRightTab === 'tm' ? '#fff' : 'var(--text-secondary)' }}
                  >
                    🧠 跨版本参考 ({tmReferences.length})
                  </button>
                  <button 
                    onClick={() => setActiveRightTab('history')}
                    className={`btn ${activeRightTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, height: '30px', fontSize: '0.8rem', padding: '0', background: activeRightTab === 'history' ? 'var(--accent)' : 'transparent', color: activeRightTab === 'history' ? '#fff' : 'var(--text-secondary)' }}
                  >
                    🕒 修改历史 ({snapshots.length})
                  </button>
                </div>
                
                {activeRightTab === 'tm' ? (
                  <>
                    {loadingTm ? (
                      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                        <Loader2 className="animate-spin" size={16} />
                        <span style={{ fontSize: '0.8rem' }}>正在检索记忆库参考...</span>
                      </div>
                    ) : tmReferences.length === 0 ? (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '2rem 0', textAlign: 'center', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                        暂无本项目其他大表中的翻译参考
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', flex: 1, paddingRight: '0.3rem' }}>
                        {tmReferences.map((ref, rIdx) => (
                          <div key={rIdx} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.8rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--accent)' }}>版本: {ref.versionName}</span>
                              <button 
                                onClick={() => handleApplyTmReference(ref.translations)}
                                disabled={editModalRecord.isLocked === 1 || editModalRecord.isLocked === true}
                                className="btn btn-secondary"
                                style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', height: '22px' }}
                                title="一键填充全部译文"
                              >
                                应用此翻译
                              </button>
                            </div>
                            
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                              <strong>中文:</strong> {ref.zh_cn}
                            </div>

                            <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              {Object.keys(ref.translations).map(lName => {
                                if (!ref.translations[lName]) return null;
                                return (
                                  <div key={lName} style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>{lName}:</span>
                                    <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{ref.translations[lName]}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {loadingSnapshots ? (
                      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                        <Loader2 className="animate-spin" size={16} />
                        <span style={{ fontSize: '0.8rem' }}>正在加载历史快照记录...</span>
                      </div>
                    ) : snapshots.length === 0 ? (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '2rem 0', textAlign: 'center', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                        此词条尚无任何修改快照记录
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', flex: 1, paddingRight: '0.3rem' }}>
                        {snapshots.map((ref) => (
                          <div key={ref.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.8rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                                👤 {ref.creatorName}
                              </span>
                              <button 
                                onClick={() => handleRollbackSnapshot(ref.id)}
                                disabled={editModalRecord.isLocked === 1 || editModalRecord.isLocked === true || rollingBackId === ref.id}
                                className="btn btn-secondary"
                                style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', height: '22px', borderColor: 'var(--red)', color: 'var(--red)', background: 'transparent' }}
                                title="将本表此行翻译还原为此快照时的内容"
                              >
                                {rollingBackId === ref.id ? '还原中...' : '还原此版'}
                              </button>
                            </div>
                            
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                              时间: {new Date(ref.createdAt).toLocaleString('zh-CN')}
                            </div>

                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                              <strong>键/中文:</strong> <code style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>{ref.kw}</code> | {ref.zh_cn}
                            </div>

                            <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              {Object.keys(ref.translations).map(lName => {
                                if (!ref.translations[lName]) return null;
                                return (
                                  <div key={lName} style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>{lName}:</span>
                                    <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{ref.translations[lName]}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setEditModalRecord(null)} className="btn btn-secondary">取消</button>
              <button 
                onClick={handleSaveEdit} 
                disabled={editModalRecord.isLocked === 1 || editModalRecord.isLocked === true}
                className="btn btn-primary"
              >
                保存修改
              </button>
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

      {/* Modal 3: Batch Update Fields */}
      {batchUpdateOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title">批量设置分类字段</h3>
              <button onClick={() => setBatchUpdateOpen(false)} className="modal-close">✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="alert-box alert-box-success" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
                <span>您已选中 <strong>{selectedRecordIds.size}</strong> 条词条记录。</span>
              </div>
              <div className="form-group">
                <label>所在页面 (可选)</label>
                <input 
                  type="text" 
                  value={batchUpdateFields.context}
                  onChange={(e) => setBatchUpdateFields({ ...batchUpdateFields, context: e.target.value })}
                  className="text-input"
                  placeholder="留空则不修改此字段"
                />
              </div>
              <div className="form-group">
                <label>字号类别 (负责人) (可选)</label>
                <input 
                  type="text" 
                  value={batchUpdateFields.owner}
                  onChange={(e) => setBatchUpdateFields({ ...batchUpdateFields, owner: e.target.value })}
                  className="text-input"
                  placeholder="留空则不修改此字段"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setBatchUpdateOpen(false)} className="btn btn-secondary">取消</button>
              <button onClick={handleBatchUpdateFields} className="btn btn-primary">确认修改</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Batch Copy to Version */}
      {batchCopyOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title">复制词条到其他大表</h3>
              <button onClick={() => setBatchCopyOpen(false)} className="modal-close">✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="alert-box alert-box-success" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
                <span>准备复制 <strong>{selectedRecordIds.size}</strong> 条选中的词条。</span>
              </div>
              
              <div className="form-group">
                <label>选择目标大表版本</label>
                <select 
                  value={batchCopyTargetTableId} 
                  onChange={(e) => setBatchCopyTargetTableId(e.target.value)}
                  className="select-input"
                  style={{ width: '100%' }}
                >
                  <option value="">-- 请选择目标固件大表 --</option>
                  {tables.filter(t => t.id !== selectedTableId).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>重复主键 (KW) 冲突策略</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.2rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="dupStrategy" 
                      value="skip"
                      checked={batchCopyDuplicateStrategy === 'skip'}
                      onChange={() => setBatchCopyDuplicateStrategy('skip')}
                    />
                    <span>跳过重复项 (不更改目标版本数据)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="dupStrategy" 
                      value="overwrite"
                      checked={batchCopyDuplicateStrategy === 'overwrite'}
                      onChange={() => setBatchCopyDuplicateStrategy('overwrite')}
                    />
                    <span>覆盖重复项 (用当前大表词条覆盖目标版本)</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setBatchCopyOpen(false)} className="btn btn-secondary">取消</button>
              <button 
                onClick={handleBatchCopyVersions} 
                disabled={!batchCopyTargetTableId}
                className="btn btn-primary"
              >
                开始复制
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: TM Inherit Overlay */}
      {syncInheritOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 className="modal-title">继承/补充其他大表翻译</h3>
              <button onClick={() => setSyncInheritOpen(false)} className="modal-close">✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                💡 <strong>合并继承机制</strong>：
                系统将检索源大表中相同的 <strong>KW</strong> 记录，如果当前大表对应的词条有某些语种为空（尚未翻译），系统会自动将源版本里已翻译的值填补过来，<strong>绝不会覆盖您当前表中已经翻译过的内容</strong>。
              </div>

              <div className="form-group">
                <label>选择源大表版本 (从何处继承)</label>
                <select 
                  value={syncInheritSourceId} 
                  onChange={(e) => setSyncInheritSourceId(e.target.value)}
                  className="select-input"
                  style={{ width: '100%' }}
                >
                  <option value="">-- 请选择源大表 --</option>
                  {tables.filter(t => t.id !== selectedTableId).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setSyncInheritOpen(false)} className="btn btn-secondary" disabled={inheriting}>取消</button>
              <button 
                onClick={handleInheritTranslationsSubmit} 
                disabled={!syncInheritSourceId || inheriting}
                className="btn btn-primary"
              >
                {inheriting ? '正在执行合并继承...' : '开始继承'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal 6: Batch Approve Workflow Modal */}
      {batchApproveOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title">批量审核词条状态</h3>
              <button onClick={() => setBatchApproveOpen(false)} className="modal-close">✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="alert-box alert-box-success" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
                <span>准备审核 <strong>{selectedRecordIds.size}</strong> 条选中的词条（将自动过滤被锁定的词条）。</span>
              </div>

              <div className="form-group">
                <label>选择审核结论</label>
                <select 
                  value={batchApproveStatus}
                  onChange={(e) => setBatchApproveStatus(e.target.value)}
                  className="select-input"
                  style={{ width: '100%' }}
                >
                  <option value="APPROVED">已审核 (APPROVED)</option>
                  <option value="PUBLISHED">已发布 (PUBLISHED)</option>
                  <option value="REJECTED">已驳回 (REJECTED)</option>
                  <option value="DRAFT">设回草稿 (DRAFT)</option>
                </select>
              </div>

              {batchApproveStatus === 'REJECTED' && (
                <div className="form-group">
                  <label style={{ color: 'var(--red)' }}>请输入驳回意见/修改原因 (必填)</label>
                  <textarea 
                    value={batchApproveRejectReason}
                    onChange={(e) => setBatchApproveRejectReason(e.target.value)}
                    className="text-input"
                    rows={3}
                    placeholder="例如: 英文翻译不符合Magene词典规范，请核对缩写"
                    style={{ width: '100%', resize: 'vertical', minHeight: '60px' }}
                    required
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setBatchApproveOpen(false)} className="btn btn-secondary">取消</button>
              <button 
                onClick={handleBatchApproveSubmit} 
                disabled={batchApproveStatus === 'REJECTED' && !batchApproveRejectReason.trim()}
                className="btn btn-primary"
              >
                确认提交
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
