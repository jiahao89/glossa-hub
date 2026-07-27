const rateLimit = require('express-rate-limit');

// 登录限流: 每分钟最多 5 次尝试
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 100,
  message: { error: '尝试过于频繁，请 1 分钟后再试。' }
});

// 高危写入操作限流
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: '操作过于频繁，请稍后再试。' }
});

// 重型耗能操作限流 (如大表同步、AI翻译代理等)
const heavyOperationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 分钟
  max: 20,                 // 限制 20 次
  message: { error: '检测到高耗能操作过于频繁，请稍候再试。' }
});

// AI 翻译接口专用的限流器
const aiTranslateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 分钟
  max: 150,                // 限制 150 次
  message: { error: '翻译请求过于频繁，请稍候再试。' }
});

module.exports = {
  loginLimiter,
  writeLimiter,
  heavyOperationLimiter,
  aiTranslateLimiter
};
