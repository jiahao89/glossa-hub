import React, { useState, useEffect, useMemo, useRef } from 'react';
import { bitable } from '@lark-base-open/js-sdk';
import { parseCSV } from '../utils/csvHelper';
import { Search, Loader2, ArrowLeftRight, FileInput, AlertCircle, HelpCircle } from 'lucide-react';

const TARGET_LANGUAGES = [
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
  const [tables, setTables] = useState([]); // [{ id, name }]
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

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

  // Load Bitable Tables and filter for numeric version tables
  useEffect(() => {
    async function loadVersionTables() {
      try {
        setLoading(true);
        // Create a timeout race to prevent hanging outside Feishu iframe
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('SDK 连接超时，可能未运行在飞书环境中')), 1500)
        );
        const allTables = await Promise.race([
          bitable.base.getTableMetaList(),
          timeoutPromise
        ]);
        
        // Sort version tables by their version number (e.g. "3.2" or "C706码表多语言文案2.1")
        const getVersionNum = (name) => {
          const match = (name || '').match(/\d+(\.\d+)?/);
          return match ? parseFloat(match[0]) : 0;
        };
        const sorted = [...allTables].sort((a, b) => getVersionNum(a.name) - getVersionNum(b.name));
        
        setTables(sorted);
        setIsDemoMode(false);
        
        if (sorted.length > 0) {
          // Default Target Table to the latest version
          setTargetTableId(sorted[sorted.length - 1].id);
          // Default Source Table to the predecessor version
          if (sorted.length > 1) {
            setSourceTableId(sorted[sorted.length - 2].id);
          } else {
            setSourceTableId(sorted[0].id);
          }
        }
      } catch (err) {
        console.warn('⚠️ 跨版本比对加载数据表失败，切换为本地对比模拟模式:', err.message);
        setIsDemoMode(true);
        
        // Try fetching synced tables from SQLite/JSON database
        try {
          const res = await fetch('/api/tables');
          if (res.ok) {
            const syncedTables = await res.json();
            if (syncedTables.length > 0) {
              const mockTables = [
                { id: 'mock_3_1', name: '3.1 (演示)' },
                { id: 'mock_3_2', name: '3.2 (演示)' }
              ];
              const allTables = [...syncedTables, ...mockTables];
              setTables(allTables);
              setSourceTableId('mock_3_1');
              setTargetTableId('mock_3_2');
              setLoading(false);
              return;
            }
          }
        } catch (dbErr) {
          console.warn('⚠️ 无法从本地 SQLite 读取比对表格:', dbErr.message);
        }

        const mockTables = [
          { id: 'mock_3_1', name: '3.1' },
          { id: 'mock_3_2', name: '3.2' }
        ];
        setTables(mockTables);
        setSourceTableId('mock_3_1');
        setTargetTableId('mock_3_2');
      } finally {
        setLoading(false);
      }
    }
    loadVersionTables();
  }, []);

  const getMockVersionRecords = (tableId) => {
    if (tableId === 'mock_3_1') {
      return [
        {
          KW: 'KW_RIDE_LAP_AVG_SP',
          中文: '圈平均速度',
          所在页面: '运动数据页',
          translations: {
            '英文': 'Lap Avg Speed',
            '法语': 'Vitesse moyenne du tour'
          }
        },
        {
          KW: 'KW_RIDE_LAP_AVG_CA',
          中文: '圈平均踏频',
          所在页面: '运动数据页',
          translations: {
            '英文': 'Lap Avg Cadence'
          }
        },
        {
          KW: 'KW_USER_NO_RECORD',
          中文: '暂无记录，使用码表骑行后查看记录',
          所在页面: '历史记录空页面',
          translations: {
            '英文': 'No records. Ride with your bike computer to view history.',
            '法语': 'Aucun enregistrement.'
          }
        }
      ];
    } else if (tableId === 'mock_3_2') {
      return [
        {
          KW: 'KW_RIDE_LAP_AVG_SP',
          中文: '圈平均速度',
          所在页面: '运动数据页',
          translations: {
            '英文': 'Lap Average Speed',
            '法语': 'Vitesse moyenne du tour'
          }
        },
        {
          KW: 'KW_RIDE_LAP_AVG_CA',
          中文: '圈平均踏频',
          所在页面: '运动数据页',
          translations: {
            '英文': 'Lap Avg Cadence',
            '法语': 'Cadence moyenne du tour'
          }
        },
        {
          KW: 'KW_RIDE_ROUTE_REPL',
          中文: '是否替换当前路线？',
          所在页面: '导航路线页',
          translations: {
            '英文': 'Replace current route?'
          }
        }
      ];
    }
    return [];
  };

  // Safe fetch helper for Bitable records
  const fetchRecordsFromTable = async (tableId) => {
    if (tableId.startsWith('mock_')) {
      return getMockVersionRecords(tableId);
    }

    try {
      const table = await bitable.base.getTableById(tableId);
      
      // Load fields mapping
      const fieldMetaList = await table.getFieldMetaList();
      const fieldMap = {};
      fieldMetaList.forEach(f => {
        fieldMap[f.name] = f.id;
      });

      let pageToken = undefined;
      let hasMore = true;
      let allRecords = [];

      while (hasMore) {
        const result = await table.getRecordsByPage({ pageToken, pageSize: 200 });
        allRecords = [...allRecords, ...result.records];
        hasMore = result.hasMore;
        pageToken = result.pageToken;
      }

      // Helper to extract value
      const getValue = (rec, fieldName) => {
        const fId = fieldMap[fieldName];
        if (!fId) return '';
        const cell = rec.fields[fId];
        if (!cell) return '';
        if (Array.isArray(cell)) {
          return cell.map(s => s.text || '').join('');
        }
        if (typeof cell === 'object' && cell.text) return cell.text;
        return String(cell);
      };

      // Format into standard objects
      return allRecords.map(rec => {
        const translations = {};
        TARGET_LANGUAGES.forEach(lang => {
          translations[lang] = getValue(rec, lang);
        });
        return {
          KW: getValue(rec, 'KW')?.trim(),
          中文: getValue(rec, 'CN（中文）')?.trim(),
          所在页面: getValue(rec, '所在页面')?.trim() || getValue(rec, '词条所在界面（注意是界面不是模块！！）')?.trim(),
          translations
        };
      }).filter(item => item.KW);
    } catch (err) {
      console.warn(`⚠️ Bitable 读取失败，尝试从本地 SQLite/JSON 读取数据 (Table: ${tableId}):`, err.message);
      
      const res = await fetch(`/api/tables/${tableId}/records`);
      if (res.ok) {
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
      }
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
          alert('CSV 结构不合规，缺少表头或数据行');
          return;
        }

        const headers = parsed[0].map(h => h.trim());
        const rows = parsed.slice(1);

        const kwIdx = headers.findIndex(h => h === 'KW');
        const zhIdx = headers.findIndex(h => h === 'CN（中文）' || h === '中文');
        const pageIdx = headers.findIndex(h => h === '所在页面' || h === '词条所在界面（注意是界面不是模块！！）');

        if (kwIdx === -1 || zhIdx === -1) {
          alert('CSV 必须包含 "KW" 和 "CN（中文）" 列！');
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
        alert(`加载 CSV 失败: ${err.message}`);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  // Compare Logic
  const handleCompare = async () => {
    if (!targetTableId) {
      alert('请选择目标版本 B (历史基准)！');
      return;
    }
    if (!sourceTableId && !fallbackCsvData) {
      alert('请选择源版本 A (比对版本)，或上传本地 CSV 进行比对！');
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

      // Create maps for efficient comparison using composite key (KW + 所在页面 + 中文) + occurrence index
      const sourceMap = {};
      const sourceKeyCounts = {};
      sourceRecords.forEach(r => {
        const baseKey = `${(r.KW || '').trim()}|||${(r.所在页面 || '').trim()}|||${(r.中文 || '').trim()}`;
        sourceKeyCounts[baseKey] = (sourceKeyCounts[baseKey] || 0) + 1;
        const uniqueKey = `${baseKey}|||${sourceKeyCounts[baseKey]}`;
        sourceMap[uniqueKey] = r;
      });

      const targetMap = {};
      const targetKeyCounts = {};
      targetRecords.forEach(r => {
        const baseKey = `${(r.KW || '').trim()}|||${(r.所在页面 || '').trim()}|||${(r.中文 || '').trim()}`;
        targetKeyCounts[baseKey] = (targetKeyCounts[baseKey] || 0) + 1;
        const uniqueKey = `${baseKey}|||${targetKeyCounts[baseKey]}`;
        targetMap[uniqueKey] = r;
      });

      const compared = [];

      // 3. Scan Source Records A (find Added and Modified in A relative to B)
      const scanSourceKeyCounts = {};
      sourceRecords.forEach(itemA => {
        const baseKey = `${(itemA.KW || '').trim()}|||${(itemA.所在页面 || '').trim()}|||${(itemA.中文 || '').trim()}`;
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
        const baseKey = `${(itemB.KW || '').trim()}|||${(itemB.所在页面 || '').trim()}|||${(itemB.中文 || '').trim()}`;
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

      {/* Demo Mode Notice */}
      {isDemoMode && (
        <div style={{ padding: '0.5rem 1.5rem', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="alert-box alert-box-info" style={{ backgroundColor: 'rgba(235, 94, 40, 0.1)', color: 'var(--accent)', borderColor: 'rgba(235, 94, 40, 0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={16} />
            <span>已启用离线演示比对模式 (读取自 SQLite 同步历史数据或静态模拟数据)</span>
          </div>
        </div>
      )}

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
                <th className="sticky-col-1" style={{ width: '150px' }}>KW (Key)</th>
                <th className="sticky-col-2" style={{ width: '180px' }}>中文 (Source)</th>
                <th style={{ width: '100px' }}>变更类型</th>
                <th style={{ width: '150px' }}>所在页面</th>
                <th>对比详细变动内容</th>
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
                  rowClass = 'diff-row-danger'; // Custom css color block or handled visually
                  statusTag = <span className="diff-tag" style={{ backgroundColor: 'var(--red)', color: '#fff' }}>删除 (DEL)</span>;
                } else {
                  statusTag = <span className="diff-tag diff-tag-unchanged">无变化</span>;
                }

                return (
                  <tr key={idx} className={rowClass}>
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
