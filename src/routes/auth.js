const express = require('express');
const { readCollection, writeCollection, nextId } = require('../db');
const auth = require('../auth');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_一-龥]{2,20}$/;

// 注册
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: '用户名为 2-20 位字母/数字/下划线/中文' });
  if (String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });

  const users = readCollection('users');
  if (users.some((u) => u.username === username)) return res.status(400).json({ error: '用户名已存在' });
  if (email && users.some((u) => u.email === email)) return res.status(400).json({ error: '邮箱已被注册' });

  const user = {
    id: nextId(users),
    username,
    email: email || '',
    passwordHash: auth.hashPassword(password),
    role: 'user',
    balance: 0,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeCollection('users', users);

  const token = auth.issueToken(user);
  auth.setAuthCookie(res, token);
  res.json({ ok: true, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  const users = readCollection('users');
  const user = users.find((u) => u.username === username || u.email === username);
  if (!user || !auth.checkPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = auth.issueToken(user);
  auth.setAuthCookie(res, token);
  res.json({ ok: true, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
});

// 登出
router.post('/logout', (req, res) => {
  auth.clearAuthCookie(res);
  res.json({ ok: true });
});

// 当前用户
router.get('/me', (req, res) => {
  const user = auth.getCurrentUser(req);
  if (!user) return res.status(401).json({ error: '未登录' });
  res.json({ user });
});

module.exports = router;
