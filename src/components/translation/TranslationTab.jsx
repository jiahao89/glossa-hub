import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { apiFetch, safeGetLocalStorage } from '../../utils/api';
import { findTranslationForLang, DEFAULT_TARGET_LANGUAGES } from '../../utils/languageHelper';
import { useToast } from '../Toast';
import HistoryModal from './HistoryModal';
import { BatchCategoryModal, BatchCopyModal, BatchApproveModal } from './BatchActionsModal';
import BatchTranslateModal from './BatchTranslateModal';
import TranslationToolbar from './TranslationToolbar';
import CSVImportHandler from './CSVImportHandler';
import AddTermModal from './AddTermModal';
import BatchAddModal from './BatchAddModal';
import EditTermModal from './EditTermModal';
import InheritModal from './InheritModal';
import TranslationTable from './TranslationTable';

export default function TranslationTab({ 
  difyConnected = false,
  modifiedCells = {},
  setModifiedCells = () => {},
  selectedTableId: propSelectedTableId,
  setSelectedTableId: propSetSelectedTableId,
  projectRole = 'viewer'
}) {
  const toast = useToast();

  const [targetLanguagesList, setTargetLanguagesList] = useState(DEFAULT_TARGET_LANGUAGES);
  const TARGET_LANGUAGES = targetLanguagesList;

  // difyConnected is passed from the parent and used directly in JSX below.

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
  const setSelectedTableId = useCallback((val) => {
    if (propSetSelectedTableId) {
      propSetSelectedTableId(val);
    } else {
      setInternalSelectedTableId(val);
    }
  }, [propSetSelectedTableId]);

  const [_fields, _setFields] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  // State for Batch Add Modal
  const [batchAddModalOpen, setBatchAddModalOpen] = useState(false);
  const [inheritOpen, setInheritOpen] = useState(false);

  useEffect(() => {
    setModifiedCells({});
    // Switching data tables must clear the row-selection set; otherwise
    // a recordId selected in the previous table would silently fail to
    // match anything in the new table, and downstream bulk actions would
    // either report "都已完成翻译" (misleading) or operate on 0 rows.
    setSelectedRecordIds(new Set());
  }, [selectedTableId, setModifiedCells]);

  // Column Visibility States
  // Column dropdown visibility is managed internally by TranslationToolbar.
  const [visibleLanguages, setVisibleLanguages] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1000) {
      return ['EN（英文）'];
    }
    return TARGET_LANGUAGES;
  });

  // Filter/Search State
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const [filterUntranslated, setFilterUntranslated] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Field mappings
  const [fieldMap, setFieldMap] = useState({});
  const [_revFieldMap, setRevFieldMap] = useState({});

  // Modal States
  const [editModalRecord, setEditModalRecord] = useState(null);
  const [_addModalOpen, setAddModalOpen] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState(new Set());
  const [batchTranslateOpen, setBatchTranslateOpen] = useState(false);

  const [batchTargetTableId, setBatchTargetTableId] = useState('');
  const [selectedBatchItemIds, setSelectedBatchItemIds] = useState(new Set());
  const [batchPreviewList, setBatchPreviewList] = useState([]);
  const [isTranslatingBatch, setIsTranslatingBatch] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ total: 0, current: 0, status: '' });

  // Batch Update/Copy/Approve States
  const [batchUpdateOpen, setBatchUpdateOpen] = useState(false);
  const [batchCopyOpen, setBatchCopyOpen] = useState(false);
  const [batchUpdateFields, setBatchUpdateFields] = useState({ context: '', owner: '' });
  const [batchCopyTargetTableId, setBatchCopyTargetTableId] = useState('');
  const [batchCopyDuplicateStrategy, setBatchCopyDuplicateStrategy] = useState('skip');
  const [lockLoadingId, setLockLoadingId] = useState('');
  const [batchApproveOpen, setBatchApproveOpen] = useState(false);
  const [batchApproveStatus, setBatchApproveStatus] = useState('APPROVED');
  const [batchApproveRejectReason, setBatchApproveRejectReason] = useState('');

  // History & Snapshots
  const [snapshotsModalOpen, setSnapshotsModalOpen] = useState(false);
  const [snapshots, _setSnapshots] = useState([]);
  const [loadingSnapshots, _setLoadingSnapshots] = useState(false);
  const [rollingBackId, _setRollingBackId] = useState('');

  const currentUser = useMemo(() => safeGetLocalStorage('user', null), []);

  const handleOpenBatchTranslate = async () => {
    let targetRecords = records;
    if (selectedRecordIds.size > 0) {
      targetRecords = records.filter(r => selectedRecordIds.has(r.recordId || r.id));
    }

    const itemsToTranslate = targetRecords.map(r => {
      const fields = r.fields || {};
      const zhCn = (fields['CN（中文）'] || '').trim();
      if (!zhCn) return null; // Skip terms without Chinese source text
      
      const missingLangs = TARGET_LANGUAGES.filter(lang => !fields[lang] || String(fields[lang]).trim() === '');
      if (missingLangs.length === 0) return null;
      
      return {
        recordId: r.recordId || r.id,
        KW: fields['KW'] || '',
        '中文': zhCn,
        '所在页面': fields['所在页面'] || '',
        missingLangs,
        translations: {}
      };
    }).filter(Boolean);

    if (itemsToTranslate.length === 0) {
      if (selectedRecordIds.size > 0) {
        // 区分两种原因: 选中但过滤后为空 → 跨表选中的脏数据; 真没待翻译条目
        if (targetRecords.length === 0) {
          toast.info('选中的记录不在当前表中, 请重新勾选');
        } else {
          toast.info('选中的词条包含空中文或都已完成翻译');
        }
      } else {
        toast.info('当前表格中没有待翻译的词条');
      }
      return;
    }

    setBatchTargetTableId(selectedTableId);
    setBatchPreviewList(itemsToTranslate);
    setBatchTranslateOpen(true);
    setBatchProgress({ total: itemsToTranslate.length, current: 0, status: '等待开始批量翻译' });
    setSelectedBatchItemIds(new Set(itemsToTranslate.map(i => i.recordId)));
  };

  const handleStartBatchTranslate = async () => {
    setIsTranslatingBatch(true);
    const updatedList = [...batchPreviewList];
    let translatedCount = 0;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < updatedList.length; i++) {
      const item = updatedList[i];
      if (!selectedBatchItemIds.has(item.recordId)) continue;
      
      translatedCount++;
      setBatchProgress({
        total: selectedBatchItemIds.size,
        current: translatedCount,
        status: `正在翻译 (${translatedCount}/${selectedBatchItemIds.size}): ${item.KW || item['中文']}`
      });

      try {
        const targetLangsReq = (item.missingLangs && item.missingLangs.length > 0) 
          ? item.missingLangs.join(',') 
          : TARGET_LANGUAGES.join(',');

        const inputs = {
          KW: item.KW,
          text: item['中文'],
          context: item['所在页面'] || '无',
          target_languages: targetLangsReq
        };

        const res = await apiFetch(`/api/projects/proj-default/ai-translate?debug=1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs })
        });

        if (!res.ok) {
           const error = await res.json();
           // ⭐ 调试模式:把 Dify 真实响应 + 试过的 URL 一起抛出去
           const debugInfo = error.debug
             ? ` | [debug] status=${error.debug.difyStatus} | tried=${error.debug.triedUrls?.join(' → ')} | raw=${error.debug.difyRaw?.slice(0, 200)}`
             : '';
           console.error(`🔍 [batch-translate] Dify error:`, error);
           throw new Error((error.error || '翻译接口失败') + debugInfo);
        }
        
        const result = await res.json();
        
        const trans = {};
        item.missingLangs.forEach(lang => {
          const val = findTranslationForLang(result, lang);
          if (val) trans[lang] = val;
        });
        
        if (result._source === 'tm') {
          item.tmMatch = true;
        }
        
        if (Object.keys(trans).length > 0) {
          item.translations = { ...(item.translations || {}), ...trans };
          successCount++;
        } else {
          errorCount++;
        }
        setBatchPreviewList([...updatedList]);
      } catch (err) {
        errorCount++;
        console.error(`翻译词条 ${item.KW} 失败:`, err);
        toast.error(`翻译词条 ${item.KW || item['中文']} 失败: ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setIsTranslatingBatch(false);
    if (errorCount > 0) {
      setBatchProgress(prev => ({ 
        ...prev, 
        status: `批量翻译完成！${successCount} 条成功` + (errorCount > 0 ? `，${errorCount} 条失败/无输出` : '') + '。请检查预览内容。' 
      }));
    } else {
      setBatchProgress(prev => ({ ...prev, status: '批量翻译全部完成！请检查预览内容并确认写入。' }));
    }
  };

  const handleConfirmBatchWrite = async () => {
    try {
      setIsSavingBatch(true);
      const recordsToUpdate = [];
      
      batchPreviewList.forEach(item => {
        if (!selectedBatchItemIds.has(item.recordId)) return;
        const fields = {};
        let hasNewTrans = false;
        Object.keys(item.translations).forEach(lang => {
          if (item.translations[lang]) {
            fields[lang] = item.translations[lang];
            hasNewTrans = true;
          }
        });
        if (hasNewTrans) {
          recordsToUpdate.push({
            id: item.recordId,
            ...fields
          });
        }
      });

      if (recordsToUpdate.length === 0) {
        setBatchTranslateOpen(false);
        return;
      }

      const updatedForSync = recordsToUpdate.map(r => {
        const { id, ...newFields } = r;
        const existingRec = records.find(rec => (rec.recordId || rec.id) === id);
        const itemInPreview = batchPreviewList.find(i => i.recordId === id);

        const existingMeta = existingRec ? (existingRec.translationsMeta || {}) : {};
        const newMeta = { ...existingMeta };
        if (itemInPreview) {
          Object.keys(itemInPreview.translations || {}).forEach(lang => {
            if (itemInPreview.translations[lang]) {
              newMeta[lang] = itemInPreview.tmMatch ? 'tm' : 'ai';
            }
          });
        }

        return {
          recordId: id,
          fields: {
             ...(existingRec ? existingRec.fields : {}),
             ...newFields
          },
          translationsMeta: newMeta
        };
      });

      const res = await apiFetch(`/api/tables/${batchTargetTableId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ added: [], updated: updatedForSync })
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '写入失败');
      }
      
      toast.success('批量翻译写入成功');
      setModifiedCells(prev => {
        const newModified = { ...prev };
        recordsToUpdate.forEach(r => {
          const itemInPreview = batchPreviewList.find(i => i.recordId === r.id);
          const langs = {};
          if (itemInPreview && itemInPreview.translations) {
            Object.keys(itemInPreview.translations).forEach(l => {
              if (itemInPreview.translations[l]) langs[l] = true;
            });
          }
          newModified[r.id] = { ...(newModified[r.id] || {}), ...langs, isModified: true };
        });
        return newModified;
      });
      setBatchTranslateOpen(false);
      setBatchPreviewList([]);
      loadTableData(batchTargetTableId);
    } catch(err) {
      toast.error(err.message);
    } finally {
      setIsSavingBatch(false);
    }
  };

  const loadTables = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/tables');
      if (res.ok) {
        const data = await res.json();
        setTables(data);
        if (data.length > 0 && !selectedTableId) {
          setSelectedTableId(data[0].id);
        }
      }
    } catch (err) {
      console.error('获取表格列表失败:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedTableId, setSelectedTableId]);

  const [totalRecords, setTotalRecords] = useState(0);

  const loadTableData = useCallback(async (tableId) => {
    if (!tableId) return;
    try {
      setLoading(true);
      
      const queryParams = new URLSearchParams({
        page: currentPage,
        pageSize,
        search: debouncedSearchQuery,
        status: filterStatus,
        untranslated: filterUntranslated ? 'true' : 'false'
      });

      const res = await apiFetch(`/api/tables/${tableId}/records?${queryParams.toString()}`);
      
      if (res.ok) {
        const rData = await res.json();
        setRecords(rData.records || []);
        setTotalRecords(rData.total || 0);
        // REMOVED: setModifiedCells({}) here to avoid pagination clearing

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
      } else {
        toast.error('获取词条数据失败');
      }
    } catch (err) {
      console.error('加载表格数据失败:', err);
      toast.error(`获取词条数据失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearchQuery, filterStatus, filterUntranslated, toast, TARGET_LANGUAGES]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  useEffect(() => {
    if (selectedTableId) {
      loadTableData(selectedTableId);
    }
  }, [selectedTableId, loadTableData]);

  const getRecordValue = useCallback((rec, fieldId) => {
    if (!rec || !rec.fields) return '';
    return rec.fields[fieldId] || '';
  }, []);

  const getRecordValueByName = useCallback((rec, fieldName) => {
    const fId = fieldMap[fieldName];
    if (fId) return getRecordValue(rec, fId);
    return rec?.fields ? rec.fields[fieldName] || '' : '';
  }, [fieldMap, getRecordValue]);

  // We removed client-side filtering because it's now handled by the server.
  // `paginatedRecords` is just an alias kept for use in `handleSelectPage`-style
  // batch-selection helpers and the JSX prop below.
  const paginatedRecords = records;

  // Handlers
  const handleToggleRowLock = async (recId, currentLockState) => {
    const nextState = !currentLockState;
    try {
      setLockLoadingId(recId);
      const res = await apiFetch(`/api/terms/${recId}/lock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLocked: nextState })
      });
      if (res.ok) {
        toast.success(nextState ? '词条已成功锁定' : '词条已解锁');
        setRecords(prev => prev.map(r => r.recordId === recId ? { ...r, isLocked: nextState ? 1 : 0 } : r));
      }
    } catch {
      toast.error('修改锁定状态失败');
    } finally {
      setLockLoadingId('');
    }
  };

  const handleSelectAllOnPage = (checked) => {
    if (checked) {
      const pageIds = paginatedRecords.map(r => r.recordId || r.id);
      setSelectedRecordIds(new Set([...selectedRecordIds, ...pageIds]));
    } else {
      const pageIds = new Set(paginatedRecords.map(r => r.recordId || r.id));
      setSelectedRecordIds(new Set([...selectedRecordIds].filter(id => !pageIds.has(id))));
    }
  };

  const handleToggleSelectRow = (recId, checked) => {
    const next = new Set(selectedRecordIds);
    if (checked) {
      next.add(recId);
    } else {
      next.delete(recId);
    }
    setSelectedRecordIds(next);
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
        toast.success(`成功更新 ${termIds.length} 条词条处理状态为 ${batchApproveStatus}`);
        setBatchApproveOpen(false);
        setSelectedRecordIds(new Set());
        loadTableData(selectedTableId);
      }
    } catch (err) {
      const msg = await err?.json?.().then(d => d?.error).catch(() => null);
      toast.error(`批量审核失败: ${msg || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 批量删除 (走回收站, 30 天可恢复)
  const handleBatchDelete = async () => {
    if (selectedRecordIds.size === 0) return;
    const termIds = Array.from(selectedRecordIds);
    if (!window.confirm(
      `确定要将选中的 ${termIds.length} 条词条送入回收站吗？\n\n` +
      `• 30 天内可在「数据回收站」一键恢复\n` +
      `• 已锁定的词条会被自动跳过\n` +
      `• 此操作会写入「批量删除」审计日志`
    )) {
      return;
    }
    try {
      setLoading(true);
      const res = await apiFetch('/api/terms/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '批量删除失败');
      }
      const data = await res.json();
      const lockedNote = data.lockedSkipped > 0
        ? ` (跳过 ${data.lockedSkipped} 条已锁定词条)`
        : '';
      toast.success(`${data.message || '已删除'}${lockedNote}`);
      setSelectedRecordIds(new Set());
      await loadTableData(selectedTableId);
    } catch (err) {
      toast.error(err.message || '批量删除失败');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchUpdateCategorySubmit = async () => {
    if (selectedRecordIds.size === 0) return;
    try {
      setLoading(true);
      const updates = {};
      if (batchUpdateFields.context) updates['所在页面'] = batchUpdateFields.context;
      if (batchUpdateFields.owner) updates['字号类别'] = batchUpdateFields.owner;

      const res = await apiFetch(`/api/terms/batch-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termIds: Array.from(selectedRecordIds),
          updates
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '批量修改分类失败');
      }

      toast.success('批量更新分类成功！');
      setBatchUpdateOpen(false);
      setBatchUpdateFields({ context: '', owner: '' });
      setSelectedRecordIds(new Set());
      await loadTableData(selectedTableId);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchCopySubmit = async () => {
    if (selectedRecordIds.size === 0 || !batchCopyTargetTableId) return;
    try {
      setLoading(true);
      const res = await apiFetch(`/api/terms/batch-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termIds: Array.from(selectedRecordIds),
          targetVersionId: batchCopyTargetTableId,
          duplicateStrategy: batchCopyDuplicateStrategy
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '复制失败');
      }

      const result = await res.json();
      toast.success(result.message || '复制成功！');
      setBatchCopyOpen(false);
      setSelectedRecordIds(new Set());
      if (batchCopyTargetTableId === selectedTableId) {
        await loadTableData(selectedTableId);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportXLS = async () => {
    if (!selectedTableId) {
      toast.error('请选择需要导出的数据表！');
      return;
    }

    try {
      toast.info('正在导出 Excel 文件...');
      const res = await apiFetch(`/api/tables/${selectedTableId}/export-xls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modifiedCells,
          highlightIds: Object.keys(modifiedCells || {})
        })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const tableName = tables.find(t => t.id === selectedTableId)?.name || selectedTableId;
        a.download = `GlossaHub_${tableName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        toast.success('导出 Excel 文件成功！');
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(`导出失败: ${errData.error || '服务器响应异常'}`);
      }
    } catch (err) {
      console.error('导出异常:', err);
      toast.error(`导出失败: ${err.message}`);
    }
  };

  const handleDataClean = async () => {
    if (!window.confirm('确定要清理当前数据表中的空词条（无KW或无中文）吗？这无法撤销！')) {
      return;
    }
    try {
      setLoading(true);
      const res = await apiFetch(`/api/tables/${selectedTableId}/clean-empty`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '清理失败');
      }
      const data = await res.json();
      toast.success(data.message || '清理完成');
      await loadTableData(selectedTableId);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0.8rem 1.2rem', gap: '0.8rem' }}>
      <TranslationToolbar
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        totalRecords={totalRecords}
        difyConfigured={difyConnected}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        filterUntranslated={filterUntranslated}
        setFilterUntranslated={setFilterUntranslated}
        targetLanguages={TARGET_LANGUAGES}
        visibleLanguages={visibleLanguages}
        setVisibleLanguages={setVisibleLanguages}
        tables={tables}
        selectedTableId={selectedTableId}
        setSelectedTableId={setSelectedTableId}
        selectedCount={selectedRecordIds.size}
        onClearSelection={() => setSelectedRecordIds(new Set())}
        onBatchApprove={() => setBatchApproveOpen(true)}
        onBatchCategory={() => setBatchUpdateOpen(true)}
        onBatchCopy={() => setBatchCopyOpen(true)}
        onBatchLock={() => {
          Array.from(selectedRecordIds).forEach(id => handleToggleRowLock(id, false));
        }}
        onBatchUnlock={() => {
          Array.from(selectedRecordIds).forEach(id => handleToggleRowLock(id, true));
        }}
        onBatchDelete={handleBatchDelete}
        onExportXLS={handleExportXLS}
        csvImportNode={
          <CSVImportHandler 
            selectedTableId={selectedTableId}
            currentRecords={records}
            targetLanguages={TARGET_LANGUAGES}
            onImportComplete={(diff) => {
              if (diff) {
                setModifiedCells(prev => {
                  const next = { ...prev };
                  if (Array.isArray(diff.added)) {
                    diff.added.forEach(item => {
                      if (item.recordId) next[item.recordId] = { isAdded: true };
                    });
                  }
                  if (Array.isArray(diff.updated)) {
                    diff.updated.forEach(item => {
                      if (item.recordId) next[item.recordId] = { isModified: true };
                    });
                  }
                  return next;
                });
              }
              loadTableData(selectedTableId);
            }}
            disabled={loading}
          />
        }
        onAddTerm={() => setAddModalOpen(true)}
        onBatchAdd={() => setBatchAddModalOpen(true)}
        onInherit={() => setInheritOpen(true)}

        onBatchTranslate={handleOpenBatchTranslate}
        onDataClean={handleDataClean}
        onClearHighlights={() => setModifiedCells({})}
        modifiedCount={Object.keys(modifiedCells).length}
        loading={loading}
        projectRole={projectRole}
      />

      <TranslationTable
        loading={loading}
        records={records}
        paginatedRecords={paginatedRecords}
        totalRecords={totalRecords}
        safePage={currentPage}
        pageSize={pageSize}
        setCurrentPage={setCurrentPage}
        setPageSize={setPageSize}
        selectedRecordIds={selectedRecordIds}
        onSelectAll={handleSelectAllOnPage}
        onToggleSelectRow={handleToggleSelectRow}
        targetLanguages={TARGET_LANGUAGES}
        visibleLanguages={visibleLanguages}
        modifiedCells={modifiedCells}
        lockLoadingId={lockLoadingId}
        onToggleRowLock={handleToggleRowLock}
        currentUserRole={currentUser?.role}
        projectRole={projectRole}
        getRecordValueByName={getRecordValueByName}
        getRecordValue={getRecordValue}
        fieldMap={fieldMap}
        onEditClick={(rec) => {
          setEditModalRecord(rec);
          const recId = rec.recordId || rec.id;
          if (recId && modifiedCells[recId]) {
            setModifiedCells(prev => {
              const next = { ...prev };
              delete next[recId];
              return next;
            });
          }
        }}
      />

      {/* Subcomponent Modals */}
      <AddTermModal
        open={_addModalOpen}
        onClose={() => setAddModalOpen(false)}
        selectedTableId={selectedTableId}
        targetLanguages={TARGET_LANGUAGES}
        onAddSuccess={(addedItem) => {
          if (addedItem && addedItem.recordId) {
            setModifiedCells(prev => ({
              ...prev,
              [addedItem.recordId]: { isAdded: true }
            }));
          }
          loadTableData(selectedTableId);
        }}
      />

      <EditTermModal
        open={!!editModalRecord}
        record={editModalRecord}
        projectId="proj-default"
        targetLanguages={TARGET_LANGUAGES}
        fieldMap={fieldMap}
        getRecordValue={getRecordValue}
        currentUserRole={currentUser?.role}
        projectRole={projectRole}
        onClose={() => setEditModalRecord(null)}
        onSaveSuccess={() => loadTableData(selectedTableId)}
      />

      <InheritModal
        open={inheritOpen}
        onClose={() => setInheritOpen(false)}
        currentTableId={selectedTableId}
        tables={tables}
        onSuccess={() => loadTableData(selectedTableId)}
      />

      <BatchAddModal
        open={batchAddModalOpen}
        onClose={() => setBatchAddModalOpen(false)}
        selectedTableId={selectedTableId}
        targetLanguages={TARGET_LANGUAGES}
        onAddSuccess={(addedItems) => {
          if (Array.isArray(addedItems)) {
            setModifiedCells(prev => {
              const next = { ...prev };
              addedItems.forEach(item => {
                if (item.recordId) next[item.recordId] = { isAdded: true };
              });
              return next;
            });
          }
          loadTableData(selectedTableId);
        }}
      />

      <HistoryModal
        open={snapshotsModalOpen}
        onClose={() => setSnapshotsModalOpen(false)}
        snapshots={snapshots}
        loadingSnapshots={loadingSnapshots}
        rollingBackId={rollingBackId}
        currentRecord={editModalRecord}
      />

      <BatchCategoryModal
        open={batchUpdateOpen}
        onClose={() => setBatchUpdateOpen(false)}
        selectedCount={selectedRecordIds.size}
        batchUpdateFields={batchUpdateFields}
        setBatchUpdateFields={setBatchUpdateFields}
        onSubmit={handleBatchUpdateCategorySubmit}
        loading={loading}
      />

      <BatchCopyModal
        open={batchCopyOpen}
        onClose={() => setBatchCopyOpen(false)}
        selectedCount={selectedRecordIds.size}
        tables={tables}
        currentTableId={selectedTableId}
        batchCopyTargetTableId={batchCopyTargetTableId}
        setBatchCopyTargetTableId={setBatchCopyTargetTableId}
        duplicateStrategy={batchCopyDuplicateStrategy}
        setDuplicateStrategy={setBatchCopyDuplicateStrategy}
        onSubmit={handleBatchCopySubmit}
        loading={loading}
      />

      <BatchApproveModal
        open={batchApproveOpen}
        onClose={() => setBatchApproveOpen(false)}
        selectedCount={selectedRecordIds.size}
        status={batchApproveStatus}
        setStatus={setBatchApproveStatus}
        rejectReason={batchApproveRejectReason}
        setRejectReason={setBatchApproveRejectReason}
        onSubmit={handleBatchApproveSubmit}
        loading={loading}
      />

      <BatchTranslateModal
        open={batchTranslateOpen}
        onClose={() => setBatchTranslateOpen(false)}
        tables={tables}
        batchTargetTableId={batchTargetTableId}
        onBatchTargetTableChange={(id) => setBatchTargetTableId(id)}
        batchPreviewList={batchPreviewList}
        selectedBatchItemIds={selectedBatchItemIds}
        setSelectedBatchItemIds={setSelectedBatchItemIds}
        batchProgress={batchProgress}
        isTranslatingBatch={isTranslatingBatch}
        isSavingBatch={isSavingBatch}
        onStartBatchTranslate={handleStartBatchTranslate}
        onConfirmBatchWrite={handleConfirmBatchWrite}
      />
    </div>
  );
}
