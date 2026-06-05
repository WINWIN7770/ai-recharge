const express = require('express');
const { readObject } = require('../db');

const router = express.Router();

// 公开：站点设置（隐藏敏感字段如 epay key）
router.get('/', (req, res) => {
  const s = readObject('settings', {});
  res.json({
    settings: {
      siteName: s.siteName || 'GPT 代充小站',
      slogan: s.slogan || '',
      announcement: s.announcement || '',
      contactInfo: s.contactInfo || '',
      alipayQr: s.alipayQr || '',
      wechatQr: s.wechatQr || '',
      mockPayEnabled: !!s.mockPayEnabled,
      epayEnabled: !!(s.epay && s.epay.enabled),
    },
  });
});

module.exports = router;
