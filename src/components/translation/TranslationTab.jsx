import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { apiFetch, safeGetLocalStorage } from '../../utils/api';
import { useToast } from '../Toast';
import HistoryModal from './HistoryModal';

function findTranslationForLang(result, targetLang) {
  if (!result || typeof result !== 'object') return undefined;
  if (result[targetLang] !== undefined) return result[targetLang];
  
  const codeMatch = targetLang.match(/^([A-Z]+)/i);
  const code = codeMatch ? codeMatch[1].toUpperCase() : '';
  const nameClean = targetLang.replace(/^[A-Z]+\s*[\（\(]?/i, '')
                              .replace(/[\）\)]?$/g, '')
                              .replace(/语|文/g, '')
                              .trim();

  for (const [k, v] of Object.entries(result)) {
    if (v === undefined || v === null || String(v).trim() === '') continue;
    const kUpper = k.toUpperCase().trim();
    const kClean = k.replace(/[\（\(\）\)]/g, '').replace(/语|文/g, '').trim();

    if (code && (kUpper === code || kUpper.startsWith(code + '_') || kUpper.startsWith(code + '-'))) {
      return v;
    }
    if (nameClean && (kClean.includes(nameClean) || nameClean.includes(kClean))) {
      return v;
    }
  }
  return undefined;
}
import { BatchCategoryModal, BatchCopyModal, BatchApproveModal } from './BatchActionsModal';
import BatchTranslateModal from './BatchTranslateModal';
import TranslationToolbar from './TranslationToolbar';
import CSVImportHandler from './CSVImportHandler';
import AddTermModal from './AddTermModal';
import BatchAddModal from './BatchAddModal';
import TranslationTable from './TranslationTable';

const DEFAULT_TARGET_LANGUAGES = [
  'EN（英文）', 'FR（法）', 'DE（德）', 'ES（西班牙）', 'IT（意大利）', 'PT（葡萄牙）', 
  'KO（韩）', 'JP（日）', 'RU（俄罗斯）', 'PL（波兰）', 'TC（繁）', 'DA（丹麦）', 
  'CZ(捷克)', '瑞典', '挪威', '荷兰'
];

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

  useEffect(() => {
    setModifiedCells({});
  }, [selectedTableId]);

  // Column Visibility States
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
  const [snapshots, setSnapshots] = useState([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [rollingBackId, setRollingBackId] = useState('');

  const currentUser = useMemo(() => safeGetLocalStorage('user', null), []);

  const handleOpenBatchTranslate = async () => {
    let targetRecords = records;
    if (selectedRecordIds.size > 0) {
      targetRecords = records.filter(r => selectedRecordIds.has(r.recordId || r.id));
    }

    const itemsToTranslate = targetRecords.map(r => {
      const fields = r.fields || {};
      const missingLangs = TARGET_LANGUAGES.filter(lang => !fields[lang]);
      if (missingLangs.length === 0) return null;
      return {
        recordId: r.recordId || r.id,
        KW: fields['KW'] || '',
        '中文': fields['CN（中文）'] || '',
        '所在页面': fields['所在页面'] || '',
        missingLangs,
        translations: {}
      };
    }).filter(Boolean);

    if (itemsToTranslate.length === 0) {
      toast.info(selectedRecordIds.size > 0 ? '选中的词条都已完成翻译，无需重新翻译' : '当前表格中没有未翻译的词条');
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
        const inputs = {
          KW: item.KW,
          text: item['中文'],
          context: item['所在页面'] || '无',
          target_languages: TARGET_LANGUAGES.join(',')
        };

        const res = await apiFetch(`/api/projects/proj-default/ai-translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs })
        });
        
        if (!res.ok) {
           const error = await res.json();
           throw new Error(error.error || '翻译接口失败');
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
        
        item.translations = trans;
        setBatchPreviewList([...updatedList]);
      } catch (err) {
        console.error(`翻译词条 ${item.KW} 失败:`, err);
        toast.error(`翻译词条 ${item.KW || item['中文']} 失败: ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setIsTranslatingBatch(false);
    setBatchProgress(prev => ({ ...prev, status: '批量翻译完成！请检查预览内容并确认写入。' }));
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
        return {
          recordId: id,
          fields: {
             ...(existingRec ? existingRec.fields : {}),
             ...newFields
          }
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
  }, [currentPage, pageSize, debouncedSearchQuery, filterStatus, filterUntranslated, toast, TARGET_LANGUAGES, setModifiedCells]);

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

  // We removed client-side filtering because it's now handled by the server
  const filteredRecords = records;
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

  const handleBatchUpdateCategorySubmit = async () => {
    if (selectedRecordIds.size === 0) return;
    const termIds = Array.from(selectedRecordIds);
    try {
      setLoading(true);
      const res = await apiFetch('/api/terms/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termIds,
          context: batchUpdateFields.context || undefined,
          owner: batchUpdateFields.owner || undefined
        })
      });
      if (res.ok) {
        toast.success(`已为 ${termIds.length} 条词条成功设置属性！`);
        setBatchUpdateOpen(false);
        setSelectedRecordIds(new Set());
        loadTableData(selectedTableId);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(`设置分类失败: ${data.error || '未知错误'}`);
      }
    } catch (err) {
      toast.error(`设置分类失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchCopySubmit = async () => {
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
        toast.success(data.message || `已将 ${termIds.length} 条记录复制到目标大表！`);
        setBatchCopyOpen(false);
        setSelectedRecordIds(new Set());
      }
    } catch {
      toast.error('复制失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExportXLS = async () => {
    try {
      const res = await apiFetch(`/api/tables/${selectedTableId}/export-xls`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GlossaHub_${selectedTableId}_Export.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success('导出 Excel 文件成功！');
      }
    } catch {
      toast.error('导出 Excel 失败');
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <TranslationToolbar
        tables={tables}
        selectedTableId={selectedTableId}
        setSelectedTableId={setSelectedTableId}
        totalRecords={totalRecords}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        filterUntranslated={filterUntranslated}
        setFilterUntranslated={setFilterUntranslated}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        colDropdownOpen={colDropdownOpen}
        setColDropdownOpen={setColDropdownOpen}
        targetLanguages={TARGET_LANGUAGES}
        visibleLanguages={visibleLanguages}
        setVisibleLanguages={setVisibleLanguages}
        selectedCount={selectedRecordIds.size}
        onClearSelection={() => setSelectedRecordIds(new Set())}
        onBatchTranslate={handleOpenBatchTranslate}
        onBatchApprove={() => setBatchApproveOpen(true)}
        onBatchCategory={() => setBatchUpdateOpen(true)}
        onBatchCopy={() => setBatchCopyOpen(true)}
        onBatchLock={() => {
          Array.from(selectedRecordIds).forEach(id => handleToggleRowLock(id, false));
        }}
        onBatchUnlock={() => {
          Array.from(selectedRecordIds).forEach(id => handleToggleRowLock(id, true));
        }}
        onExportXLS={handleExportXLS}
                csvImportNode={
          <CSVImportHandler 
            selectedTableId={selectedTableId}
            currentRecords={records}
            targetLanguages={TARGET_LANGUAGES}
            onImportComplete={() => loadTableData(selectedTableId)}
            disabled={loading}
          />
        }
        onAddTerm={() => setAddModalOpen(true)}
        onBatchAdd={() => setBatchAddModalOpen(true)}


        onDataClean={handleDataClean}
        onClearHighlights={() => setModifiedCells({})}
        modifiedCount={Object.keys(modifiedCells).length}
        loading={loading}
        projectRole={projectRole}
        difyConfigured={difyConfigured}
      />

      <TranslationTable
        loading={loading}
        records={filteredRecords}
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
        onEditClick={(rec) => setEditModalRecord(rec)}
      />

      {/* Subcomponent Modals */}
      <AddTermModal
        open={_addModalOpen}
        onClose={() => setAddModalOpen(false)}
        selectedTableId={selectedTableId}
        targetLanguages={TARGET_LANGUAGES}
        onAddSuccess={() => loadTableData(selectedTableId)}
      />

      <BatchAddModal
        open={batchAddModalOpen}
        onClose={() => setBatchAddModalOpen(false)}
        selectedTableId={selectedTableId}
        onAddSuccess={() => loadTableData(selectedTableId)}
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
