import React, { useState, useEffect } from 'react';
import { useToast } from './Toast';
import { Plus, Trash2, FileText, LayoutGrid, AlertOctagon, ArrowRight, Clock, User, Edit2 } from 'lucide-react';
import { apiFetch } from '../utils/api';
import GlossaModal from './GlossaModal';

export default function VersionsTab({ onNavigate, projectRole }) {
  const toast = useToast();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // New table modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [baseVersionId, setBaseVersionId] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit table modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [editVersionName, setEditVersionName] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchTables = async () => {
    try {
      const res = await apiFetch('/api/tables');
      if (!res.ok) throw new Error('加载数据表列表失败');
      const data = await res.json();
      setTables(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  // Progress bar state
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');

  const handleAddTable = async (e) => {
    e.preventDefault();
    if (!newVersionName.trim()) {
      toast.error('请输入数据表名称！');
      return;
    }

    setAdding(true);
    setProgressPercent(5);
    setProgressStatus('正在创建固件版本记录...');

    try {
      const res = await apiFetch('/api/projects/proj-default/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionName: newVersionName.trim(),
          baseVersionId: baseVersionId || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(`创建失败: ${data.error || '未知错误'}`);
        setAdding(false);
        return;
      }

      const { id: versionId, totalTerms } = data;

      if (baseVersionId && totalTerms > 0) {
        let currentProcessed = 0;
        const CHUNK_SIZE = 100;

        for (let offset = 0; offset < totalTerms; offset += CHUNK_SIZE) {
          const currentCount = Math.min(offset, totalTerms);
          const percent = Math.min(95, Math.round(5 + (currentCount / totalTerms) * 90));
          setProgressPercent(percent);
          setProgressStatus(`正在分批克隆词条与翻译数据 (${currentCount}/${totalTerms})...`);

          const chunkRes = await apiFetch(`/api/projects/proj-default/versions/${versionId}/inherit-chunk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              baseVersionId,
              offset,
              limit: CHUNK_SIZE
            })
          });

          const chunkData = await chunkRes.json();
          if (!chunkRes.ok) {
            throw new Error(chunkData.error || '分批继承中断');
          }

          currentProcessed += chunkData.processed || 0;
          if (chunkData.processed === 0) break;
        }

        setProgressPercent(100);
        setProgressStatus('继承完成！');
        toast.success(`成功创建数据表，并顺利继承 ${totalTerms} 条历史词条与翻译！`);
      } else {
        setProgressPercent(100);
        toast.success('成功创建空白固件数据表！');
      }

      setTimeout(() => {
        setNewVersionName('');
        setBaseVersionId('');
        setAddModalOpen(false);
        setAdding(false);
        setProgressPercent(0);
        setProgressStatus('');
        fetchTables();
      }, 500);

    } catch (err) {
      toast.error(`过程出错: ${err.message}`);
      setAdding(false);
      setProgressPercent(0);
      setProgressStatus('');
    }
  };

  const handleEditTable = async (e) => {
    e.preventDefault();
    if (!editVersionName.trim()) {
      toast.error('请输入数据表名称！');
      return;
    }

    setUpdating(true);
    try {
      const res = await apiFetch(`/api/projects/proj-default/versions/${editingTable.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionName: editVersionName.trim()
        })
      });

      const data = await res.json();
      if (res.ok) {
        setEditVersionName('');
        setEditingTable(null);
        setEditModalOpen(false);
        fetchTables();
      } else {
        toast.error(`修改失败: ${data.error || '未知错误'}`);
      }
    } catch (err) {
      toast.error(`网络错误: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteTable = async (table, e) => {
    e.stopPropagation();
    const confirmDelete = window.confirm(
      `🚨🚨 极端危险警告!!! 🚨🚨\n\n您正在准备永久删除数据表 [${table.name}]。\n该操作将立即清空该表下所有词条的键名(Key)以及全部目标语种翻译！\n并且系统内的日志中与此相关的统计也会受到影响！\n\n您确实要执行此彻底清空删除操作吗？`
    );
    if (!confirmDelete) return;

    const doubleCheck = window.confirm(
      `再次确认：请输入“确认删除”以最终执行对 [${table.name}] 的彻底删除：`
    );
    if (!doubleCheck) return;

    try {
      const res = await apiFetch(`/api/projects/proj-default/versions/${table.id}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || '数据表删除成功！');
        fetchTables();
      } else {
        toast.error(`删除失败: ${data.error || '未知错误'}`);
      }
    } catch (err) {
      toast.error(`网络错误: ${err.message}`);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex-center" style={{ height: '60vh', flexDirection: 'column', gap: '1rem' }}>
        <div className="spinner"></div>
        <span style={{ color: 'var(--text-secondary)' }}>正在载入数据表列表...</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      {/* Header */}
      <div className="tab-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.02em' }}>数据表管理</h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>创建、删除与维护词条大表的生命周期，可一键跳转查看和编辑翻译详情。</p>
        </div>
        {projectRole !== 'viewer' && (
          <button className="btn btn-primary" onClick={() => setAddModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={16} />
            新建数据表
          </button>
        )}
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--red)', borderRadius: '6px', padding: '1rem', color: 'var(--red)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <AlertOctagon size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Table Container */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '1rem' }}>数据表名称 / 固件版本</th>
                <th style={{ padding: '1rem' }}>创建时间</th>
                <th style={{ padding: '1rem' }}>最近修改时间</th>
                <th style={{ padding: '1rem' }}>创建人</th>
                <th style={{ padding: '1rem', width: '220px', textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((table) => (
                <tr key={table.id} style={{ borderBottom: '1px solid var(--border-color)' }} className="table-row-hover">
                  <td style={{ padding: '1rem', fontWeight: '600', color: 'var(--text-primary)', maxWidth: '300px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <FileText size={15} style={{ color: 'var(--accent)', opacity: 0.8, flexShrink: 0 }} />
                      <span className="truncate" title={table.name}>{table.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{formatDate(table.created_at)}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                      <span>{formatDate(table.last_modified)}</span>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', color: 'var(--text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <User size={12} style={{ color: 'var(--text-muted)' }} />
                      <span>{table.creator_name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', alignItems: 'center' }}>
                      <button 
                        onClick={() => onNavigate('translate', table.id)}
                        className="btn btn-secondary"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.25rem', height: '28px' }}
                      >
                        <span>查看详情</span>
                        <ArrowRight size={12} />
                      </button>
                      {projectRole === 'owner' && (
                        <>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTable(table);
                              setEditVersionName(table.name);
                              setEditModalOpen(true);
                            }}
                            className="icon-btn" 
                            style={{ color: 'var(--text-secondary)', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}
                            title="修改数据表名称"
                            aria-label="修改数据表名称"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={(e) => handleDeleteTable(table, e)}
                            className="icon-btn" 
                            style={{ color: 'var(--red)', padding: '0.4rem', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.2)', backgroundColor: 'rgba(239, 68, 68, 0.05)' }}
                            title="删除此固件大表"
                            aria-label="删除此固件大表"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {tables.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                    <LayoutGrid size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>暂无任何数据表，请点击右上角新建数据表开始。</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      <GlossaModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        variant="simple"
        width="400px"
      >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', fontWeight: '600' }}>新建固件数据表</h3>
            <form onSubmit={handleAddTable}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>数据表名称 / 固件版本号</label>
                <input
                  type="text"
                  value={newVersionName}
                  onChange={(e) => setNewVersionName(e.target.value)}
                  placeholder="例如: C406 Pro v2.1"
                  autoFocus
                  required
                  style={{ width: '100%', padding: '0.62rem', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>继承翻译数据自 (基准大表/可选)</label>
                <select
                  value={baseVersionId}
                  onChange={(e) => setBaseVersionId(e.target.value)}
                  style={{ width: '100%', padding: '0.62rem', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  <option value="">-- 全空创建 (不继承词条与翻译) --</option>
                  {tables.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>* 选择一个大表，新表在创建后会秒级自动克隆其全部历史词条和翻译数据。</p>
              </div>

              {adding && (
                <div style={{ marginBottom: '1.25rem', padding: '0.85rem 1rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.82rem' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{progressStatus}</span>
                    <span style={{ color: '#3b82f6', fontWeight: '700' }}>{progressPercent}%</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${progressPercent}%`,
                        height: '100%',
                        backgroundColor: '#3b82f6',
                        borderRadius: '4px',
                        transition: 'width 0.25s ease-in-out'
                      }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" disabled={adding} onClick={() => setAddModalOpen(false)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
                  取消
                </button>
                <button type="submit" disabled={adding} className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>
                  {adding ? '正在处理...' : '确认创建'}
                </button>
              </div>
            </form>
      </GlossaModal>

      {/* Edit Modal */}
      <GlossaModal
        isOpen={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditingTable(null); }}
        variant="simple"
        width="400px"
      >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', fontWeight: '600' }}>修改固件数据表名称</h3>
            <form onSubmit={handleEditTable}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>数据表名称 / 固件版本号</label>
                <input
                  type="text"
                  value={editVersionName}
                  onChange={(e) => setEditVersionName(e.target.value)}
                  placeholder="例如: C406 Pro v2.1"
                  autoFocus
                  required
                  style={{ width: '100%', padding: '0.62rem', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => { setEditModalOpen(false); setEditingTable(null); }} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
                  取消
                </button>
                <button type="submit" disabled={updating} className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>
                  {updating ? '正在保存...' : '保存修改'}
                </button>
              </div>
            </form>
      </GlossaModal>
    </div>
  );
}
