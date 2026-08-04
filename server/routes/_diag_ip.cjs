// 一次性诊断路由:返回 Render 后端看到的对外出口 IP
const express = require('express');
const router = express.Router();

router.get('/diag/outbound-ip', async (req, res) => {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const data = await r.json();
    res.json({ outboundIp: data.ip, source: 'api.ipify.org', ts: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

module.exports = router;