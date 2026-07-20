import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { parseCSV, fuzzyFindIndex } from '../utils/csvHelper';
import { apiFetch, safeGetLocalStorage } from '../utils/api';
import { useToast } from './Toast';
import EmptyState from './EmptyState';
import { SkeletonTable } from './Skeleton';
import Pagination from './Pagination';
import GlossaModal from './GlossaModal';
import { Search, Loader2, Plus, RefreshCw, FileInput, FileOutput, Edit2, Check, AlertCircle, Layers, Trash2, Lock, Unlock, CheckCircle, Settings, Copy, Bot } from 'lucide-react';

const DEFAULT_TARGET_LANGUAGES = [
  'EN（英文）', 'FR（法）', 'DE（德）', 'ES（西班牙）', 'IT（意大利）', 'PT（葡萄牙）', 
  'KO（韩）', 'JP（日）', 'RU（俄罗斯）', 'PL（波兰）', 'TC（繁）', 'DA（丹麦）', 
  'CZ(捷克)', '瑞典', '挪威', '荷兰'
];

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default function TranslationTab({ 
  difyConnected = false,
  onAddLog: onAddLogOriginal, 
  modifiedCells = {},
  setModifiedCells = () => {},
  selectedTableId: propSelectedTableId,
  setSelectedTableId: propSetSelectedTableId,
  projectRole = 'viewer'
}) {
  // 全局 Toast 通知（替代 alert 弹窗）
  const toast = useToast();

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
  const [_fields, _setFields] = useState([]); // [{ id, name, type }]
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
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // 搜索关键字防抖（250ms），避免高频重新过滤大列表造成的卡顿
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const [filterUntranslated, setFilterUntranslated] = useState(false);
  const [filterStatus, setFilterStatus] = useState(''); // '' | DRAFT | TRANSLATING | PENDING_REVIEW | APPROVED | REJECTED | PUBLISHED
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState('changeFirst'); // 'changeFirst' | 'default' | 'createdTime' | 'modifiedTime'

  // Field mappings
  const [fieldMap, setFieldMap] = useState({}); // { name: id }
  const [_revFieldMap, setRevFieldMap] = useState({}); // { id: name }

  // Modal States
  const [editModalRecord, setEditModalRecord] = useState(null); // Record being edited
  const sessionMetaRef = useRef({}); // P1-1: 追踪编辑会话中的翻译来源 { lang: 'ai' | 'human' | 'tm' }
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
  const [generatingKw, setGeneratingKw] = useState(false);

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

  // CSV 增量导入预览状态
  const [importDiff, setImportDiff] = useState(null); // { added: [], modified: [], unchanged: [], removed: [], csvRecords: [] }
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);

  const currentUser = useMemo(() => safeGetLocalStorage('user', null), []);

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
    if (editModalRecord && editModalRecord.KW) {
      loadTmReferences(editModalRecord.KW);
    } else {
      setTmReferences([]);
    }
  }, [editModalRecord, loadTmReferences]);

  const handleApplyTmReference = (refTrans, diffsOnly = false) => {
    if (!editModalRecord) return;
    const mergedTrans = { ...editModalRecord.translations };
    Object.keys(refTrans).forEach(lang => {
      if (refTrans[lang] && refTrans[lang].trim() !== '') {
        // diffsOnly 模式：仅填充当前为空或值不同的字段
        const currentVal = (mergedTrans[lang] || '').trim();
        if (diffsOnly && currentVal === refTrans[lang].trim()) return;
        mergedTrans[lang] = refTrans[lang];
        sessionMetaRef.current[lang] = 'tm'; // P1-1: 标记为翻译记忆来源
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
        toast.success(data.message || '回退成功！');
        await loadSnapshots(termId);
        await loadTableData(selectedTableId);
        setEditModalRecord(null); // 关闭弹窗刷新
      } else {
        const err = await res.json();
        toast.error(`回退失败: ${err.error || '未知原因'}`);
      }
    } catch (e) {
      console.error(e);
      toast.error('回退网络或服务器异常。');
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
        toast.success(data.message || '批量审核设置成功！');
        setBatchApproveOpen(false);
        setSelectedRecordIds(new Set());
        await loadTableData(selectedTableId);
      } else {
        const err = await res.json();
        toast.error(`审核操作失败: ${err.error || '未知原因'}`);
      }
    } catch (e) {
      console.error(e);
      toast.error('批量审核提交时发生异常。');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRowLock = async (recId, currentLockState) => {
    if (currentUser?.role !== 'admin') {
      toast.error('只有管理员有权锁定/解锁词条！');
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
        toast.error(`锁定操作失败: ${errData.error || '未知错误'}`);
      }
    } catch (e) {
      console.error('锁定操作失败:', e);
      toast.error('网络连接错误，锁定失败');
    } finally {
      setLockLoadingId('');
    }
  };

  // Batch Translate State
  const [batchProgress, setBatchProgress] = useState({ total: 0, current: 0, status: '' });
  const [batchPreviewList, setBatchPreviewList] = useState([]); // [{ recordId, KW, 中文, 所在页面, translations: { langName: value } }]
  const [isTranslatingBatch, setIsTranslatingBatch] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);

  // Local wrapper to automatically append table name (version) to logs
  const onAddLog = useCallback((action, kw = '', chinese = '', details = '') => {
    const activeTableMeta = tables.find(t => t.id === selectedTableId);
    const tableName = activeTableMeta ? activeTableMeta.name : '';
    onAddLogOriginal(action, kw, chinese, details, tableName);
  }, [onAddLogOriginal, tables, selectedTableId]);

  // 映射 Dify 翻译接口常见 HTTP 错误与业务异常，提供更人性化的中文指引
  const getFriendlyAiErrorMessage = (errMessage) => {
    if (!errMessage) return '未知翻译错误';
    const msgLower = errMessage.toLowerCase();
    if (msgLower.includes('401') || msgLower.includes('unauthorized') || msgLower.includes('invalid api key') || msgLower.includes('auth')) {
      return 'Dify 引擎认证失效，请确认管理员是否在【引擎设置】页签配置了正确的 API 密钥。';
    }
    if (msgLower.includes('403') || msgLower.includes('forbidden')) {
      return '访问被拒绝 (HTTP 403)，可能是 Dify 接口权限不足或 IP 被策略限制，请确认 API Key 权限配置。';
    }
    if (msgLower.includes('404') || msgLower.includes('not found')) {
      return 'Dify 工作流未找到，请确认 API 接口地址与配置路径是否正确。';
    }
    if (msgLower.includes('500') || msgLower.includes('internal server error')) {
      return 'Dify 服务端异常 (HTTP 500)，可能由于其大模型系统暂不可用或服务过载，请稍后重试。';
    }
    if (msgLower.includes('504') || msgLower.includes('gateway timeout')) {
      return 'Dify 服务响应超时，可能由于翻译任务过重或大模型响应延迟，请稍后重试。';
    }
    return errMessage;
  };


  // Sync the latest records list to backend SQLite via /api/sync-table (full replace)
  const saveOfflineRecords = useCallback(async (tableId, recordsList) => {
    if (!tableId || !recordsList) return;
    const activeTableMeta = tables.find(t => t.id === tableId);
    const tableName = activeTableMeta ? activeTableMeta.name : 'Unknown';
    const formatted = recordsList.map(rec => ({
      recordId: rec.recordId,
      fields: rec.fields || {},
      translationsMeta: rec.translationsMeta || {},
      createdAt: rec.createdAt || new Date().toISOString(),
      updatedAt: rec.updatedAt || new Date().toISOString()
    }));
    const res = await apiFetch('/api/sync-table', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId, tableName, records: formatted })
    });
    // P1-4/P2-1: 检查响应状态，失败时抛出异常通知调用方
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `数据同步失败 (HTTP ${res.status})`);
    }
  }, [tables]);

  // File Input Ref
  const fileInputRef = useRef(null);
  // M5: 取消令牌，防止 selectedTableId 快速切换时 loadTableData 产生竞态
  const loadDataAbortRef = useRef(null);
  // M12: records 的 ref 镜像，避免 CSV 导入异步回调中捕获到旧的 records
  const recordsRef = useRef([]);



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
            // 如果父组件已传入 targetTableId 且在列表中，则使用它；否则默认选第一个
            const hasValidSelection = propSelectedTableId && syncedTables.some(t => t.id === propSelectedTableId);
            if (!hasValidSelection) {
              setSelectedTableId(syncedTables[0].id);
            }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _mergeTimestamps = useCallback(async (allRecords, tableId) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // M5: Load Fields and Records when selected table changes (with race-condition guard)
  useEffect(() => {
    if (!selectedTableId) return;
    // 取消上一次未完成的加载
    if (loadDataAbortRef.current) loadDataAbortRef.current = true;
    const myToken = { cancelled: false };
    loadDataAbortRef.current = myToken;

    (async () => {
      try {
        setLoading(true);
        const res = await apiFetch(`/api/tables/${selectedTableId}/records`);
        if (myToken.cancelled) return;
        if (res.ok) {
          const dbRecords = await res.json();
          if (myToken.cancelled) return;

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
          if (!myToken.cancelled) showStatus('error', '获取固件词条数据失败');
        }
      } catch (err) {
        if (!myToken.cancelled) {
          console.error('⚠️ 无法读取词条数据:', err.message);
          showStatus('error', '数据库连接失败，请确认后端已启动。');
        }
      } finally {
        if (!myToken.cancelled) setLoading(false);
      }
    })();

    return () => { myToken.cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTableId]);

  // Reset selection on table change
  useEffect(() => {
    setSelectedRecordIds(new Set());
  }, [selectedTableId]);

  // M12: 保持 recordsRef 与 records 状态同步，供异步回调读取最新值
  useEffect(() => { recordsRef.current = records; }, [records]);



  const showStatus = (type, text) => {
    setStatusMessage({ type, text });
    if (type === 'success') {
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  // Pre-build normalized field map for O(1) fuzzy lookups (avoids O(n) scan per call)
  const normalizedFieldMap = useMemo(() => {
    const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')');
    const map = {};
    for (const key of Object.keys(fieldMap)) {
      map[normalize(key)] = fieldMap[key];
    }
    return map;
  }, [fieldMap]);

  // Helper to resolve field ID by Name using exact and fuzzy normalized matching
  const getFieldIdByName = useCallback((name) => {
    if (fieldMap[name]) return fieldMap[name];
    const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')');
    return normalizedFieldMap[normalize(name)] || null;
  }, [fieldMap, normalizedFieldMap]);

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
        kw.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) || 
        zh.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      // 按状态筛选（合并后：DRAFT/TRANSLATING/PENDING_REVIEW 都视作“待审核”）
      if (filterStatus) {
        const recStatus = rec.status || 'DRAFT';
        const isPending = (recStatus === 'DRAFT' || recStatus === 'TRANSLATING' || recStatus === 'PENDING_REVIEW');
        if (filterStatus === 'PENDING_REVIEW') {
          if (!isPending) return false;
        } else if (recStatus !== filterStatus) {
          return false;
        }
      }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, debouncedSearchQuery, filterUntranslated, filterStatus, getRecordValueByName, sortBy, modifiedCells, recordIndexMap, TARGET_LANGUAGES]);

  // 分页：当筛选条件/搜索/版本变化导致总数变化时，自动重置到第 1 页
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRecords = filteredRecords.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Render-during-render pattern: detect stale page without extra useEffect cycle
  // Track the filter signature that last caused a reset
  const filterSignature = `${selectedTableId}|${debouncedSearchQuery}|${filterStatus}|${filterUntranslated}|${sortBy}|${pageSize}`;
  const lastFilterRef = useRef(filterSignature);
  if (lastFilterRef.current !== filterSignature) {
    lastFilterRef.current = filterSignature;
    setCurrentPage(1);
  }

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
    // P1-1: 加载已有翻译来源标记并重置会话追踪
    sessionMetaRef.current = { ...(record.translationsMeta || {}) };
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
      toast.error('请至少填写一个需要批量设置的分类字段！');
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
        toast.success(data.message || '批量更新分类字段成功！');
        setBatchUpdateOpen(false);
        setSelectedRecordIds(new Set());
        await loadTableData(selectedTableId);
      } else {
        const err = await res.json();
        toast.error(`修改失败: ${err.error || '未知原因'}`);
      }
    } catch (e) {
      console.error(e);
      toast.error('批量修改发生异常错误。');
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
        toast.success(`批量复制完成！\n- 新增: ${data.addedCount} 条\n- 覆盖: ${data.overwrittenCount} 条\n- 跳过(重复/被锁定): ${data.skippedCount} 条`);
        setBatchCopyOpen(false);
        setSelectedRecordIds(new Set());
      } else {
        const err = await res.json();
        toast.error(`复制失败: ${err.error || '未知原因'}`);
      }
    } catch (e) {
      console.error(e);
      toast.error('批量复制发送网络异常。');
    } finally {
      setLoading(false);
    }
  };

  const handleInheritTranslationsSubmit = async () => {
    if (!syncInheritSourceId) {
      toast.error('请先选择继承的源大表版本！');
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
        toast.success(data.message || '继承补全成功！');
        setSyncInheritOpen(false);
        await loadTableData(selectedTableId);
      } else {
        const err = await res.json();
        toast.error(`继承失败: ${err.error || '未知错误'}`);
      }
    } catch (e) {
      console.error(e);
      toast.error('继承失败，网络或后端异常。');
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

      // Send single term update to backend via REST API
      const res = await apiFetch(`/api/terms/${editModalRecord.recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kw: editModalRecord.KW,
          context: editModalRecord.所在页面,
          owner: editModalRecord.字号类别,
          zh_cn: editModalRecord.中文,
          translations: editModalRecord.translations,
          translationsMeta: sessionMetaRef.current,
          oldUpdatedAt: recordObj.updatedAt
        })
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || errBody.error || `保存修改失败 (HTTP ${res.status})`);
      }

      const savedTerm = await res.json();

      // Reformat savedTerm database fields to match Bitable schema used in records state
      let trans = {};
      try {
        let temp = savedTerm.translations;
        while (typeof temp === 'string' && temp.trim() !== '') {
          temp = JSON.parse(temp);
        }
        if (typeof temp === 'object' && temp !== null) {
          trans = temp;
        }
      } catch { trans = {}; }

      let transMeta = {};
      try {
        let metaTemp = savedTerm.translations_meta;
        while (typeof metaTemp === 'string' && metaTemp.trim() !== '') {
          metaTemp = JSON.parse(metaTemp);
        }
        if (typeof metaTemp === 'object' && metaTemp !== null) {
          transMeta = metaTemp;
        }
      } catch { transMeta = {}; }

      const updatedRecObj = {
        recordId: savedTerm.id,
        createdAt: savedTerm.created_at,
        updatedAt: savedTerm.updated_at,
        isLocked: savedTerm.is_locked || 0,
        lockedBy: savedTerm.locked_by || '',
        lockedAt: savedTerm.locked_at || '',
        status: savedTerm.status || 'DRAFT',
        rejectReason: savedTerm.reject_reason || '',
        translationsMeta: transMeta,
        fields: {
          KW: savedTerm.kw,
          'CN（中文）': savedTerm.zh_cn,
          所在页面: savedTerm.context || '',
          字号类别: savedTerm.owner || '',
          ...trans
        }
      };

      const updatedRecordsList = recordsRef.current.map(rec => {
        if (rec.recordId === editModalRecord.recordId) {
          return updatedRecObj;
        }
        return rec;
      });
      setRecords(updatedRecordsList);

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

  // Helper to call backend API and generate KW from Chinese
  const generateKWForText = async (text) => {
    if (!text || !text.trim()) {
      toast.error('请先输入中文源词！');
      return '';
    }
    try {
      const res = await apiFetch('/api/projects/proj-default/generate-kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.kw || '';
    } catch (err) {
      toast.error(`自动生成 KW 失败: ${err.message}`);
      return '';
    }
  };

  // AI pre-translate single term in Add Modal
  const handleSingleAiTranslate = async () => {
    if (!newTerm.中文) {
      toast.error('请先输入中文源词！');
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
      showStatus('danger', `AI 翻译失败: ${getFriendlyAiErrorMessage(err.message)}`);
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
    if (!newTerm.中文) {
      toast.error('中文源词为必填项！');
      return;
    }

    try {
      setLoading(true);
      
      let finalKW = (newTerm.KW || '').trim();
      if (!finalKW) {
        const generated = await generateKWForText(newTerm.中文);
        if (!generated) {
          setLoading(false);
          return;
        }
        finalKW = generated;
        setNewTerm(prev => ({ ...prev, KW: generated }));
      }
      
      // Perform duplicate and synonym checks
      const existingList = await fetchTargetTableKWAndChinese(addTargetTableId);
      
      // 1. Check exact KW duplicate
      const duplicateKWItem = existingList.find(item => item.kw.toLowerCase() === finalKW.toLowerCase());
      if (duplicateKWItem) {
        toast.error(`无法保存！已维护相同KW词条：\n- KW: ${finalKW}\n- 已存在词条中文: ${duplicateKWItem.chinese}`);
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
        const proceed = window.confirm(`系统检测到有同义或相近词条：\n\n- 已存在：【${similarItem.kw}】“${similarItem.chinese}”\n- 当前新增：【${finalKW}】“${newTerm.中文}”\n\n是否确认继续添加？`);
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
        'KW': finalKW,
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
        updatedRecordsList = [...recordsRef.current, newRecObj];
        setRecords(updatedRecordsList);
      } else {
        const res = await apiFetch(`/api/tables/${addTargetTableId}/records`);
        let currentTerms = [];
        if (res.ok) {
          currentTerms = await res.json();
        }
        updatedRecordsList = [...currentTerms, newRecObj];
      }

      await saveOfflineRecords(addTargetTableId, updatedRecordsList);

      onAddLog('新增词条', finalKW, newTerm.中文);
      setModifiedCells(prev => ({
        ...prev,
        [newRecordId]: { ...addedLangs, isAdded: true }
      }));

      // 关闭弹窗 → toast 提示保存成功 → 重置表单
      setAddModalOpen(false);
      setNewTerm({ KW: '', 中文: '', 所在页面: '', 字号类别: '', translations: {} });
      toast.success(`新增词条成功！(目标版本: ${tables.find(t => t.id === addTargetTableId)?.name || '未名'})`);

      // 如果新增目标是当前选中的版本，刷新表格数据
      if (addTargetTableId === selectedTableId) {
        await loadTableData(selectedTableId);
      }
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
      toast.error('请先在“引擎设置”页签中配置 Dify 的 API 地址与密钥！');
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
      showStatus('danger', `初始化批量翻译失败: ${getFriendlyAiErrorMessage(err.message)}`);
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
      showStatus('danger', `载入目标版本词条失败: ${getFriendlyAiErrorMessage(err.message)}`);
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
        
        updatedList[i] = { ...updatedList[i], translations: trans };
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
      setIsSavingBatch(true);
      
      const updatedCellsDict = { ...modifiedCells };
      const recordsToUpdate = [];

      const targetFieldMap = { 'KW': 'KW', 'CN（中文）': 'CN（中文）', '所在页面': '所在页面', '字号类别': '字号类别' };
      TARGET_LANGUAGES.forEach(lang => {
        targetFieldMap[lang] = lang;
      });

      batchPreviewList.forEach(item => {
        const fields = {};
        const batchMeta = {}; // P1-1: 批量翻译来源标记
        const rowModifiedDict = updatedCellsDict[item.recordId] || {};
        let hasNewTrans = false;

        Object.keys(item.translations).forEach(lang => {
          const fieldId = targetFieldMap[lang];
          if (fieldId && item.translations[lang]) {
            fields[fieldId] = item.translations[lang];
            batchMeta[lang] = 'ai'; // P1-1: 标记为 AI 翻译
            rowModifiedDict[lang] = true;
            hasNewTrans = true;
          }
        });

        if (hasNewTrans) {
          recordsToUpdate.push({
            recordId: item.recordId,
            fields,
            translationsMeta: batchMeta
          });
          updatedCellsDict[item.recordId] = rowModifiedDict;
        }
      });

      let updatedRecordsList = [];
      if (batchTargetTableId === selectedTableId) {
        updatedRecordsList = recordsRef.current.map(rec => {
          const updateItem = recordsToUpdate.find(r => r.recordId === rec.recordId);
          if (updateItem) {
            return {
              ...rec,
              fields: {
                ...rec.fields,
                ...updateItem.fields
              },
              translationsMeta: { ...(rec.translationsMeta || {}), ...(updateItem.translationsMeta || {}) },
              updatedAt: new Date().toISOString()
            };
          }
          return rec;
        });
        setRecords(updatedRecordsList);
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
              translationsMeta: { ...(rec.translationsMeta || {}), ...(updateItem.translationsMeta || {}) }, // P1-1: 合并翻译来源
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
      setIsSavingBatch(false);
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
      toast.error('一次最多批量新增 15 条词条！');
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
      toast.error('请至少填写一行词条信息！');
      return;
    }

    const invalidRow = activeRows.find(r => !r.KW || !r.中文 || !r.所在页面);
    if (invalidRow) {
      toast.error('KW、中文、所在页面为必填项，请补全内容！');
      return;
    }

    if (!difyConfigured) {
      toast.error('请先在“引擎设置”页签中配置 Dify 的 API 地址与密钥！');
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
        
        updatedRows[i] = { ...row, translations: trans };
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
      if (!row.中文) return false;
      return TARGET_LANGUAGES.some(lang => row.translations[lang] && row.translations[lang].trim() !== '');
    });

    if (completedRows.length === 0) {
      toast.error('没有已完成翻译的词条！请先执行“AI 批量翻译”并确认翻译结果不为空。');
      return;
    }

    setLoading(true);
    try {
      // 1. Auto-generate KW for rows with empty KW
      const resolvedRows = await Promise.all(
        completedRows.map(async row => {
          let trimmedKW = (row.KW || '').trim();
          if (!trimmedKW) {
            const generated = await generateKWForText(row.中文);
            if (!generated) {
              throw new Error(`自动为中文 “${row.中文}” 生成 KW 失败。`);
            }
            trimmedKW = generated;
          }
          return { ...row, KW: trimmedKW };
        })
      );

      // Perform duplicate and similarity checks
      const existingList = await fetchTargetTableKWAndChinese(batchAddTargetTableId);
      
      // 2. Check duplicate KWs
      const batchKWSet = new Set();
      for (const row of resolvedRows) {
        const duplicateKWItem = existingList.find(item => item.kw.toLowerCase() === row.KW.toLowerCase());
        if (duplicateKWItem) {
          toast.error(`无法保存！批处理中发现已维护相同KW词条：\n- KW: ${row.KW}\n- 已存在词条中文: ${duplicateKWItem.chinese}`);
          setLoading(false);
          return;
        }
        if (batchKWSet.has(row.KW.toLowerCase())) {
          toast.error(`无法保存！批量列表中含有重复的KW：${row.KW}`);
          setLoading(false);
          return;
        }
        batchKWSet.add(row.KW.toLowerCase());
      }
      
      // 3. Check similarity
      const getOverlap = (strA, strB) => {
        if (strA === strB) return 1.0;
        const setA = new Set(strA.split(''));
        const setB = new Set(strB.split(''));
        const intersection = new Set([...setA].filter(x => setB.has(x)));
        const union = new Set([...setA, ...setB]);
        return union.size > 0 ? intersection.size / union.size : 0;
      };

      for (const row of resolvedRows) {
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

      for (let i = 0; i < resolvedRows.length; i++) {
        const row = resolvedRows[i];
        const fields = {
          'KW': row.KW,
          'CN（中文）': row.中文,
          '所在页面': row.所在页面 || '',
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

      // P0-1: 必须先获取目标版本的全量记录，追加新增后再全量同步，避免 sync-table 全量替换删除现有数据
      let fullRecords = [];
      if (batchAddTargetTableId === selectedTableId) {
        fullRecords = [...recordsRef.current, ...addedRecordsForSync];
      } else {
        const fetchRes = await apiFetch(`/api/tables/${batchAddTargetTableId}/records`);
        const currentTerms = fetchRes.ok ? await fetchRes.json() : [];
        fullRecords = [...currentTerms, ...addedRecordsForSync];
      }
      await saveOfflineRecords(batchAddTargetTableId, fullRecords);

      setModifiedCells(updatedCellsDict);
      setBatchAddModalOpen(false);
      toast.success(`批量新增成功！共写入 ${resolvedRows.length} 条已翻译词条。`);

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
      toast.error('请先输入中文源词！');
      return;
    }
    if (!difyConfigured) {
      toast.error('请先在“引擎设置”页签配置 Dify API 接口地址与密钥！');
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
        let errJson;
        try { errJson = await res.json(); } catch { errJson = {}; }
        throw new Error(errJson.error || 'AI 翻译失败');
      }
      let result;
      try { result = await res.json(); } catch { result = {}; }
      
      const updatedTrans = { ...editModalRecord.translations };
      TARGET_LANGUAGES.forEach(lang => {
        const val = findValueInDifyResult(lang, result);
        if (val !== undefined) {
          updatedTrans[lang] = val;
          sessionMetaRef.current[lang] = 'ai'; // P1-1: 标记为 AI 翻译来源
        }
      });
      setEditModalRecord(prev => ({ ...prev, translations: updatedTrans }));
      showStatus('success', 'AI 智能翻译完成，请审查并保存修改！');
    } catch (err) {
      showStatus('danger', `AI 翻译失败: ${getFriendlyAiErrorMessage(err.message)}`);
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

      // P2-3: 先持久化到数据库，成功后再更新 UI
      const updatedRecordsList = recordsRef.current.filter(rec => !selectedRecordIds.has(rec.recordId));
      await saveOfflineRecords(selectedTableId, updatedRecordsList);

      setRecords(updatedRecordsList);
      
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
      toast.error('当前数据表中未发现空词条（KW 或 CN（中文） 为空的词条）！');
      return;
    }

    const confirmMessage = `系统检测到当前版本表内有 ${emptyRecords.length} 条空词条（缺少 KW 或缺少 CN（中文））。\n\n是否确认清理并从数据表中永久删除这 ${emptyRecords.length} 条空词条？`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    try {
      const idsToDelete = emptyRecords.map(r => r.recordId);

      // P2-3: 先持久化到数据库，成功后再更新 UI
      const updatedRecordsList = recordsRef.current.filter(rec => !idsToDelete.includes(rec.recordId));
      await saveOfflineRecords(selectedTableId, updatedRecordsList);

      setRecords(updatedRecordsList);

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

  const handleCsvImportSelected = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!selectedTableId) {
      showStatus('danger', '请先选择一个数据表！');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      try {
        setLoading(true);
        const text = readerEvent.target.result;
        const parsedRows = parseCSV(text);

        if (parsedRows.length < 2) {
          showStatus('danger', 'CSV 文件中没有有效数据！');
          return;
        }

        const headers = parsedRows[0];
        // 过滤完全空白的行
        const rows = parsedRows.slice(1).filter(r => r.some(c => (c || '').trim() !== ''));

        if (rows.length === 0) {
          showStatus('danger', 'CSV 文件中没有有效数据！');
          return;
        }

        // Use unified fuzzy matching to map headers to internal fields
        const colMap = [];
        const mappings = [];

        const kwIdx = fuzzyFindIndex(headers, ['KW', 'Key'], ['kw', 'key', '词条']);
        const zhIdx = fuzzyFindIndex(headers, ['CN（中文）', '中文', 'Source'], ['中文', 'cn', 'source']);
        const pageIdx = fuzzyFindIndex(headers, ['所在页面', '词条所在界面（注意是界面不是模块！！）'], ['页面', '界面', 'page', 'context']);
        const typeIdx = fuzzyFindIndex(headers, ['字号类别', '负责人'], ['字号', '类别', '负责人']);

        if (kwIdx === -1) {
          showStatus('danger', 'CSV 结构非法：必须包含 "KW" 列！');
          return;
        }

        colMap.push({ idx: kwIdx, fieldName: 'KW' });
        if (headers[kwIdx] !== 'KW') mappings.push(`[${headers[kwIdx]}] -> KW`);

        if (zhIdx !== -1) {
          colMap.push({ idx: zhIdx, fieldName: 'CN（中文）' });
          if (headers[zhIdx] !== 'CN（中文）') mappings.push(`[${headers[zhIdx]}] -> CN（中文）`);
        }

        if (pageIdx !== -1) {
          colMap.push({ idx: pageIdx, fieldName: '所在页面' });
          if (!['所在页面', '词条所在界面（注意是界面不是模块！！）'].includes(headers[pageIdx])) {
            mappings.push(`[${headers[pageIdx]}] -> 所在页面`);
          }
        }

        if (typeIdx !== -1) {
          colMap.push({ idx: typeIdx, fieldName: '字号类别' });
          if (!['字号类别'].includes(headers[typeIdx])) {
            mappings.push(`[${headers[typeIdx]}] -> 字号类别`);
          }
        }

        // 匹配目标语种列
        TARGET_LANGUAGES.forEach(lang => {
          let fuzzyKeywords = [lang.toLowerCase()];
          const match = lang.match(/([a-zA-Z]+)[（(](.+)[)）]/);
          if (match) {
            fuzzyKeywords = [match[1].toLowerCase(), match[2].toLowerCase()];
          } else {
            const letters = lang.match(/[a-zA-Z]+/);
            const chars = lang.match(/[\u4e00-\u9fa5]+/);
            if (letters) fuzzyKeywords.push(letters[0].toLowerCase());
            if (chars) fuzzyKeywords.push(chars[0]);
          }
          const csvLangIdx = fuzzyFindIndex(headers, [lang], fuzzyKeywords);
          if (csvLangIdx !== -1) {
            colMap.push({ idx: csvLangIdx, fieldName: lang });
            if (headers[csvLangIdx] !== lang) {
              mappings.push(`[${headers[csvLangIdx]}] -> ${lang}`);
            }
          }
        });

        if (mappings.length > 0) {
          showStatus('success', `已智能映射非标准表头: ${mappings.join(', ')}`);
        }

        // Build CSV record objects
        const csvRecords = rows.map((row, ridx) => {
          const fields = {};
          colMap.forEach(({ idx, fieldName }) => {
            const v = row[idx];
            if (v !== undefined) fields[fieldName] = v;
          });
          return {
            recordId: `csv-import-${ridx}`,
            fields,
            kw: (fields['KW'] || '').trim(),
          };
        }).filter(r => r.kw);

        if (csvRecords.length === 0) {
          showStatus('danger', 'CSV 文件中没有有效的 KW 词条！');
          return;
        }

        // Diff against current records
        const currentByKw = {};
        const currentRecords = recordsRef.current;
        currentRecords.forEach(rec => {
          const kw = (getRecordValueByName(rec, 'KW') || '').trim();
          if (kw) currentByKw[kw] = rec;
        });

        const added = [];
        const modified = [];
        const unchanged = [];
        const usedKws = new Set();

        csvRecords.forEach(csvRec => {
          const existing = currentByKw[csvRec.kw];
          if (!existing) {
            added.push(csvRec);
            usedKws.add(csvRec.kw);
          } else {
            usedKws.add(csvRec.kw);
            const changes = {};
            const allFields = ['所在页面', '字号类别', 'KW', 'CN（中文）', ...TARGET_LANGUAGES];
            allFields.forEach(field => {
              const csvVal = (csvRec.fields[field] || '').trim();
              const curVal = (getRecordValueByName(existing, field) || '').trim();
              if (csvVal !== curVal) {
                changes[field] = { old: curVal, new: csvVal };
              }
            });
            if (Object.keys(changes).length > 0) {
              modified.push({ ...csvRec, existingRecord: existing, changes });
            } else {
              unchanged.push(csvRec);
            }
          }
        });

        const removed = currentRecords.filter(rec => {
          const kw = (getRecordValueByName(rec, 'KW') || '').trim();
          return kw && !usedKws.has(kw);
        });

        if (added.length === 0 && modified.length === 0) {
          showStatus('info', `没有检测到变化（${unchanged.length} 条一致，${removed.length} 条不在CSV中）`);
          return;
        }

        setImportDiff({ added, modified, unchanged, removed, csvRecords });
        setImportPreviewOpen(true);
      } catch (err) {
        showStatus('danger', `解析 CSV 失败: ${err.message}`);
      } finally {
        setLoading(false);
        // Reset file input
        event.target.value = '';
      }
    };

    reader.readAsText(file, 'utf-8');
  };

  // CSV 增量导入确认：将 added + modified 合并进当前 records，并标记 modifiedCells
  const handleConfirmImport = async () => {
    if (!importDiff) return;
    // P2-2: 校验 selectedTableId 非空
    if (!selectedTableId) {
      showStatus('danger', '请先选择一个数据表再执行导入！');
      return;
    }

    const currentRecords = recordsRef.current;
    const currentByKw = {};
    currentRecords.forEach(rec => {
      const kw = (getRecordValueByName(rec, 'KW') || '').trim();
      if (kw) currentByKw[kw] = rec;
    });

    const newModifiedCells = { ...modifiedCells };

    const updatedRecords = currentRecords.map(rec => {
      const kw = (getRecordValueByName(rec, 'KW') || '').trim();
      const modItem = importDiff.modified.find(m => m.kw === kw);
      if (modItem) {
        const updatedFields = { ...rec.fields };
        Object.entries(modItem.changes).forEach(([field, { new: newVal }]) => {
          updatedFields[field] = newVal;
          if (!newModifiedCells[rec.recordId]) newModifiedCells[rec.recordId] = {};
          newModifiedCells[rec.recordId][field] = true;
        });
        return { ...rec, fields: updatedFields, updatedAt: new Date().toISOString() };
      }
      return rec;
    });

    // Add new records
    importDiff.added.forEach((rec, idx) => {
      const newRecordId = `new-import-${Date.now()}-${idx}`;
      const newRec = {
        recordId: newRecordId,
        fields: { ...rec.fields },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isNew: true,
      };
      newModifiedCells[newRecordId] = { isAdded: true };
      TARGET_LANGUAGES.forEach(lang => {
        if (rec.fields[lang]) newModifiedCells[newRecordId][lang] = true;
      });
      ['所在页面', '字号类别', 'KW', 'CN（中文）'].forEach(f => {
        if (rec.fields[f]) newModifiedCells[newRecordId][f] = true;
      });
      updatedRecords.push(newRec);
    });

    setRecords(updatedRecords);
    setModifiedCells(newModifiedCells);
    setImportPreviewOpen(false);
    setImportDiff(null);

    await saveOfflineRecords(selectedTableId, updatedRecords);

    const summary = `新增 ${importDiff.added.length} 条，修改 ${importDiff.modified.length} 条`;
    onAddLog('CSV增量导入', '', '', summary);
    showStatus('success', `导入成功！${summary}`);
  };

  // XLS (Excel XML) Export with cell background highlighting
  const handleExportXLS = () => {
    if (!selectedTableId) {
      showStatus('danger', '请先选择一个数据表！');
      return;
    }
    if (!filteredRecords || filteredRecords.length === 0) {
      showStatus('danger', '当前没有可导出的数据，请先加载数据表！');
      return;
    }
    try {
      const headers = ['所在页面', '字号类别', 'KW', 'CN（中文）', ...TARGET_LANGUAGES];
      const stdFields = ['所在页面', '字号类别', 'KW', 'CN（中文）'];
      const allFields = [...stdFields, ...TARGET_LANGUAGES];

      // Build Excel XML rows
      const rows = filteredRecords.map(rec => {
        const rowModified = modifiedCells[rec.recordId] || {};
        const isNew = rowModified.isAdded === true;

        const cells = [];
        allFields.forEach(field => {
          const value = getRecordValueByName(rec, field) || '';
          // Determine highlight: row-level if new, cell-level if modified
          const cellModified = rowModified[field];
          const styleId = isNew ? 'newRow' : (cellModified ? 'highlight' : null);
          cells.push({ value, styleId });
        });

        return cells;
      });

      // Generate Excel XML
      const headerRow = headers.map(h => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('');

      const dataRows = rows.map(cells => {
        const cellXml = cells.map(c => {
          const styleAttr = c.styleId ? ` ss:StyleID="${c.styleId}"` : '';
          return `<Cell${styleAttr}><Data ss:Type="String">${escapeXml(c.value)}</Data></Cell>`;
        }).join('');
        return `<Row>${cellXml}</Row>`;
      }).join('');

      const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="highlight">
   <Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="newRow">
   <Interior ss:Color="#FEF9C3" ss:Pattern="Solid"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Export">
  <Table>
   <Row>${headerRow}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;

      const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      const activeTableMeta = tables.find(t => t.id === selectedTableId);
      const tableName = activeTableMeta ? activeTableMeta.name : 'export';

      link.setAttribute('href', url);
      link.setAttribute('download', `GlossaHub_export_${tableName}.xls`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onAddLog(`导出当前视图 XLS (表格: ${tableName})`);
      showStatus('success', 'XLS 导出成功！');
    } catch (err) {
      showStatus('danger', `导出 XLS 失败: ${err.message}`);
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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
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

          {/* Status Filter Dropdown */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-input"
            style={{ height: '34px', padding: '0 0.5rem', fontSize: '0.82rem', minWidth: '120px' }}
            title="按状态筛选"
          >
            <option value="">全部状态</option>
            <option value="PENDING_REVIEW">待审核</option>
            <option value="APPROVED">已审核</option>
            <option value="REJECTED">被驳回</option>
            <option value="PUBLISHED">已发布</option>
          </select>

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
                  boxShadow: 'var(--shadow-lg)', 
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
          {/* 常规操作组 */}
          <div className="toolbar-group">
            {projectRole !== 'viewer' && (
              <>
                <button onClick={() => { setAddTargetTableId(selectedTableId); setAddModalOpen(true); }} className="btn btn-secondary">
                  <Plus size={14} /> 新增
                </button>
                <button onClick={() => { setBatchAddModalOpen(true); initBatchAddRows(); }} className="btn btn-secondary">
                  <Layers size={14} /> 批量新增
                </button>
                <button onClick={handleDataClean} className="btn btn-secondary" title="清除无 KW 或无中文的空记录">
                  <Trash2 size={14} /> 数据清理
                </button>
                <button onClick={handleTriggerImport} className="btn btn-secondary" title="导入 CSV">
                  <FileInput size={14} /> 导入
                </button>
              </>
            )}
            <button onClick={handleExportXLS} className="btn btn-secondary" title="导出 XLS">
              <FileOutput size={14} /> 导出xls
            </button>
          </div>

          {/* 翻译操作组 */}
          {projectRole !== 'viewer' && (
            <>
              <div className="toolbar-divider" />
              <div className="toolbar-group">
                <button onClick={handleOpenBatchTranslate} className="btn btn-primary">
                  <RefreshCw size={14} /> 批量翻译
                </button>
                <button onClick={() => { setSyncInheritSourceId(''); setSyncInheritOpen(true); }} className="btn btn-secondary" title="从其他大表继承补全缺失翻译">
                  <Layers size={14} /> 继承翻译
                </button>
              </div>
            </>
          )}

          {/* 选中操作组 —— 仅在有选中时显示 */}
          {selectedRecordIds.size > 0 && projectRole !== 'viewer' && (
            <>
              <div className="toolbar-divider" />
              <div className="toolbar-group">
                {(currentUser?.role === 'admin' || projectRole === 'owner') && (
                  <button
                    onClick={() => { setBatchApproveStatus('APPROVED'); setBatchApproveRejectReason(''); setBatchApproveOpen(true); }}
                    className="toolbar-action-btn is-success"
                  >
                    <CheckCircle size={14} /> 批量审核 ({selectedRecordIds.size})
                  </button>
                )}
                <button
                  onClick={() => { setBatchUpdateFields({ context: '', owner: '' }); setBatchUpdateOpen(true); }}
                  className="toolbar-action-btn is-warning"
                >
                  <Settings size={14} /> 批量设置 ({selectedRecordIds.size})
                </button>
                <button
                  onClick={() => { setBatchCopyTargetTableId(tables.find(t => t.id !== selectedTableId)?.id || ''); setBatchCopyDuplicateStrategy('skip'); setBatchCopyOpen(true); }}
                  className="toolbar-action-btn is-accent"
                >
                  <Copy size={14} /> 复制到版本 ({selectedRecordIds.size})
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="toolbar-action-btn is-danger"
                >
                  <Trash2 size={14} /> 删除 ({selectedRecordIds.size})
                </button>
              </div>
            </>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleCsvImportSelected}
            accept=".csv"
            style={{ display: 'none' }}
          />
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
          <div style={{ padding: '0' }}>
            <SkeletonTable rows={12} cols={Math.min(8, 4 + visibleLanguages.length)} />
          </div>
        ) : tables.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            title="当前项目还没有任何版本数据表"
            description="请先到“数据表管理”页面新建第一个固件版本，作为翻译工作的起点。"
          />
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            icon={Search}
            title={debouncedSearchQuery || filterStatus || filterUntranslated ? '没有匹配的词条' : '当前版本暂无词条'}
            description={
              debouncedSearchQuery || filterStatus || filterUntranslated
                ? '当前筛选条件下没有词条，试试清除筛选条件或调整搜索关键字。'
                : '点击右上角“新增词条”按钮，或导入 CSV 创建第一批词条。'
            }
            actionLabel={debouncedSearchQuery || filterStatus || filterUntranslated ? '清除筛选' : '新增第一条词条'}
            onAction={() => {
              if (debouncedSearchQuery || filterStatus || filterUntranslated) {
                setSearchInput('');
                setDebouncedSearchQuery('');
                setFilterStatus('');
                setFilterUntranslated(false);
              } else {
                setAddTargetTableId(selectedTableId);
                setAddModalOpen(true);
              }
            }}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={pagedRecords.length > 0 && pagedRecords.every(rec => selectedRecordIds.has(rec.recordId))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRecordIds(prev => new Set([...prev, ...pagedRecords.map(r => r.recordId)]));
                      } else {
                        const pageIds = new Set(pagedRecords.map(r => r.recordId));
                        setSelectedRecordIds(prev => new Set([...prev].filter(id => !pageIds.has(id))));
                      }
                    }}
                  />
                </th>
                <th style={{ width: '120px', textAlign: 'center' }}>状态</th>
                <th className="sticky-col-1" style={{ width: '150px' }}>KW (Key)</th>
                <th className="sticky-col-2" style={{ width: '180px' }}>CN（中文）</th>
                <th style={{ width: '150px' }}>所在页面</th>
                <th style={{ width: '100px' }}>字号类别</th>
                <th style={{ width: '90px', textAlign: 'center' }} title="已翻译语种数 / 总语种数">翻译进度</th>
                {TARGET_LANGUAGES.map(lang => {
                  if (!visibleLanguages.includes(lang)) return null;
                  return <th key={lang} style={{ width: '160px' }}>{lang}</th>;
                })}
                <th style={{ width: '60px', textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedRecords.map(rec => {
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
                            style={{ color: 'var(--red)', cursor: (currentUser?.role === 'admin' || projectRole === 'owner') ? 'pointer' : 'not-allowed' }} 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (currentUser?.role === 'admin' || projectRole === 'owner') handleToggleRowLock(recId, true);
                            }}
                            title={(currentUser?.role === 'admin' || projectRole === 'owner') ? "点击解锁此行" : "已被管理员锁定只读"}
                          />
                        ) : (
                          <Unlock 
                            size={12} 
                            className="unlock-icon-hover"
                            style={{ color: 'var(--text-muted)', opacity: 0.25, cursor: (currentUser?.role === 'admin' || projectRole === 'owner') ? 'pointer' : 'default' }} 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (currentUser?.role === 'admin' || projectRole === 'owner') handleToggleRowLock(recId, false);
                            }}
                            title={(currentUser?.role === 'admin' || projectRole === 'owner') ? "点击锁定此行" : "未锁定"}
                          />
                        )}
                        
                        {(() => {
                          const recStatus = rec.status || 'DRAFT';
                          // 合并显示：DRAFT 与 PENDING_REVIEW 统一为“待审核”
                          const badgeBase = { backgroundColor: 'transparent', fontSize: '0.68rem', fontWeight: '400', padding: '0.05rem 0.35rem', borderWidth: '1px', borderStyle: 'solid', borderRadius: '3px', lineHeight: '1.4' };
                          if (recStatus === 'DRAFT' || recStatus === 'PENDING_REVIEW' || recStatus === 'TRANSLATING') {
                            return <span className="diff-tag" style={{ ...badgeBase, color: 'var(--yellow)', borderColor: 'var(--yellow)' }}>待审核</span>;
                          } else if (recStatus === 'APPROVED') {
                            return <span className="diff-tag" style={{ ...badgeBase, color: 'var(--green)', borderColor: 'var(--green)' }}>已审核</span>;
                          } else if (recStatus === 'REJECTED') {
                            return <span className="diff-tag" style={{ ...badgeBase, color: 'var(--red)', borderColor: 'var(--red)' }} title={rec.rejectReason || '已驳回'}>已驳回</span>;
                          } else if (recStatus === 'PUBLISHED') {
                            return <span className="diff-tag" style={{ ...badgeBase, color: 'var(--purple)', borderColor: 'var(--purple)' }}>已发布</span>;
                          }
                          return null;
                        })()}
                      </div>
                    </td>
                    <td className={`sticky-col-1 mono ${rowModified.isAdded ? 'cell-added' : ''}`} title={kw}>{kw}</td>
                    <td className={`sticky-col-2 ${rowModified.isAdded ? 'cell-added' : ''}`} title={zh} style={{ fontWeight: '500' }}>{zh}</td>
                    <td className={rowModified.isAdded ? 'cell-added' : ''} title={page}>{page || <span className="cell-empty">未填</span>}</td>
                    <td className={rowModified.isAdded ? 'cell-added' : ''} title={owner}>{owner || <span className="cell-empty">未填</span>}</td>
                    {/* 翻译进度微指示：已翻译语种数 / 当前可见语种数 */}
                    {(() => {
                      const totalLangs = TARGET_LANGUAGES.length;
                      const translatedCount = TARGET_LANGUAGES.reduce((count, lang) => {
                        const val = getRecordValueByName(rec, lang);
                        return val && String(val).trim() ? count + 1 : count;
                      }, 0);
                      const pct = totalLangs > 0 ? Math.round((translatedCount / totalLangs) * 100) : 0;
                      // 颜色：0% 红、<50% 橙、<100% 蓝、100% 绿
                      const color = translatedCount === 0 ? 'var(--red)'
                        : pct < 50 ? 'var(--yellow)'
                        : pct < 100 ? 'var(--accent)'
                        : 'var(--green)';
                      return (
                        <td style={{ textAlign: 'center', padding: '0 0.5rem' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            <div style={{ width: '36px', height: '4px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
                            </div>
                            <span style={{ fontVariantNumeric: 'tabular-nums', color }}>
                              {translatedCount}/{totalLangs}
                            </span>
                          </div>
                        </td>
                      );
                    })()}
                    {TARGET_LANGUAGES.map(lang => {
                      if (!visibleLanguages.includes(lang)) return null;
                      const val = getRecordValueByName(rec, lang);
                      const isModified = rowModified[lang];
                      const isAdded = rowModified.isAdded;
                      // P1-1: 翻译来源标记
                      const source = rec.translationsMeta?.[lang];
                      const isAiSource = source === 'ai';
                      const isTmSource = source === 'tm';

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
                          title={val ? `${val}${isAiSource ? ' (AI 翻译)' : isTmSource ? ' (翻译记忆)' : ''}` : undefined}
                        >
                          {val ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', width: '100%' }}>
                              {isAiSource && <Bot size={11} style={{ flexShrink: 0, color: 'var(--purple)' }} />}
                              {isTmSource && <Check size={11} style={{ flexShrink: 0, color: 'var(--green)' }} />}
                              <span className="truncate" style={{ flex: 1, minWidth: 0 }}>{val}</span>
                            </span>
                          ) : <span className="cell-empty">未翻译</span>}
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
      </div>{/* /.grid-container */}

      {/* 分页器（独立 footer，不跟随表格滚动） */}
      <Pagination
        total={filteredRecords.length}
        page={safePage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        extra={selectedRecordIds.size > 0 ? (
          <> · 已选 <strong style={{ color: 'var(--accent)' }}>{selectedRecordIds.size}</strong> 条</>
        ) : null}
      />

      {/* Modal 1: Edit Modal */}
      {editModalRecord && (
        <GlossaModal
          isOpen={true}
          onClose={() => setEditModalRecord(null)}
          title={<span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            编辑词条翻译 - {editModalRecord.KW}
            {(editModalRecord.isLocked === 1 || editModalRecord.isLocked === true) && (
              <span className="diff-tag" style={{ backgroundColor: 'var(--red)', color: '#fff', fontSize: '0.75rem', padding: '0.1rem 0.5rem' }}>
                🔒 锁定只读
              </span>
            )}
            {projectRole === 'viewer' && (
              <span className="diff-tag" style={{ backgroundColor: 'var(--accent)', color: '#fff', fontSize: '0.75rem', padding: '0.1rem 0.5rem' }}>
                👁️ 只读查看
              </span>
            )}
          </span>}
          maxWidth="1000px"
          width="95%"
          closeDisabled={aiTranslatingSingle}
          footer={<>
            <button onClick={() => setEditModalRecord(null)} className="btn btn-secondary" disabled={aiTranslatingSingle}>
              {projectRole === 'viewer' ? '关闭' : '取消'}
            </button>
            {projectRole !== 'viewer' && (
              <button
                onClick={handleSaveEdit}
                disabled={aiTranslatingSingle || editModalRecord.isLocked === 1 || editModalRecord.isLocked === true}
                className="btn btn-primary"
              >
                保存修改
              </button>
            )}
          </>}
        >
          {projectRole === 'viewer' && (
            <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderBottom: '1px solid rgba(59, 130, 246, 0.2)', padding: '0.6rem 1.5rem', color: 'var(--accent)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertCircle size={14} />
              <span>您的项目角色为只读审核人员。仅可浏览数据，无法提交保存修改。</span>
            </div>
          )}
          {(editModalRecord.isLocked === 1 || editModalRecord.isLocked === true) && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderBottom: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.6rem 1.5rem', color: 'var(--red)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertCircle size={14} />
              <span>此词条已被管理员锁定。普通翻译用户仅可查看数据，无法提交保存修改。</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: '1.5rem', maxHeight: '68vh', overflowY: 'auto' }}>
              
              {/* 左侧主要修改表单 */}
              <div style={{ flex: 3, minWidth: '450px' }}>
                <div className="edit-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>KW 标识 (唯一主键)</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input 
                        type="text" 
                        value={editModalRecord.KW} 
                        onChange={(e) => setEditModalRecord({ ...editModalRecord, KW: e.target.value })}
                        disabled={aiTranslatingSingle || editModalRecord.isLocked === 1 || editModalRecord.isLocked === true || projectRole === 'viewer'}
                        className="text-input"
                        style={{ flex: 1 }}
                        placeholder="选填，留空将在保存时自动根据中文生成"
                      />
                      {projectRole !== 'viewer' && (
                        <button
                          onClick={async () => {
                            setGeneratingKw(true);
                            try {
                              const generated = await generateKWForText(editModalRecord.中文);
                              if (generated) {
                                setEditModalRecord(prev => ({ ...prev, KW: generated }));
                                toast.success('KW 自动生成成功！');
                              }
                            } finally {
                              setGeneratingKw(false);
                            }
                          }}
                          disabled={generatingKw || aiTranslatingSingle || editModalRecord.isLocked === 1 || editModalRecord.isLocked === true}
                          className="btn btn-secondary"
                          title="根据中文语义生成 KW 键名"
                        >
                          {generatingKw ? '生成中...' : '生成 KW'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>CN（中文）</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input 
                        type="text" 
                        value={editModalRecord.中文} 
                        onChange={(e) => setEditModalRecord({ ...editModalRecord, 中文: e.target.value })}
                        disabled={aiTranslatingSingle || editModalRecord.isLocked === 1 || editModalRecord.isLocked === true || projectRole === 'viewer'}
                        className="text-input"
                        style={{ flex: 1 }}
                      />
                      {projectRole !== 'viewer' && (
                        <button
                          onClick={handleEditModalAiTranslate}
                          disabled={aiTranslatingSingle || editModalRecord.isLocked === 1 || editModalRecord.isLocked === true}
                          className="btn btn-secondary"
                          title="调用 Dify 进行 AI 自动预翻译"
                        >
                          {aiTranslatingSingle ? <><Loader2 className="animate-spin" size={14} /> 翻译中...</> : 'AI 智能翻译'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>所在页面</label>
                    <input 
                      type="text" 
                      value={editModalRecord.所在页面} 
                      onChange={(e) => setEditModalRecord({ ...editModalRecord, 所在页面: e.target.value })}
                      disabled={aiTranslatingSingle || editModalRecord.isLocked === 1 || editModalRecord.isLocked === true || projectRole === 'viewer'}
                      className="text-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>字号类别</label>
                    <input 
                      type="text" 
                      value={editModalRecord.字号类别} 
                      onChange={(e) => setEditModalRecord({ ...editModalRecord, 字号类别: e.target.value })}
                      disabled={aiTranslatingSingle || editModalRecord.isLocked === 1 || editModalRecord.isLocked === true || projectRole === 'viewer'}
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
                          sessionMetaRef.current[lang] = 'human'; // P1-1: 标记为人工编辑
                          setEditModalRecord({ ...editModalRecord, translations: trans });
                        }}
                        disabled={aiTranslatingSingle || editModalRecord.isLocked === 1 || editModalRecord.isLocked === true || projectRole === 'viewer'}
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
                    style={{ flex: 1, height: '30px', fontSize: '0.8rem', padding: '0', background: activeRightTab === 'tm' ? 'var(--accent)' : 'transparent', color: activeRightTab === 'tm' ? 'var(--bg-primary)' : 'var(--text-secondary)' }}
                  >
                    🧠 跨版本参考 ({(() => {
                      const ct = editModalRecord?.translations || {};
                      const cz = (editModalRecord?.['CN（中文）'] || '').trim();
                      return tmReferences.filter(r => {
                        if ((r.zh_cn || '').trim() !== cz) return true;
                        return Object.entries(r.translations).some(([k,v]) => v && v.trim() !== (ct[k] || '').trim());
                      }).length;
                    })()})
                  </button>
                  <button 
                    onClick={() => setActiveRightTab('history')}
                    className={`btn ${activeRightTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, height: '30px', fontSize: '0.8rem', padding: '0', background: activeRightTab === 'history' ? 'var(--accent)' : 'transparent', color: activeRightTab === 'history' ? 'var(--bg-primary)' : 'var(--text-secondary)' }}
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
                    ) : (() => {
                      // 计算差异：过滤掉完全一致的参考，标记差异字段
                      const currentTrans = editModalRecord?.translations || {};
                      const currentZhCn = (editModalRecord?.['CN（中文）'] || '').trim();

                      const filteredRefs = tmReferences.map(ref => {
                        const refZhCn = (ref.zh_cn || '').trim();
                        const zhCnDiff = refZhCn !== currentZhCn;
                        const transDiffs = {};
                        let hasAnyDiff = zhCnDiff;
                        Object.keys(ref.translations).forEach(lang => {
                          const refVal = (ref.translations[lang] || '').trim();
                          const curVal = (currentTrans[lang] || '').trim();
                          if (refVal && refVal !== curVal) {
                            transDiffs[lang] = refVal;
                            hasAnyDiff = true;
                          }
                        });
                        // 也检查当前有但参考缺失的语种
                        Object.keys(currentTrans).forEach(lang => {
                          const refVal = (ref.translations[lang] || '').trim();
                          const curVal = (currentTrans[lang] || '').trim();
                          if (curVal && !refVal) {
                            hasAnyDiff = true;
                          }
                        });
                        return { ...ref, zhCnDiff, transDiffs, hasAnyDiff };
                      }).filter(r => r.hasAnyDiff);

                      const identicalCount = tmReferences.length - filteredRefs.length;

                      if (filteredRefs.length === 0) {
                        return (
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '2rem 0', textAlign: 'center', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', flexDirection: 'column', gap: '0.4rem' }}>
                            <span>{tmReferences.length === 0 ? '暂无本项目其他大表中的翻译参考' : '✅ 其他版本的翻译与当前词条完全一致'}</span>
                            {identicalCount > 0 && <span style={{ fontSize: '0.7rem' }}>已隐藏 {identicalCount} 个完全相同的版本</span>}
                          </div>
                        );
                      }

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', overflowY: 'auto', flex: 1, paddingRight: '0.3rem' }}>
                          {identicalCount > 0 && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', paddingBottom: '0.2rem' }}>
                              已隐藏 {identicalCount} 个完全相同的版本，仅显示有差异的 {filteredRefs.length} 个
                            </div>
                          )}
                          {filteredRefs.map((ref, rIdx) => {
                            const diffCount = Object.keys(ref.transDiffs).length + (ref.zhCnDiff ? 1 : 0);
                            return (
                              <div key={rIdx} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.8rem', borderColor: 'rgba(var(--accent-rgb), 0.3)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--accent)' }}>版本: {ref.versionName}</span>
                                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--yellow)', background: 'rgba(var(--yellow-rgb), 0.15)', padding: '0.1rem 0.35rem', borderRadius: '3px', fontWeight: 500 }}>{diffCount} 处差异</span>
                                    <button
                                      onClick={() => handleApplyTmReference(ref.translations, true)}
                                      disabled={editModalRecord.isLocked === 1 || editModalRecord.isLocked === true}
                                      className="btn btn-secondary"
                                      style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', height: '22px' }}
                                      title="仅填充当前为空或不同的字段"
                                    >
                                      应用差异
                                    </button>
                                    <button
                                      onClick={() => handleApplyTmReference(ref.translations, false)}
                                      disabled={editModalRecord.isLocked === 1 || editModalRecord.isLocked === true}
                                      className="btn btn-secondary"
                                      style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', height: '22px' }}
                                      title="覆盖填充全部译文"
                                    >
                                      全部应用
                                    </button>
                                  </div>
                                </div>

                                {/* 中文差异高亮 */}
                                {ref.zhCnDiff ? (
                                  <div style={{ fontSize: '0.8rem', marginBottom: '0.4rem', display: 'flex', gap: '0.3rem', alignItems: 'baseline' }}>
                                    <strong style={{ color: 'var(--text-secondary)' }}>中文:</strong>
                                    <span style={{ color: 'var(--red)', textDecoration: 'line-through', fontSize: '0.75rem' }}>{currentZhCn || '（空）'}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                                    <span style={{ fontWeight: 500, color: 'var(--green)' }}>{ref.zh_cn}</span>
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                                    <strong>中文:</strong> {ref.zh_cn} <span style={{ fontSize: '0.65rem', color: 'var(--green)' }}>[一致]</span>
                                  </div>
                                )}

                                {/* 译文差异展示 */}
                                <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                  {Object.keys(ref.translations).map(lName => {
                                    if (!ref.translations[lName]) return null;
                                    const refVal = (ref.translations[lName] || '').trim();
                                    const curVal = (currentTrans[lName] || '').trim();
                                    const isDiff = refVal !== curVal;
                                    return (
                                      <div key={lName} style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', minHeight: '1.1rem' }}>
                                        <span style={{ color: isDiff ? 'var(--accent)' : 'var(--text-muted)', fontWeight: isDiff ? 600 : 400 }}>{lName}:</span>
                                        {isDiff ? (
                                          <span style={{ display: 'flex', gap: '0.3rem', alignItems: 'baseline' }}>
                                            {curVal && <span style={{ color: 'var(--red)', textDecoration: 'line-through', fontSize: '0.7rem', opacity: 0.7 }}>{curVal}</span>}
                                            {curVal && <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>→</span>}
                                            <span style={{ fontWeight: 500, color: 'var(--green)' }}>{refVal}</span>
                                          </span>
                                        ) : (
                                          <span style={{ color: 'var(--text-muted)' }}>{refVal} <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>[一致]</span></span>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {/* 显示当前有但参考缺失的语种 */}
                                  {Object.keys(currentTrans).filter(lang => {
                                    const refVal = (ref.translations[lang] || '').trim();
                                    const curVal = (currentTrans[lang] || '').trim();
                                    return curVal && !refVal;
                                  }).map(lang => (
                                    <div key={lang} style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{lang}:</span>
                                      <span style={{ display: 'flex', gap: '0.3rem', alignItems: 'baseline' }}>
                                        <span style={{ color: 'var(--text-primary)' }}>{currentTrans[lang]}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>→</span>
                                        <span style={{ color: 'var(--red)', fontSize: '0.7rem' }}>（参考缺失）</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
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
        </GlossaModal>
      )}

      {/* Modal 2: Add Modal */}
      {addModalOpen && (
        <GlossaModal
          isOpen={true}
          onClose={() => setAddModalOpen(false)}
          title="新增翻译词条"
          closeDisabled={aiTranslatingSingle}
          footer={<>
            <button onClick={() => setAddModalOpen(false)} className="btn btn-secondary" disabled={aiTranslatingSingle}>取消</button>
            <button onClick={handleSaveAdd} className="btn btn-primary" disabled={aiTranslatingSingle}>保存新增</button>
          </>}
        >
              <div className="edit-grid">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>目标版本 (数据表)</label>
                  <select 
                    value={addTargetTableId} 
                    onChange={(e) => setAddTargetTableId(e.target.value)}
                    className="select-input"
                    style={{ width: '100%' }}
                    disabled={aiTranslatingSingle}
                  >
                    {tables.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>KW 标识 (例如: KW_AVG_CADENCE)</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      value={newTerm.KW} 
                      onChange={(e) => setNewTerm({ ...newTerm, KW: e.target.value })}
                      disabled={aiTranslatingSingle}
                      className="text-input"
                      style={{ flex: 1 }}
                      placeholder="选填，留空将在保存时自动根据中文生成"
                    />
                    <button
                      onClick={async () => {
                        setGeneratingKw(true);
                        try {
                          const generated = await generateKWForText(newTerm.中文);
                          if (generated) {
                            setNewTerm(prev => ({ ...prev, KW: generated }));
                            toast.success('KW 自动生成成功！');
                          }
                        } finally {
                          setGeneratingKw(false);
                        }
                      }}
                      disabled={generatingKw || aiTranslatingSingle}
                      className="btn btn-secondary"
                      title="根据中文语义生成 KW 键名"
                    >
                      {generatingKw ? '生成中...' : '生成 KW'}
                    </button>
                  </div>
                </div>
                
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>CN（中文） (必填)</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      value={newTerm.中文} 
                      onChange={(e) => setNewTerm({ ...newTerm, 中文: e.target.value })}
                      disabled={aiTranslatingSingle}
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
                      {aiTranslatingSingle ? <><Loader2 className="animate-spin" size={14} /> 翻译中...</> : 'AI 预翻译'}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>所在页面</label>
                  <input 
                    type="text" 
                    value={newTerm.所在页面} 
                    onChange={(e) => setNewTerm({ ...newTerm, 所在页面: e.target.value })}
                    disabled={aiTranslatingSingle}
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
                    disabled={aiTranslatingSingle}
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
                      disabled={aiTranslatingSingle}
                      className="text-input"
                    />
                  </div>
                ))}
              </div>
        </GlossaModal>
      )}

      {/* Modal 3: Batch Translate Preview & Status */}
      {batchTranslateOpen && (
        <GlossaModal
          isOpen={true}
          onClose={() => setBatchTranslateOpen(false)}
          title={`Dify 批量智能翻译工作流 (${batchPreviewList.length} 条待翻译)`}
          maxWidth="900px"
          closeDisabled={isTranslatingBatch}
          footer={<>
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
              disabled={isTranslatingBatch || isSavingBatch}
            >
              {isTranslatingBatch ? (
                <><Loader2 size={14} className="animate-spin" /> 正在调用 Dify 翻译...</>
              ) : (
                '开始 Dify 翻译'
              )}
            </button>
            <button
              onClick={handleConfirmBatchWrite}
              className="btn btn-primary"
              disabled={isTranslatingBatch || isSavingBatch || batchPreviewList.every(i => Object.keys(i.translations).length === 0)}
            >
              {isSavingBatch ? (
                <><Loader2 size={14} className="animate-spin" /> 正在保存更新...</>
              ) : (
                <><Check size={14} /> 确认并保存更新</>
              )}
            </button>
          </>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
        </GlossaModal>
      )}
      {/* Modal 4: Batch Add Terms */}
      {batchAddModalOpen && (
        <GlossaModal
          isOpen={true}
          onClose={() => setBatchAddModalOpen(false)}
          title="手动批量新增词条 (最多15条)"
          maxWidth="1000px"
          width="95vw"
          closeDisabled={isTranslatingBatchAdd}
          footer={<>
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
              {isTranslatingBatchAdd ? (
                <><Loader2 size={14} className="animate-spin" /> 正在调用 Dify 翻译...</>
              ) : (
                'AI 批量翻译'
              )}
            </button>
            <button
              onClick={handleConfirmBatchAddWrite}
              className="btn btn-primary"
              disabled={isTranslatingBatchAdd}
            >
              确认批量写入 (仅完成翻译词条)
            </button>
          </>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                      <th style={{ width: '220px' }}>KW 标识 (选填)</th>
                      <th style={{ width: '220px' }}>中文源词 <span style={{ color: 'red' }}>*</span></th>
                      <th style={{ width: '180px' }}>所在页面 (选填)</th>
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
                            placeholder="选填，留空将自动生成"
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
                            placeholder="选填"
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
        </GlossaModal>
      )}

      {/* Modal 3: Batch Update Fields */}
      {batchUpdateOpen && (
        <GlossaModal
          isOpen={true}
          onClose={() => setBatchUpdateOpen(false)}
          title="批量设置分类字段"
          maxWidth="480px"
          footer={<>
            <button onClick={() => setBatchUpdateOpen(false)} className="btn btn-secondary">取消</button>
            <button onClick={handleBatchUpdateFields} className="btn btn-primary">确认修改</button>
          </>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
        </GlossaModal>
      )}

      {/* Modal 4: Batch Copy to Version */}
      {batchCopyOpen && (
        <GlossaModal
          isOpen={true}
          onClose={() => setBatchCopyOpen(false)}
          title="复制词条到其他大表"
          maxWidth="480px"
          footer={<>
            <button onClick={() => setBatchCopyOpen(false)} className="btn btn-secondary">取消</button>
            <button
              onClick={handleBatchCopyVersions}
              disabled={!batchCopyTargetTableId}
              className="btn btn-primary"
            >
              开始复制
            </button>
          </>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
        </GlossaModal>
      )}

      {/* Modal 5: TM Inherit Overlay */}
      {syncInheritOpen && (
        <GlossaModal
          isOpen={true}
          onClose={() => setSyncInheritOpen(false)}
          title="继承/补充其他大表翻译"
          maxWidth="520px"
          footer={<>
            <button onClick={() => setSyncInheritOpen(false)} className="btn btn-secondary" disabled={inheriting}>取消</button>
            <button
              onClick={handleInheritTranslationsSubmit}
              disabled={!syncInheritSourceId || inheriting}
              className="btn btn-primary"
            >
              {inheriting ? '正在执行合并继承...' : '开始继承'}
            </button>
          </>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
        </GlossaModal>
      )}
      {/* Modal 6: Batch Approve Workflow Modal */}
      {batchApproveOpen && (
        <GlossaModal
          isOpen={true}
          onClose={() => setBatchApproveOpen(false)}
          title="批量审核词条状态"
          maxWidth="480px"
          footer={<>
            <button onClick={() => setBatchApproveOpen(false)} className="btn btn-secondary">取消</button>
            <button
              onClick={handleBatchApproveSubmit}
              disabled={batchApproveStatus === 'REJECTED' && !batchApproveRejectReason.trim()}
              className="btn btn-primary"
            >
              确认提交
            </button>
          </>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
        </GlossaModal>
      )}
      {/* Modal 7: CSV 增量导入预览 */}
      {importPreviewOpen && importDiff && (
        <GlossaModal
          isOpen={true}
          onClose={() => { setImportPreviewOpen(false); setImportDiff(null); }}
          title="CSV 导入预览"
          maxWidth="700px"
        >
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', fontSize: '0.85rem', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--green)' }}>新增 {importDiff.added.length} 条</span>
              <span style={{ color: 'var(--yellow)' }}>修改 {importDiff.modified.length} 条</span>
              <span style={{ color: 'var(--text-muted)' }}>无变化 {importDiff.unchanged.length} 条</span>
              {importDiff.removed.length > 0 && <span style={{ color: 'var(--red)' }}>CSV外 {importDiff.removed.length} 条</span>}
            </div>

            {importDiff.added.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ color: 'var(--green)', fontSize: '0.85rem', marginBottom: '0.4rem' }}>新增词条</h4>
                {importDiff.added.map((rec, i) => (
                  <div key={`add-${i}`} style={{ background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: '4px', padding: '0.4rem 0.6rem', marginBottom: '0.3rem', fontSize: '0.8rem' }}>
                    <strong>{rec.kw}</strong> - {rec.fields['CN（中文）'] || ''}
                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', fontSize: '0.7rem' }}>
                      {Object.entries(rec.fields).filter(([k]) => k !== 'KW' && k !== 'CN（中文）').map(([k, v]) => `${k}: ${v}`).join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {importDiff.modified.length > 0 && (
              <div>
                <h4 style={{ color: 'var(--yellow)', fontSize: '0.85rem', marginBottom: '0.4rem' }}>修改词条</h4>
                {importDiff.modified.map((rec, i) => (
                  <div key={`mod-${i}`} style={{ background: 'var(--yellow-bg)', border: '1px solid var(--yellow)', borderRadius: '4px', padding: '0.4rem 0.6rem', marginBottom: '0.3rem', fontSize: '0.8rem' }}>
                    <strong>{rec.kw}</strong>
                    {Object.entries(rec.changes).map(([field, { old, new: newVal }]) => (
                      <div key={field} style={{ marginLeft: '0.5rem', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{field}:</span>{' '}
                        <span style={{ color: 'var(--red)', textDecoration: 'line-through' }}>{old || '（空）'}</span>{' '}
                        <span style={{ color: 'var(--text-muted)' }}>→</span>{' '}
                        <span style={{ color: 'var(--green)', fontWeight: 500 }}>{newVal || '（空）'}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
            <button onClick={() => { setImportPreviewOpen(false); setImportDiff(null); }} className="btn btn-secondary">取消</button>
            <button onClick={handleConfirmImport} className="btn btn-primary">确认导入 ({importDiff.added.length + importDiff.modified.length} 条)</button>
          </div>
        </GlossaModal>
      )}
    </div>
  );
}
