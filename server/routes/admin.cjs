const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db, hashPassword, getDbType } = require('../config/db.cjs');
const { authenticateToken, requireSystemAdmin } = require('../middleware/auth.cjs');

router.get('/users', authenticateToken, requireSystemAdmin, async (_req, res) => {
  try {
    const users = await db.query('SELECT id, username, name, role, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (err) {
    console.error('Failed to get users:', err);
    res.status(500).json({ error: '无法获取用户列表' });
  }
});

router.post('/users', authenticateToken, requireSystemAdmin, async (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name) {
    return res.status(400).json({ error: '请填写完整的用户信息' });
  }
  try {
    const existing = await db.queryOne('SELECT id FROM users WHERE username = $1', [username]);
    if (existing) {
      return res.status(409).json({ error: '用户名已存在' });
    }
    const hashedPwd = hashPassword(password);
    const userId = crypto.randomUUID();
    const targetRole = role === 'admin' ? 'admin' : 'user';
    const createdAt = getDbType() === 'postgres' ? new Date() : new Date().toISOString();

    await db.run(
      'INSERT INTO users (id, username, password_hash, name, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, username, hashedPwd, name, targetRole, createdAt]
    );
    res.status(201).json({ success: true, user: { id: userId, username, name, role: targetRole, created_at: createdAt } });
  } catch (err) {
    console.error('Failed to create user:', err);
    res.status(500).json({ error: '添加用户失败' });
  }
});

router.put('/users/:id', authenticateToken, requireSystemAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, role, password } = req.body;

  if (!name || !role) {
    return res.status(400).json({ error: '姓名和角色不能为空' });
  }

  try {
    const targetRole = role === 'admin' ? 'admin' : 'user';

    if (password && password.trim() !== '') {
      const hashedPwd = hashPassword(password);
      await db.run(
        'UPDATE users SET name = $1, role = $2, password_hash = $3 WHERE id = $4',
        [name, targetRole, hashedPwd, id]
      );
    } else {
      await db.run(
        'UPDATE users SET name = $1, role = $2 WHERE id = $3',
        [name, targetRole, id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update user:', err);
    res.status(500).json({ error: '更新用户信息失败' });
  }
});

router.delete('/users/:id', authenticateToken, requireSystemAdmin, async (req, res) => {
  const { id } = req.params;

  if (req.user.id === id) {
    return res.status(400).json({ error: '系统保护：无法删除自己。' });
  }

  try {
    await db.run('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete user:', err);
    res.status(500).json({ error: '删除用户失败，可能存在外键约束，请联系开发确认。' });
  }
});

module.exports = router;
