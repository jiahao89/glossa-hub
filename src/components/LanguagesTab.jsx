import React, { useState, useEffect } from 'react';
import { useToast } from './Toast';
import EmptyState from './EmptyState';
import { Plus, Edit2, Trash2, ArrowUp, ArrowDown, HelpCircle, Globe, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../utils/api';

export default function LanguagesTab() {
  const toast = useToast();
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add Language modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newLangCode, setNewLangCode] = useState('');
  const [newLangName, setNewLangName] = useState('');
  const [adding, setAdding] = useState(false);

  // Rename Language modal state
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [activeLang, setActiveLang] = useState(null);
  const [newLangNameInput, setNewLangNameInput] = useState('');
  const [renaming, setRenaming] = useState(false);

  const fetchLanguages = async () => {
    try {
      const res = await apiFetch('/api/projects/proj-default/languages');
      if (!res.ok) throw new Error('加载语种失败');
      const data = await res.json();
      setLanguages(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLanguages();
  }, []);

  const handleAddLanguage = async (e) => {
    e.preventDefault();
    if (!newLangCode.trim() || !newLangName.trim()) {
      toast.error('请填写完整的语种代码与名称！');
      return;
    }

    setAdding(true);
    try {
      const res = await apiFetch('/api/projects/proj-default/languages', {
        method: 'POST',
        body: JSON.stringify({
          langCode: newLangCode.trim().toUpperCase(),
          langName: newLangName.trim()
        })
      });

      const data = await res.json();
      if (res.ok) {
        setNewLangCode('');
        setNewLangName('');
        setAddModalOpen(false);
        fetchLanguages();
      } else {
        toast.error(`添加失败: ${data.error}`);
      }
    } catch (err) {
      toast.error(`网络错误: ${err.message}`);
    } finally {
      setAdding(false);
    }
  };

  const handleOpenRename = (lang) => {
    setActiveLang(lang);
    setNewLangNameInput(lang.lang_name);
    setRenameModalOpen(true);
  };

  const handleRenameLanguage = async (e) => {
    e.preventDefault();
    if (!newLangNameInput.trim()) {
      toast.error('重命名显示名称不能为空！');
      return;
    }

    const confirmRename = window.confirm(
      `⚠️ 警告: 重命名 [${activeLang.lang_name}] 为 [${newLangNameInput}] 将会修改所有固件包大表里对应格子的翻译列头，这可能需要一点点迁移时间。\n\n是否确认执行此操作？`
    );
    if (!confirmRename) return;

    setRenaming(true);
    try {
      const res = await apiFetch(`/api/projects/proj-default/languages/${activeLang.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          langName: newLangNameInput.trim()
        })
      });

      const data = await res.json();
      if (res.ok) {
        setRenameModalOpen(false);
        fetchLanguages();
      } else {
        toast.error(`重命名失败: ${data.error}`);
      }
    } catch (err) {
      toast.error(`网络错误: ${err.message}`);
    } finally {
      setRenaming(false);
    }
  };

  const handleDeleteLanguage = async (lang) => {
    const confirmDelete = window.confirm(
      `🚨🚨 极端危险警告!!! 🚨🚨\n\n您正准备删除语种 [${lang.lang_name}]。\n此操作将永久清空该语种在系统内的所有历史词条翻译！且该操作无法撤销！\n\n您确认要执行并删除该语种吗？请在二次核对后操作。`
    );
    if (!confirmDelete) return;

    try {
      const res = await apiFetch(`/api/projects/proj-default/languages/${lang.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok) {
        fetchLanguages();
      } else {
        toast.error(`删除语种失败: ${data.error}`);
      }
    } catch (err) {
      toast.error(`网络错误: ${err.message}`);
    }
  };

  const handleMoveOrder = async (lang, direction) => {
    const currentIndex = languages.findIndex(l => l.id === lang.id);
    if (currentIndex === -1) return;
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= languages.length) return;

    const targetLang = languages[targetIndex];

    try {
      // Swapping orders by PUT api
      await apiFetch(`/api/projects/proj-default/languages/${lang.id}`, {
        method: 'PUT',
        body: JSON.stringify({ displayOrder: targetLang.display_order })
      });

      await apiFetch(`/api/projects/proj-default/languages/${targetLang.id}`, {
        method: 'PUT',
        body: JSON.stringify({ displayOrder: lang.display_order })
      });

      fetchLanguages();
    } catch (err) {
      console.error('排序调整失败:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex-center" style={{ height: '70vh' }}>
        <span>正在加载语种字典...</span>
      </div>
    );
  }

  return (
    <div className="languages-container" style={{ padding: '1.5rem', overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div className="tab-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.4rem', fontWeight: '700' }}>语种字典管理</h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>定义与配置本翻译系统支持的翻译目标语种。顺序将决定智能矩阵及版本比对时的列表呈现顺序。</p>
        </div>
        <button 
          onClick={() => setAddModalOpen(true)}
          className="btn btn-primary"
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
        >
          <Plus size={16} />
          <span>新增目标语种</span>
        </button>
      </div>

      {/* Safety Alert */}
      <div className="alert-box alert-box-warning" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', background: 'var(--yellow-bg)', color: 'var(--yellow)', border: '1px solid rgba(245,158,11,0.2)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
        <AlertTriangle size={24} style={{ flexShrink: 0 }} />
        <div style={{ fontSize: '0.82rem', lineHeight: '1.4' }}>
          <strong>操作安全警告：</strong><br />
          语种字典为全局共享字典。新增语种将直接在所有固件大表中追加一列空翻译；重命名语种将同步迁移并更新数据库中的对应缓存字段名；删除语种则是<strong>毁灭性操作</strong>，将彻底擦除该列所有的已翻译文本数据。请务必谨慎！
        </div>
      </div>

      {/* Language List Table */}
      <div className="table-wrapper" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', height: '40px' }}>
              <th style={{ padding: '0.75rem 1rem', width: '80px' }}>显示顺序</th>
              <th style={{ padding: '0.75rem 1rem', width: '120px' }}>语种代码</th>
              <th style={{ padding: '0.75rem 1rem' }}>语种显示名称 (列头显示值)</th>
              <th style={{ padding: '0.75rem 1rem', width: '180px' }}>创建日期</th>
              <th style={{ padding: '0.75rem 1rem', width: '180px', textAlign: 'center' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {languages.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: '0' }}>
                  <EmptyState
                    icon={Globe}
                    title="当前项目还没有任何语种配置"
                    description="在上方表单中添加第一批语种（如 EN、FR、DE），系统会据此生成翻译表格的列。"
                  />
                </td>
              </tr>
            ) : (
              languages.map((lang, idx) => (
                <tr key={lang.id} style={{ borderBottom: '1px solid var(--border-color)', height: '44px' }}>
                  
                  {/* Order controls */}
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <button 
                        onClick={() => handleMoveOrder(lang, -1)}
                        disabled={idx === 0}
                        className="icon-btn"
                        style={{ padding: '2px', opacity: idx === 0 ? 0.3 : 1 }}
                        title="上移"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button 
                        onClick={() => handleMoveOrder(lang, 1)}
                        disabled={idx === languages.length - 1}
                        className="icon-btn"
                        style={{ padding: '2px', opacity: idx === languages.length - 1 ? 0.3 : 1 }}
                        title="下移"
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  </td>

                  {/* Code */}
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent)', fontWeight: 'bold' }}>
                      {lang.lang_code}
                    </code>
                  </td>

                  {/* Name */}
                  <td style={{ padding: '0.75rem 1rem', fontWeight: '500' }}>
                    {lang.lang_name}
                  </td>

                  {/* Created At */}
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                    {lang.created_at || '-'}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      <button 
                        onClick={() => handleOpenRename(lang)}
                        className="btn btn-secondary" 
                        style={{ height: '26px', padding: '0 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                      >
                        <Edit2 size={11} />
                        <span>重命名</span>
                      </button>
                      
                      <button 
                        onClick={() => handleDeleteLanguage(lang)}
                        className="btn btn-secondary" 
                        style={{ height: '26px', padding: '0 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem', color: 'var(--red)', borderColor: 'rgba(239,68,68,0.2)' }}
                      >
                        <Trash2 size={11} />
                        <span>删除</span>
                      </button>
                    </div>
                  </td>

                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Language Modal */}
      {addModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3>新增语种配置</h3>
              <button onClick={() => setAddModalOpen(false)} className="close-btn">&times;</button>
            </div>
            <form onSubmit={handleAddLanguage}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
                <div className="form-group">
                  <label>语种代码 (如: ES, PT, DE)</label>
                  <input 
                    type="text" 
                    value={newLangCode} 
                    onChange={(e) => setNewLangCode(e.target.value)} 
                    placeholder="大写字母简写"
                    className="text-input"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>语种显示名称 (如: ES（西班牙）)</label>
                  <input 
                    type="text" 
                    value={newLangName} 
                    onChange={(e) => setNewLangName(e.target.value)} 
                    placeholder="在翻译矩阵列头显示的完整文本"
                    className="text-input"
                    required
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setAddModalOpen(false)} className="btn btn-secondary">取消</button>
                <button type="submit" disabled={adding} className="btn btn-primary">
                  {adding ? '正在添加...' : '确认添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Language Modal */}
      {renameModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3>更正语种名称</h3>
              <button onClick={() => setRenameModalOpen(false)} className="close-btn">&times;</button>
            </div>
            <form onSubmit={handleRenameLanguage}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  修改 <strong>{activeLang?.lang_code}</strong> 的中文显示头。此操作将迁移此语种下的全部现有翻译数据列头。
                </p>
                <div className="form-group">
                  <label>新语种显示名称</label>
                  <input 
                    type="text" 
                    value={newLangNameInput} 
                    onChange={(e) => setNewLangNameInput(e.target.value)} 
                    className="text-input"
                    required
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setRenameModalOpen(false)} className="btn btn-secondary">取消</button>
                <button type="submit" disabled={renaming} className="btn btn-primary">
                  {renaming ? '正在更新...' : '保存更改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
