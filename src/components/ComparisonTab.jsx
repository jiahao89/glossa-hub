import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useToast } from './Toast';
import { parseCSV } from '../utils/csvHelper';
import { Search, Loader2, ArrowLeftRight, FileInput, AlertCircle, HelpCircle } from 'lucide-react';
import { apiFetch } from '../utils/api';

const DEFAULT_TARGET_LANGUAGES = [
  'EN（英文）', 'FR（法）', 'DE（德）', 'ES（西班牙）', 'IT（意大利）', 'PT（葡萄牙）', 
  'KO（韩）', 'JP（日）', 'RU（俄罗斯）', 'PL（波兰）', 'TC（繁）', 'DA（丹麦）', 
  'CZ(捷克)', '瑞典', '挪威', '荷兰'
];

const normalizeText = (text) => {
  if (!text) return '';
  return text
    .toString()
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Normalize various spaces to standard spaces
    .replace(/[\u00a0\u200b\u202f\u200a\u2002\u2003]/g, ' ')
    // Normalize horizontal ellipsis (U+2026) to three periods
    .replace(/\u2026/g, '...')
    // Normalize curly quotes to straight quotes
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
};

export default function ComparisonTab() {
  const toast = useToast();
  const [targetLanguagesList, setTargetLanguagesList] = useState(DEFAULT_TARGET_LANGUAGES);
  const TARGET_LANGUAGES = targetLanguagesList;

  const [sourceRecordsState, setSourceRecordsState] = useState([]);
  const [selectedIndexes, setSelectedIndexes] = useState(new Set());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    async function loadProjLanguages() {
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
    }
    loadProjLanguages();
  }, []);

  const [tables, setTables] = useState([]); // [{ id, name }]
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Selector States
  const [sourceTableId, setSourceTableId] = useState(''); // Version A
  const [targetTableId, setTargetTableId] = useState(''); // Version B

  // CSV Fallback uploader state (for Table A)
  const [fallbackCsvData, setFallbackCsvData] = useState(null); // [{ KW, 中文, 所在页面, translations: {} }]
  const [fallbackFileName, setFallbackFileName] = useState('');
  const fileInputRef = useRef(null);

  // Compared Result state
  const [comparisonResults, setComparisonResults] = useState([]); 
  // [{ KW, 中文, 所在页面, status: 'added' | 'modified' | 'deleted' | 'unchanged', changes: { lang: { old, new } } }]
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'added' | 'modified' | 'deleted' | 'unchanged'

  // Load Version Tables from database API
  useEffect(() => {
    async function loadVersionTables() {
      try {
        setLoading(true);
        setErrorMsg(null);
        const res = await apiFetch('/api/tables');
        if (res.ok) {
          const syncedTables = await res.json();
          setTables(syncedTables);
          
          if (syncedTables.length > 0) {
            // Default Target Table to the latest version (first in list due to DESC order)
            setTargetTableId(syncedTables[0].id);
            // Default Source Table to the predecessor version (second in list)
            if (syncedTables.length > 1) {
              setSourceTableId(syncedTables[1].id);
            } else {
              setSourceTableId(syncedTables[0].id);
            }
          }
        } else {
          setErrorMsg('加载数据表列表失败');
        }
      } catch (err) {
        console.warn('⚠️ 跨版本比对加载数据表失败:', err.message);
        setErrorMsg('加载数据表失败，请检查网络或后端服务。');
      } finally {
        setLoading(false);
      }
    }
    loadVersionTables();
  }, []);

  // Safe fetch helper for records
  const fetchRecordsFromTable = async (tableId) => {
    if (!tableId) return [];
    try {
      const res = await apiFetch(`/api/tables/${tableId}/records`);
      if (!res.ok) throw new Error('无法读取数据表内容');
      const dbRecords = await res.json();
      return dbRecords.map(r => {
        const trans = {};
        TARGET_LANGUAGES.forEach(lang => {
          trans[lang] = r.fields[lang] || '';
        });
        return {
          KW: r.fields.KW || '',
          中文: r.fields['CN（中文）'] || r.fields.中文 || '',
          所在页面: r.fields.所在页面 || '',
          translations: trans
        };
      });
    } catch (err) {
      console.error('加载大表词条记录失败:', err);
      throw err;
    }
  };

  // Trigger CSV upload fallback
  const handleTriggerCsvFallback = () => {
    fileInputRef.current.click();
  };

  const handleCsvSelected = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFallbackFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const parsed = parseCSV(text);
        if (parsed.length < 2) {
          toast.error('CSV 结构不合规，缺少表头或数据行');
          return;
        }

        const headers = parsed[0].map(h => h.trim());
        const rows = parsed.slice(1);

        const kwIdx = headers.findIndex(h => h === 'KW');
        const zhIdx = headers.findIndex(h => h === 'CN（中文）' || h === '中文');
        const pageIdx = headers.findIndex(h => h === '所在页面' || h === '词条所在界面（注意是界面不是模块！！）');

        if (kwIdx === -1 || zhIdx === -1) {
          toast.error('CSV 必须包含 "KW" 和 "CN（中文）" 列！');
          return;
        }

        const formatted = rows.map(row => {
          const kw = row[kwIdx]?.trim();
          const zh = row[zhIdx]?.trim();
          if (!kw) return null;

          const translations = {};
          TARGET_LANGUAGES.forEach(lang => {
            const csvLangIdx = headers.findIndex(h => h === lang);
            translations[lang] = csvLangIdx !== -1 ? row[csvLangIdx]?.trim() || '' : '';
          });

          return {
            KW: kw,
            中文: zh,
            所在页面: pageIdx !== -1 ? row[pageIdx]?.trim() || '' : '',
            translations
          };
        }).filter(item => item !== null);

        setFallbackCsvData(formatted);
        // Clear selected Bitable table id to indicate fallback is active
        setSourceTableId('');
        setErrorMsg(null);
      } catch (err) {
        toast.error(`加载 CSV 失败: ${err.message}`);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  // Compare Logic
  const handleCompare = async () => {
    if (!targetTableId) {
      toast.error('请选择目标版本 B (历史基准)！');
      return;
    }
    if (!sourceTableId && !fallbackCsvData) {
      toast.error('请选择源版本 A (比对版本)，或上传本地 CSV 进行比对！');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      // 1. Fetch Source Data (Version A - Comparison Version)
      let sourceRecords = [];
      if (fallbackCsvData) {
        sourceRecords = fallbackCsvData;
      } else {
        sourceRecords = await fetchRecordsFromTable(sourceTableId);
      }

      // 2. Fetch Target Data (Version B - Historical Baseline)
      const targetRecords = await fetchRecordsFromTable(targetTableId);

      // Create maps for efficient comparison using priority key (KW first, then 中文) + occurrence index
      const getBaseKey = (r) => {
        const kw = (r.KW || '').trim();
        if (kw) return `KW|||${kw}`;
        const zh = (r.中文 || '').trim();
        return `ZH|||${zh}`;
      };

      const sourceMap = {};
      const sourceKeyCounts = {};
      sourceRecords.forEach(r => {
        const baseKey = getBaseKey(r);
        sourceKeyCounts[baseKey] = (sourceKeyCounts[baseKey] || 0) + 1;
        const uniqueKey = `${baseKey}|||${sourceKeyCounts[baseKey]}`;
        sourceMap[uniqueKey] = r;
      });

      const targetMap = {};
      const targetKeyCounts = {};
      targetRecords.forEach(r => {
        const baseKey = getBaseKey(r);
        targetKeyCounts[baseKey] = (targetKeyCounts[baseKey] || 0) + 1;
        const uniqueKey = `${baseKey}|||${targetKeyCounts[baseKey]}`;
        targetMap[uniqueKey] = r;
      });

      const compared = [];

      // 3. Scan Source Records A (find Added and Modified in A relative to B)
      const scanSourceKeyCounts = {};
      sourceRecords.forEach(itemA => {
        const baseKey = getBaseKey(itemA);
        scanSourceKeyCounts[baseKey] = (scanSourceKeyCounts[baseKey] || 0) + 1;
        const uniqueKey = `${baseKey}|||${scanSourceKeyCounts[baseKey]}`;
        const itemB = targetMap[uniqueKey];
        
        if (!itemB) {
          // A has it, B doesn't -> Added in A
          compared.push({
            KW: itemA.KW,
            中文: itemA.中文,
            所在页面: itemA.所在页面 || '无',
            status: 'added',
            changes: {}
          });
        } else {
          // Both have it -> Compare translations (Subject A vs Baseline B)
          const changes = {};
          let isModified = false;

          const zhA = normalizeText(itemA.中文);
          const zhB = normalizeText(itemB.中文);
          if (zhA !== zhB) {
            isModified = true;
            changes['CN（中文）'] = { old: zhB, new: zhA };
          }

          const pageA = normalizeText(itemA.所在页面);
          const pageB = normalizeText(itemB.所在页面);
          if (pageA !== pageB) {
            isModified = true;
            changes['所在页面'] = { old: pageB, new: pageA };
          }
          
          TARGET_LANGUAGES.forEach(lang => {
            const valA = normalizeText(itemA.translations[lang]);
            const valB = normalizeText(itemB.translations[lang]);
            
            if (valA !== valB) {
              isModified = true;
              // old is Baseline B, new is Subject A
              changes[lang] = { old: valB, new: valA };
            }
          });

          compared.push({
            KW: itemA.KW,
            中文: itemA.中文,
            所在页面: itemA.所在页面 || '无',
            status: isModified ? 'modified' : 'unchanged',
            changes
          });
        }
      });

      // 4. Scan Target Records B (find Deleted in A relative to B)
      const scanTargetKeyCounts = {};
      targetRecords.forEach(itemB => {
        const baseKey = getBaseKey(itemB);
        scanTargetKeyCounts[baseKey] = (scanTargetKeyCounts[baseKey] || 0) + 1;
        const uniqueKey = `${baseKey}|||${scanTargetKeyCounts[baseKey]}`;
        const itemA = sourceMap[uniqueKey];
        if (!itemA) {
          // B has it, A doesn't -> Deleted in A
          compared.push({
            KW: itemB.KW,
            中文: itemB.中文,
            所在页面: itemB.所在页面 || '无',
            status: 'deleted',
            changes: {}
          });
        }
      });

      setSourceRecordsState(sourceRecords);
      setSelectedIndexes(new Set());
      setComparisonResults(compared);
    } catch (err) {
      setErrorMsg(`计算比对数据失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Clear fallback CSV and restore Bitable selector
  const handleClearFallback = () => {
    setFallbackCsvData(null);
    setFallbackFileName('');
    setSourceRecordsState([]);
    setSelectedIndexes(new Set());
    if (tables.length > 0) {
      setSourceTableId(tables[0].id);
    }
  };

  // Filtered comparison results
  const filteredResults = useMemo(() => {
    return comparisonResults.filter(item => {
      const matchesSearch = 
        item.KW.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.中文.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      if (statusFilter !== 'all') {
        return item.status === statusFilter;
      }
      return true;
    });
  }, [comparisonResults, searchQuery, statusFilter]);

  // Counts for status filters
  const counts = useMemo(() => {
    const countsDict = { added: 0, modified: 0, deleted: 0, unchanged: 0 };
    comparisonResults.forEach(item => {
      if (countsDict[item.status] !== undefined) {
        countsDict[item.status]++;
      }
    });
    return countsDict;
  }, [comparisonResults]);

  // Checkbox helpers
  const toggleSelectRow = (idx) => {
    const next = new Set(selectedIndexes);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelectedIndexes(next);
  };

  const isAllSelected = useMemo(() => {
    const selectable = filteredResults.filter(r => r.status !== 'unchanged');
    if (selectable.length === 0) return false;
    return selectable.every((_, i) => selectedIndexes.has(filteredResults.indexOf(selectable[i])));
  }, [filteredResults, selectedIndexes]);

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIndexes(new Set());
    } else {
      const selectableIndexes = new Set();
      filteredResults.forEach((r, idx) => {
        if (r.status !== 'unchanged') selectableIndexes.add(idx);
      });
      setSelectedIndexes(selectableIndexes);
    }
  };

  // Synchronization executor
  const handleSyncActions = async (indexes) => {
    if (indexes.size === 0) return;

    const actions = [];
    const idxArray = Array.from(indexes);

    for (const idx of idxArray) {
      const item = filteredResults[idx];
      if (!item || item.status === 'unchanged') continue;

      const kw = item.KW;

      if (item.status === 'added' || item.status === 'modified') {
        const srcRec = sourceRecordsState.find(r => r.KW === kw);
        if (srcRec) {
          actions.push({
            type: item.status === 'added' ? 'ADD' : 'MOD',
            kw,
            data: {
              context: srcRec.所在页面,
              owner: '',
              zh_cn: srcRec.中文,
              translations: srcRec.translations
            }
          });
        }
      } else if (item.status === 'deleted') {
        actions.push({
          type: 'DEL',
          kw
        });
      }
    }

    if (actions.length === 0) {
      toast.error('没有需要同步的变动词条！');
      return;
    }

    const targetVerName = tables.find(t => t.id === targetTableId)?.name || '目标版本';
    
    // 统计各类型变更数量
    const addedCount = actions.filter(a => a.type === 'ADD').length;
    const modifiedCount = actions.filter(a => a.type === 'MOD').length;
    const deletedCount = actions.filter(a => a.type === 'DEL').length;

    let summaryDetail = '';
    if (addedCount > 0) summaryDetail += ` - 新增: ${addedCount} 条\n`;
    if (modifiedCount > 0) summaryDetail += ` - 修改: ${modifiedCount} 条\n`;
    if (deletedCount > 0) summaryDetail += ` - 删除: ${deletedCount} 条\n`;

    const confirmMsg = `⚠️ 差异合并确认 ⚠️\n\n即将向目标版本 [${targetVerName}] 一键合并同步以下变动：\n${summaryDetail}\n共计 ${actions.length} 项变更。\n\n此操作将直接写入数据库并自动记录合并日志，是否确认继续同步？`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setSyncing(true);
      const payload = {
        sourceVersionId: sourceTableId || 'csv',
        targetVersionId: targetTableId,
        syncActions: actions
      };

      const res = await apiFetch('/api/versions/sync-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(result.message || '合并同步成功！');
        setSelectedIndexes(new Set());
        await handleCompare(); // Re-trigger compare to refresh diff list
      } else {
        const errorData = await res.json();
        toast.error(`同步失败: ${errorData.error || '服务器未知错误'}`);
      }
    } catch (e) {
      console.error('同步失败:', e);
      toast.error(`网络或后端服务异常，同步失败: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="compare-container">
      {/* Selector Panels */}
      <div className="toolbar" style={{ borderBottom: '1px solid var(--border-color)', padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          
          {/* Source Table (Version A) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>源版本 A (比对版本):</span>
            
            {fallbackCsvData ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-tertiary)', padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--accent)' }} title={fallbackFileName}>
                  📂 {fallbackFileName.length > 15 ? `${fallbackFileName.slice(0, 12)}...` : fallbackFileName}
                </span>
                <button 
                  onClick={handleClearFallback}
                  className="modal-close" 
                  style={{ fontSize: '0.65rem', padding: '0.1rem' }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <select 
                value={sourceTableId}
                onChange={(e) => setSourceTableId(e.target.value)}
                className="select-input"
                style={{ width: '120px' }}
              >
                <option value="">请选择表格...</option>
                {tables.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleCsvSelected} 
              accept=".csv" 
              style={{ display: 'none' }} 
            />
            {!fallbackCsvData && (
              <button 
                onClick={handleTriggerCsvFallback}
                className="btn btn-secondary btn-icon-only"
                style={{ height: '34px', width: '34px' }}
                title="源表被删？上传本地历史版本 CSV 进行比对"
              >
                <FileInput size={14} />
              </button>
            )}
          </div>

          {/* Arrow */}
          <ArrowLeftRight size={18} style={{ color: 'var(--text-muted)' }} />

          {/* Target Table (Version B) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>目标版本 B (历史基准):</span>
            <select 
              value={targetTableId}
              onChange={(e) => setTargetTableId(e.target.value)}
              className="select-input"
              style={{ width: '120px' }}
            >
              <option value="">请选择表格...</option>
              {tables.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Compare Button */}
          <button 
            onClick={handleCompare} 
            disabled={loading}
            className="btn btn-primary"
            style={{ padding: '0.4rem 1.5rem' }}
          >
            {loading ? '正在计算 Diff...' : '执行比对'}
          </button>
        </div>
      </div>



      {/* Errors */}
      {errorMsg && (
        <div style={{ padding: '0.5rem 1.5rem', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="alert-box alert-box-danger">
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search */}
      {comparisonResults.length > 0 && (
        <div className="toolbar" style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)', padding: '0.6rem 1.5rem' }}>
          <div className="toolbar-left" style={{ gap: '0.5rem' }}>
            <button 
              onClick={() => setStatusFilter('all')} 
              className={`tab-btn ${statusFilter === 'all' ? 'active' : ''}`}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem' }}
            >
              全部 ({comparisonResults.length})
            </button>
            <button 
              onClick={() => setStatusFilter('added')} 
              className={`tab-btn ${statusFilter === 'added' ? 'active' : ''}`}
              style={{ 
                fontSize: '0.8rem', 
                padding: '0.3rem 0.8rem', 
                backgroundColor: statusFilter === 'added' ? 'var(--green)' : 'transparent',
                color: statusFilter === 'added' ? 'var(--bg-primary)' : 'var(--green)' 
              }}
            >
              新增 ({counts.added})
            </button>
            <button 
              onClick={() => setStatusFilter('modified')} 
              className={`tab-btn ${statusFilter === 'modified' ? 'active' : ''}`}
              style={{ 
                fontSize: '0.8rem', 
                padding: '0.3rem 0.8rem',
                backgroundColor: statusFilter === 'modified' ? 'var(--yellow)' : 'transparent',
                color: statusFilter === 'modified' ? 'var(--bg-primary)' : 'var(--yellow)'
              }}
            >
              修改 ({counts.modified})
            </button>
            <button 
              onClick={() => setStatusFilter('deleted')} 
              className={`tab-btn ${statusFilter === 'deleted' ? 'active' : ''}`}
              style={{ 
                fontSize: '0.8rem', 
                padding: '0.3rem 0.8rem',
                backgroundColor: statusFilter === 'deleted' ? 'var(--red)' : 'transparent',
                color: statusFilter === 'deleted' ? 'var(--bg-primary)' : 'var(--red)'
              }}
            >
              删除 ({counts.deleted})
            </button>
            <button 
              onClick={() => setStatusFilter('unchanged')} 
              className={`tab-btn ${statusFilter === 'unchanged' ? 'active' : ''}`}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem' }}
            >
              无变化 ({counts.unchanged})
            </button>
          </div>

          <div className="search-wrapper">
            <Search size={14} className="search-icon" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="过滤 KW / 中文..."
              className="text-input search-input"
              style={{ height: '30px', fontSize: '0.8rem' }}
            />
          </div>
        </div>
      )}

      {selectedIndexes.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.5rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            已选中 <strong style={{ color: 'var(--accent)' }}>{selectedIndexes.size}</strong> 项差异条目
          </span>
          <button 
            onClick={() => handleSyncActions(selectedIndexes)} 
            disabled={syncing}
            className="btn btn-primary"
            style={{ padding: '0.35rem 1.2rem', fontSize: '0.8rem' }}
          >
            {syncing ? '正在批量同步...' : '一键同步所选差异到基准表 B'}
          </button>
        </div>
      )}

      {/* Comparison View Grid */}
      <div className="grid-container" style={{ flex: 1 }}>
        {loading ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', gap: '0.8rem' }}>
            <Loader2 className="animate-spin" size={24} color="var(--accent)" />
            <span style={{ color: 'var(--text-secondary)' }}>正在进行跨版本 Diff 比对，请稍候...</span>
          </div>
        ) : comparisonResults.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '0.75rem' }}>
            <HelpCircle size={32} style={{ color: 'var(--border-focus)' }} />
            <span>请配置好“源版本”与“目标版本”，点击“执行比对”计算版本变动。</span>
          </div>
        ) : filteredResults.length === 0 ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            没有符合当前过滤条件的对比记录
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '45px', textAlign: 'center' }}>
                  <input 
                    type="checkbox" 
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th className="sticky-col-1" style={{ width: '150px' }}>KW (Key)</th>
                <th className="sticky-col-2" style={{ width: '180px' }}>中文 (Source)</th>
                <th style={{ width: '100px' }}>变更类型</th>
                <th style={{ width: '120px' }}>所在页面</th>
                <th>对比详细变动内容</th>
                <th style={{ width: '130px', textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map((item, idx) => {
                let rowClass = '';
                let statusTag = null;
                
                if (item.status === 'added') {
                  rowClass = 'diff-row-added';
                  statusTag = <span className="diff-tag diff-tag-added">新增 (ADD)</span>;
                } else if (item.status === 'modified') {
                  rowClass = 'diff-row-modified';
                  statusTag = <span className="diff-tag diff-tag-modified">修改 (MOD)</span>;
                } else if (item.status === 'deleted') {
                  rowClass = 'diff-row-danger';
                  statusTag = <span className="diff-tag" style={{ backgroundColor: 'var(--red)', color: '#fff' }}>删除 (DEL)</span>;
                } else {
                  statusTag = <span className="diff-tag diff-tag-unchanged">无变化</span>;
                }

                const globalIdx = idx;

                return (
                  <tr key={idx} className={rowClass}>
                    <td style={{ textAlign: 'center' }}>
                      {item.status !== 'unchanged' && (
                        <input 
                          type="checkbox" 
                          checked={selectedIndexes.has(globalIdx)}
                          onChange={() => toggleSelectRow(globalIdx)}
                          style={{ cursor: 'pointer' }}
                        />
                      )}
                    </td>
                    <td className="sticky-col-1 mono" title={item.KW}>{item.KW}</td>
                    <td className="sticky-col-2" title={item.中文}>{item.中文}</td>
                    <td>{statusTag}</td>
                    <td title={item.所在页面}>{item.所在页面}</td>
                    <td style={{ whiteSpace: 'normal', maxBreak: 'normal', maxWidth: 'none' }}>
                      {item.status === 'added' && (
                        <span style={{ color: 'var(--green)', fontWeight: '500' }}>新添加的词条，未在 B 版本 (历史基准) 中定义。</span>
                      )}
                      {item.status === 'deleted' && (
                        <span style={{ color: 'var(--red)', textDecoration: 'line-through' }}>已删除的词条，在 B 版本 (历史基准) 中存在，但在 A 版本 (比对版本) 中已删除。</span>
                      )}
                      {item.status === 'unchanged' && (
                        <span style={{ color: 'var(--text-muted)' }}>所有语种翻译保持一致。</span>
                      )}
                      {item.status === 'modified' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {Object.keys(item.changes).map(lang => (
                            <div key={lang} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                              <span style={{ fontWeight: '600', color: 'var(--text-secondary)', width: '60px' }}>{lang}:</span>
                              <span className="diff-text-old">{item.changes[lang].old || <span className="cell-empty">[空]</span>}</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>➔</span>
                              <span className="diff-text-new">{item.changes[lang].new || <span className="cell-empty">[空]</span>}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {item.status === 'added' && (
                        <button 
                          onClick={() => handleSyncActions(new Set([globalIdx]))} 
                          disabled={syncing}
                          className="btn btn-secondary" 
                          style={{ padding: '0.2rem 0.6rem', fontSize: '0.72rem', borderColor: 'var(--green)', color: 'var(--green)', background: 'transparent' }}
                        >
                          同步至基准
                        </button>
                      )}
                      {item.status === 'modified' && (
                        <button 
                          onClick={() => handleSyncActions(new Set([globalIdx]))} 
                          disabled={syncing}
                          className="btn btn-secondary" 
                          style={{ padding: '0.2rem 0.6rem', fontSize: '0.72rem', borderColor: 'var(--yellow)', color: 'var(--yellow)', background: 'transparent' }}
                        >
                          覆盖基准
                        </button>
                      )}
                      {item.status === 'deleted' && (
                        <button 
                          onClick={() => handleSyncActions(new Set([globalIdx]))} 
                          disabled={syncing}
                          className="btn btn-secondary" 
                          style={{ padding: '0.2rem 0.6rem', fontSize: '0.72rem', borderColor: 'var(--red)', color: 'var(--red)', background: 'transparent' }}
                        >
                          同步删除
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
