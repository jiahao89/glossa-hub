import React, { useState, useEffect } from 'react';
import { useToast } from './Toast';
import { Plus, Trash2, User, AlertOctagon, Edit2, Shield } from 'lucide-react';
import { apiFetch } from '../utils/api';
import GlossaModal from './GlossaModal';

export default function UsersTab({ projectRole }) {
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
      const res = await apiFetch('/api/admin/users');
      if (!res.ok) throw new Error('加载用户列表失败');
      const data = await res.json();
      setUsers(data);
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
      `🚨警告：\n您正在准备永久删除系统用户 [${user.name} (${user.username})]。\n这可能会影响该用户创建或修改的日志引用。\n\n确实要删除此用户吗？`
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
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-red-500">
        <AlertOctagon size={48} className="mb-4" />
        <p className="text-xl font-medium">出错了</p>
        <p className="text-sm mt-2">{error}</p>
        <button 
          onClick={fetchUsers}
          className="mt-4 px-4 py-2 bg-slate-800 rounded-lg text-white hover:bg-slate-700"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900/50 p-6 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
            <Shield className="text-purple-400" size={28} />
            用户管理
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            系统级用户管理（超级管理员专属）
          </p>
        </div>
        
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg shadow-lg shadow-primary/20 transition-all font-medium"
        >
          <Plus size={20} />
          新建用户
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden bg-slate-900 border border-slate-800 rounded-xl flex flex-col shadow-xl">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-800/90 backdrop-blur-sm shadow-md z-10">
              <tr>
                <th className="p-4 text-sm font-semibold text-slate-300 w-1/4">用户名</th>
                <th className="p-4 text-sm font-semibold text-slate-300 w-1/4">姓名</th>
                <th className="p-4 text-sm font-semibold text-slate-300 w-1/6">系统角色</th>
                <th className="p-4 text-sm font-semibold text-slate-300 w-1/4">创建时间</th>
                <th className="p-4 text-sm font-semibold text-slate-300 w-[100px] text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    <User size={48} className="mx-auto mb-3 opacity-20" />
                    暂无用户数据
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr 
                    key={user.id} 
                    className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors group"
                  >
                    <td className="p-4 align-middle">
                      <div className="font-medium text-slate-200">{user.username}</div>
                    </td>
                    <td className="p-4 align-middle text-slate-300">
                      {user.name}
                    </td>
                    <td className="p-4 align-middle">
                      {user.role === 'admin' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          超级管理员
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
                          普通用户
                        </span>
                      )}
                    </td>
                    <td className="p-4 align-middle text-slate-400 text-sm">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="p-4 align-middle text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenEdit(user)}
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-md transition-colors tooltip-trigger"
                          title="编辑用户信息"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteUser(user, e)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors tooltip-trigger"
                          title="删除系统用户"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      <GlossaModal
        isOpen={addModalOpen}
        onClose={() => !submitting && setAddModalOpen(false)}
        title="新建系统用户"
        icon={<User className="text-primary" />}
        maxWidth="md"
      >
        <form onSubmit={handleAddUser} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">登录账号 (Username) <span className="text-red-400">*</span></label>
            <input
              type="text"
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-slate-500"
              placeholder="请输入英文登录名"
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">真实姓名 (Name) <span className="text-red-400">*</span></label>
            <input
              type="text"
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-slate-500"
              placeholder="请输入显示姓名"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">初始密码 (Password) <span className="text-red-400">*</span></label>
            <input
              type="password"
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-slate-500"
              placeholder="请输入初始密码"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">系统角色 (Role) <span className="text-red-400">*</span></label>
            <select
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
              value={formData.role}
              onChange={(e) => setFormData({...formData, role: e.target.value})}
              disabled={submitting}
            >
              <option value="user">普通用户 (User)</option>
              <option value="admin">超级管理员 (Admin)</option>
            </select>
            <p className="text-xs text-slate-500 mt-2">注：超级管理员可以管理全站项目并配置用户；普通用户权限取决于具体项目的授权。</p>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              disabled={submitting}
              className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              {submitting ? '保存中...' : '确认新建'}
            </button>
          </div>
        </form>
      </GlossaModal>

      {/* Edit User Modal */}
      <GlossaModal
        isOpen={editModalOpen}
        onClose={() => !submitting && setEditModalOpen(false)}
        title="编辑用户信息"
        icon={<Edit2 className="text-blue-400" />}
        maxWidth="md"
      >
        <form onSubmit={handleEditUser} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">登录账号</label>
            <input
              type="text"
              disabled
              className="w-full bg-slate-800/50 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-400 cursor-not-allowed"
              value={formData.username}
            />
            <p className="text-xs text-slate-500 mt-1">登录账号不可更改。</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">真实姓名 (Name) <span className="text-red-400">*</span></label>
            <input
              type="text"
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-slate-500"
              placeholder="请输入显示姓名"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">系统角色 (Role) <span className="text-red-400">*</span></label>
            <select
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
              value={formData.role}
              onChange={(e) => setFormData({...formData, role: e.target.value})}
              disabled={submitting}
            >
              <option value="user">普通用户 (User)</option>
              <option value="admin">超级管理员 (Admin)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">重置密码 (可选)</label>
            <input
              type="password"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-slate-500"
              placeholder="不修改请留空"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              disabled={submitting}
            />
            <p className="text-xs text-slate-500 mt-1">如需重置密码，请输入新密码；如果不想修改，请留空。</p>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setEditModalOpen(false)}
              disabled={submitting}
              className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50"
            >
              {submitting ? '保存中...' : '保存更改'}
            </button>
          </div>
        </form>
      </GlossaModal>

    </div>
  );
}
