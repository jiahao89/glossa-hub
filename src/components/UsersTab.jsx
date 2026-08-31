import React, { useState, useEffect } from 'react';
import { useToast } from './Toast';
import { Plus, Trash2, Edit2, Shield, User, Key, UserCheck, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../utils/api';
import GlossaModal from './GlossaModal';
import EmptyState from './EmptyState';
import { formatDateTime } from '../utils/dateTime';

export default function UsersTab({ _projectRole }) {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  
  // Form states
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    role: 'user'
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/admin/users');
      if (!res.ok) throw new Error('加载用户列表失败');
      const data = await res.json();
      setUsers(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenAdd = () => {
    setFormData({ username: '', password: '', name: '', role: 'user' });
    setAddModalOpen(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      name: user.name,
      role: user.role
    });
    setEditModalOpen(true);
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.password || !formData.name.trim()) {
      toast.error('请填写完整必填信息！');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username.trim(),
          password: formData.password,
          name: formData.name.trim(),
          role: formData.role
        })
      });

      const data = await res.json();
      if (res.ok) {
        setAddModalOpen(false);
        fetchUsers();
        toast.success('新增用户成功！');
      } else {
        toast.error(`创建失败: ${data.error || '未知错误'}`);
      }
    } catch (err) {
      toast.error(`网络错误: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.role) {
      toast.error('姓名和角色不能为空！');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          role: formData.role,
          password: formData.password || undefined
        })
      });

      const data = await res.json();
      if (res.ok) {
        setEditModalOpen(false);
        setEditingUser(null);
        fetchUsers();
        toast.success('更新用户信息成功！');
      } else {
        toast.error(`修改失败: ${data.error || '未知错误'}`);
      }
    } catch (err) {
      toast.error(`网络错误: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (user, e) => {
    e.stopPropagation();
    const confirmDelete = window.confirm(
      `⚠️ 确认永久删除系统用户 [${user.name} (${user.username})]？\n该操作不可恢复。`
    );
    if (!confirmDelete) return;

    try {
      const res = await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || '用户删除成功！');
        fetchUsers();
      } else {
        toast.error(`删除失败: ${data.error || '未知错误'}`);
      }
    } catch (err) {
      toast.error(`网络错误: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex-center" style={{ height: '70vh' }}>
        <span>正在加载用户数据...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-center" style={{ height: '70vh', flexDirection: 'column', gap: '0.75rem' }}>
        <AlertTriangle size={36} style={{ color: 'var(--red)' }} />
        <span style={{ color: 'var(--red)', fontSize: '0.95rem', fontWeight: 600 }}>加载用户列表失败</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{error}</span>
        <button onClick={fetchUsers} className="btn btn-secondary" style={{ marginTop: '0.5rem' }}>
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="users-container" style={{ padding: '1.5rem', overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header */}
      <div className="tab-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={22} style={{ color: 'var(--accent)' }} />
            <span>系统用户管理</span>
          </h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            管理系统协作成员账号、初始密码与权限角色（超级管理员专属）
          </p>
        </div>
        
        <button
          onClick={handleOpenAdd}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px' }}
        >
          <Plus size={16} />
          <span>新建用户</span>
        </button>
      </div>

      {/* Main Table */}
      <div className="table-wrapper" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-secondary)', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', height: '40px' }}>
              <th style={{ padding: '0.75rem 1rem', width: '22%' }}>登录用户名 (Username)</th>
              <th style={{ padding: '0.75rem 1rem', width: '22%' }}>真实姓名 (Name)</th>
              <th style={{ padding: '0.75rem 1rem', width: '18%' }}>系统角色</th>
              <th style={{ padding: '0.75rem 1rem', width: '22%' }}>创建时间</th>
              <th style={{ padding: '0.75rem 1rem', width: '16%', textAlign: 'center' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '0' }}>
                  <EmptyState
                    icon={User}
                    title="暂无用户数据"
                    description="点击右上角「新建用户」添加第一位协作者。"
                  />
                </td>
              </tr>
            ) : (
              users.map(user => (
                <tr 
                  key={user.id} 
                  style={{ borderBottom: '1px solid var(--border-color)', height: '48px', transition: 'background 0.15s' }}
                >
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <User size={14} style={{ color: 'var(--text-muted)' }} />
                      <code style={{ background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: '4px', color: 'var(--accent)', fontWeight: '600', fontSize: '0.82rem' }}>
                        {user.username}
                      </code>
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: '500', color: 'var(--text-primary)' }}>
                    {user.name}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {user.role === 'admin' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                        <Shield size={11} />
                        超级管理员
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                        <UserCheck size={11} />
                        普通用户
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    {formatDateTime(user.created_at)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                      <button
                        onClick={() => handleOpenEdit(user)}
                        className="btn btn-secondary"
                        style={{ height: '28px', padding: '0 0.6rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                        title="编辑用户信息"
                      >
                        <Edit2 size={12} />
                        <span>编辑</span>
                      </button>
                      <button
                        onClick={(e) => handleDeleteUser(user, e)}
                        className="btn btn-secondary"
                        style={{ height: '28px', padding: '0 0.6rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--red)', borderColor: 'rgba(239, 68, 68, 0.25)' }}
                        title="删除系统用户"
                      >
                        <Trash2 size={12} />
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

      {/* Add User Modal */}
      <GlossaModal
        isOpen={addModalOpen}
        onClose={() => !submitting && setAddModalOpen(false)}
        title="新建系统用户"
        maxWidth="500px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', width: '100%' }}>
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              disabled={submitting}
              className="btn btn-secondary"
              style={{ width: '90px' }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleAddUser}
              disabled={submitting}
              className="btn btn-primary"
              style={{ minWidth: '100px' }}
            >
              {submitting ? '保存中...' : '确认新建'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              <User size={14} style={{ color: 'var(--accent)' }} />
              <span>登录账号 (Username)</span>
              <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              type="text"
              required
              className="text-input"
              style={{ width: '100%', height: '36px', fontSize: '0.85rem' }}
              placeholder="请输入英文登录名 (例如: zhangsan)"
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
              disabled={submitting}
            />
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              <UserCheck size={14} style={{ color: 'var(--accent)' }} />
              <span>真实姓名 (Name)</span>
              <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              type="text"
              required
              className="text-input"
              style={{ width: '100%', height: '36px', fontSize: '0.85rem' }}
              placeholder="请输入显示姓名"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              disabled={submitting}
            />
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              <Key size={14} style={{ color: 'var(--accent)' }} />
              <span>初始密码 (Password)</span>
              <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              type="password"
              required
              className="text-input"
              style={{ width: '100%', height: '36px', fontSize: '0.85rem' }}
              placeholder="请输入至少 6 位初始密码"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              disabled={submitting}
            />
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              <Shield size={14} style={{ color: 'var(--accent)' }} />
              <span>系统角色 (Role)</span>
              <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <select
              className="select-input"
              style={{ width: '100%', height: '36px', fontSize: '0.85rem' }}
              value={formData.role}
              onChange={(e) => setFormData({...formData, role: e.target.value})}
              disabled={submitting}
            >
              <option value="user">普通用户 (User)</option>
              <option value="admin">超级管理员 (Admin)</option>
            </select>

            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.75rem', marginTop: '0.6rem', fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
              <Shield size={14} style={{ color: 'var(--yellow)', flexShrink: 0, marginTop: '2px' }} />
              <span><strong>超级管理员</strong>可以管理全站项目并配置用户；<strong>普通用户</strong>权限取决于具体项目内的授权角色（所有者/译员/只读审核）。</span>
            </div>
          </div>
        </form>
      </GlossaModal>

      {/* Edit User Modal */}
      <GlossaModal
        isOpen={editModalOpen}
        onClose={() => !submitting && setEditModalOpen(false)}
        title="编辑用户信息"
        maxWidth="500px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', width: '100%' }}>
            <button
              type="button"
              onClick={() => setEditModalOpen(false)}
              disabled={submitting}
              className="btn btn-secondary"
              style={{ width: '90px' }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleEditUser}
              disabled={submitting}
              className="btn btn-primary"
              style={{ minWidth: '100px' }}
            >
              {submitting ? '保存中...' : '保存更改'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleEditUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              登录账号 (Username)
            </label>
            <input
              type="text"
              disabled
              className="text-input"
              style={{ width: '100%', height: '36px', fontSize: '0.85rem', opacity: 0.6, cursor: 'not-allowed', background: 'var(--bg-tertiary)' }}
              value={formData.username}
            />
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>登录账号为唯一标识，不可更改。</p>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              <span>真实姓名 (Name)</span>
              <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              type="text"
              required
              className="text-input"
              style={{ width: '100%', height: '36px', fontSize: '0.85rem' }}
              placeholder="请输入显示姓名"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              disabled={submitting}
            />
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              <span>系统角色 (Role)</span>
              <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <select
              className="select-input"
              style={{ width: '100%', height: '36px', fontSize: '0.85rem' }}
              value={formData.role}
              onChange={(e) => setFormData({...formData, role: e.target.value})}
              disabled={submitting}
            >
              <option value="user">普通用户 (User)</option>
              <option value="admin">超级管理员 (Admin)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              重置密码 (可选)
            </label>
            <input
              type="password"
              className="text-input"
              style={{ width: '100%', height: '36px', fontSize: '0.85rem' }}
              placeholder="不修改密码请留空"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              disabled={submitting}
            />
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>如需修改该用户密码，请输入新密码；留空则保持原密码不变。</p>
          </div>
        </form>
      </GlossaModal>

    </div>
  );
}
