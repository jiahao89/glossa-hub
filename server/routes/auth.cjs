const express = require('express');
const router = express.Router();
const { db, verifyPassword, hashPassword } = require('../config/db.cjs');
const { signUserToken } = require('../middleware/auth.cjs');
const { loginLimiter } = require('../middleware/rateLimiters.cjs');

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码！' });
  }

  try {
    const user = await db.queryOne('SELECT * FROM users WHERE username = $1', [username]);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码不正确！' });
    }

    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: '用户名或密码不正确！' });
    }

    // 自动升级旧 SHA256 哈希为 bcrypt
    if (user.password_hash.length === 64) {
      const newHash = hashPassword(password);
      await db.run('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
    }

    const token = signUserToken({ id: user.id, username: user.username, role: user.role, name: user.name });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('登录出错:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

module.exports = router;
