const express = require('express');
const { readCollection, writeCollection } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// 推广信息：邀请码、邀请链接、邀请人数、累计佣金、当前余额
router.get('/promo', requireAuth, async (req, res) => {
  const users = readCollection('users');
  const me = users.find((u) => u.id === req.user.id);
  if (!me) return res.status(404).json({ error: '用户不存在' });

  // 老用户可能没有邀请码，惰性补发
  if (!me.referralCode) {
    me.referralCode = 'R' + String(me.id).padStart(5, '0');
    await writeCollection('users', users);
  }

  const invited = users.filter((u) => u.referredBy === me.id);
  const commissions = readCollection('commissions').filter((c) => c.referrerId === me.id);
  const earnings = Math.round(commissions.reduce((s, c) => s + (c.amount || 0), 0) * 100) / 100;

  res.json({
    referralCode: me.referralCode,
    balance: Math.round((me.balance || 0) * 100) / 100,
    invitedCount: invited.length,
    invitedUsers: invited.map((u) => ({ username: u.username, createdAt: u.createdAt })),
    earnings,
    records: commissions.sort((a, b) => b.id - a.id).slice(0, 50),
  });
});

module.exports = router;
