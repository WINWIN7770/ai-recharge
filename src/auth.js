/**
 * 认证模块：基于 HMAC 签名的 Cookie Token（无需 session 存储，重启不掉线）
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { readCollection } = require('./db');

// 生产环境请通过环境变量覆盖
const SECRET = process.env.AUTH_SECRET || 'chatgpt-recharge-default-secret-change-me';
const COOKIE_NAME = 'token';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 天

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload) {
  const body = base64url(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest();
  return `${body}.${base64url(mac)}`;
}

function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = base64url(crypto.createHmac('sha256', SECRET).update(body).digest());
  if (mac !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function issueToken(user) {
  return sign({ uid: user.id, role: user.role, exp: Date.now() + MAX_AGE });
}

// 生产环境（HTTPS）下开启 Secure 标记：设置 COOKIE_SECURE=1 或 NODE_ENV=production
const SECURE_COOKIE = process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production';

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: SECURE_COOKIE,
    maxAge: MAX_AGE,
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function checkPassword(plain, hash) {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

// 从 cookie 中解析当前用户（完整对象，去掉密码）
function getCurrentUser(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const payload = verify(token);
  if (!payload) return null;
  const users = readCollection('users');
  const user = users.find((u) => u.id === payload.uid);
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

// 中间件：必须登录
function requireAuth(req, res, next) {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: '请先登录' });
  req.user = user;
  next();
}

// 中间件：必须管理员
function requireAdmin(req, res, next) {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: '请先登录' });
  if (user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  req.user = user;
  next();
}

module.exports = {
  COOKIE_NAME,
  issueToken,
  setAuthCookie,
  clearAuthCookie,
  hashPassword,
  checkPassword,
  getCurrentUser,
  requireAuth,
  requireAdmin,
};
