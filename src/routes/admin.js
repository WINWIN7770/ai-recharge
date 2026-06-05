const express = require('express');
const { readCollection, writeCollection, readObject, writeObject, nextId } = require('../db');
const { memoryUpload, saveUpload } = require('../upload');
const { requireAdmin } = require('../auth');
const { settleCommission } = require('../fulfill');

const router = express.Router();
router.use(requireAdmin); // 整个 admin 路由都需要管理员权限

// 通用图片上传（商品图 / 收款码）
router.post('/upload', memoryUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  res.json({ ok: true, url: saveUpload(req.file, 'img') });
});

/* ---------------- 数据看板 ---------------- */
router.get('/stats', (req, res) => {
  const orders = readCollection('orders');
  const users = readCollection('users');
  const products = readCollection('products');
  const paidOrders = orders.filter((o) => ['paid', 'processing', 'completed'].includes(o.status));
  const revenue = paidOrders.reduce((s, o) => s + (o.amount || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o) => (o.createdAt || '').slice(0, 10) === today);
  res.json({
    stats: {
      totalUsers: users.length,
      totalProducts: products.length,
      totalOrders: orders.length,
      pendingOrders: orders.filter((o) => o.status === 'pending').length,
      paidPending: orders.filter((o) => o.status === 'paid').length, // 已付款待处理
      completedOrders: orders.filter((o) => o.status === 'completed').length,
      revenue: Math.round(revenue * 100) / 100,
      todayOrders: todayOrders.length,
    },
  });
});

/* ---------------- 商品管理 ---------------- */
router.get('/products', (req, res) => {
  res.json({ products: readCollection('products').slice().sort((a, b) => b.id - a.id) });
});

router.post('/products', async (req, res) => {
  const products = readCollection('products');
  const b = req.body || {};
  if (!b.name || b.price == null) return res.status(400).json({ error: '名称和价格必填' });
  const product = {
    id: nextId(products),
    name: b.name,
    brand: b.brand || 'gpt',
    category: b.category || 'other',
    description: b.description || '',
    price: Number(b.price) || 0,
    originalPrice: Number(b.originalPrice) || Number(b.price) || 0,
    durationDays: Number(b.durationDays) || 0,
    stock: Number(b.stock) || 0,
    active: b.active !== false,
    sales: 0,
    image: b.image || '',
    badge: b.badge || '',
    deliveryType: b.deliveryType || 'manual',
    needAccount: b.needAccount !== undefined ? !!b.needAccount : true,
    features: Array.isArray(b.features) ? b.features : [],
  };
  products.push(product);
  await writeCollection('products', products);
  res.json({ ok: true, product });
});

router.put('/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  const products = readCollection('products');
  const p = products.find((x) => x.id === id);
  if (!p) return res.status(404).json({ error: '商品不存在' });
  const b = req.body || {};
  const fields = ['name', 'brand', 'category', 'description', 'image', 'badge', 'deliveryType'];
  for (const f of fields) if (b[f] !== undefined) p[f] = b[f];
  for (const f of ['price', 'originalPrice', 'durationDays', 'stock']) {
    if (b[f] !== undefined) p[f] = Number(b[f]) || 0;
  }
  if (b.active !== undefined) p.active = !!b.active;
  if (b.needAccount !== undefined) p.needAccount = !!b.needAccount;
  if (Array.isArray(b.features)) p.features = b.features;
  await writeCollection('products', products);
  res.json({ ok: true, product: p });
});

router.delete('/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  let products = readCollection('products');
  if (!products.some((x) => x.id === id)) return res.status(404).json({ error: '商品不存在' });
  products = products.filter((x) => x.id !== id);
  await writeCollection('products', products);
  res.json({ ok: true });
});

/* ---------------- 卡密库存管理 ---------------- */
// 同步某商品的库存为「可用卡密数」（仅对卡密类商品）
async function syncCardStock(productId) {
  const products = readCollection('products');
  const p = products.find((x) => x.id === productId);
  if (!p || p.deliveryType !== 'card') return;
  const cards = readCollection('cards');
  p.stock = cards.filter((c) => c.productId === productId && c.status === 'available').length;
  await writeCollection('products', products);
}

// 各商品卡密库存汇总（可用/已售）
router.get('/cards/summary', (req, res) => {
  const cards = readCollection('cards');
  const summary = {};
  for (const c of cards) {
    const s = (summary[c.productId] = summary[c.productId] || { available: 0, sold: 0 });
    if (c.status === 'available') s.available += 1;
    else s.sold += 1;
  }
  res.json({ summary });
});

// 某商品的卡密列表
router.get('/cards', (req, res) => {
  const productId = Number(req.query.productId);
  let cards = readCollection('cards').slice().sort((a, b) => b.id - a.id);
  if (productId) cards = cards.filter((c) => c.productId === productId);
  res.json({ cards });
});

// 批量导入卡密（secrets 按行分隔，每行一个）
router.post('/cards', async (req, res) => {
  const b = req.body || {};
  const productId = Number(b.productId);
  const product = readCollection('products').find((p) => p.id === productId);
  if (!product) return res.status(400).json({ error: '商品不存在' });
  const lines = String(b.secrets || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return res.status(400).json({ error: '请输入至少一条卡密' });

  const cards = readCollection('cards');
  const now = new Date().toISOString();
  let id = nextId(cards);
  for (const secret of lines) {
    cards.push({ id: id++, productId, secret, status: 'available', orderId: null, createdAt: now, soldAt: null });
  }
  await writeCollection('cards', cards);
  await syncCardStock(productId);
  res.json({ ok: true, added: lines.length });
});

// 删除一条未售出的卡密
router.delete('/cards/:id', async (req, res) => {
  const id = Number(req.params.id);
  const cards = readCollection('cards');
  const card = cards.find((c) => c.id === id);
  if (!card) return res.status(404).json({ error: '卡密不存在' });
  if (card.status === 'sold') return res.status(400).json({ error: '已售出的卡密不可删除' });
  const pid = card.productId;
  await writeCollection('cards', cards.filter((c) => c.id !== id));
  await syncCardStock(pid);
  res.json({ ok: true });
});

/* ---------------- 订单管理 ---------------- */
router.get('/orders', (req, res) => {
  let orders = readCollection('orders').slice().sort((a, b) => b.id - a.id);
  const { status, keyword } = req.query;
  if (status) orders = orders.filter((o) => o.status === status);
  if (keyword) {
    const k = String(keyword).toLowerCase();
    orders = orders.filter(
      (o) =>
        (o.orderNo || '').toLowerCase().includes(k) ||
        (o.username || '').toLowerCase().includes(k) ||
        (o.chatgptEmail || '').toLowerCase().includes(k)
    );
  }
  res.json({ orders });
});

// 更新订单状态 / 交付内容 / 备注
router.put('/orders/:id', async (req, res) => {
  const id = Number(req.params.id);
  const orders = readCollection('orders');
  const o = orders.find((x) => x.id === id);
  if (!o) return res.status(404).json({ error: '订单不存在' });
  const b = req.body || {};
  const VALID = ['pending', 'paid', 'processing', 'completed', 'cancelled', 'refunded'];
  if (b.status) {
    if (!VALID.includes(b.status)) return res.status(400).json({ error: '无效状态' });
    o.status = b.status;
    if (b.status === 'paid' && !o.paidAt) o.paidAt = new Date().toISOString();
    if (b.status === 'completed' && !o.completedAt) {
      o.completedAt = new Date().toISOString();
      // 非卡密商品：完成时扣减库存、增加销量（卡密商品由自动发卡流程处理）
      const products = readCollection('products');
      const p = products.find((x) => x.id === o.productId);
      if (p && p.deliveryType !== 'card') {
        p.stock = Math.max(0, p.stock - o.quantity);
        p.sales = (p.sales || 0) + o.quantity;
        await writeCollection('products', products);
      }
    }
    // 进入「已收款」相关状态时结算推荐返佣（每单仅一次）
    if (['paid', 'processing', 'completed'].includes(b.status)) {
      await settleCommission(o);
    }
  }
  if (b.adminNote !== undefined) o.adminNote = b.adminNote;
  if (b.deliverContent !== undefined) o.deliverContent = b.deliverContent;
  await writeCollection('orders', orders);
  res.json({ ok: true, order: o });
});

/* ---------------- 用户管理 ---------------- */
router.get('/users', (req, res) => {
  const users = readCollection('users').map(({ passwordHash, ...u }) => u).sort((a, b) => b.id - a.id);
  res.json({ users });
});

router.put('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  const users = readCollection('users');
  const u = users.find((x) => x.id === id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const b = req.body || {};
  if (b.role && ['user', 'admin'].includes(b.role)) u.role = b.role;
  if (b.balance !== undefined) u.balance = Number(b.balance) || 0;
  await writeCollection('users', users);
  const { passwordHash, ...safe } = u;
  res.json({ ok: true, user: safe });
});

/* ---------------- 站点设置 ---------------- */
router.get('/settings', (req, res) => {
  res.json({ settings: readObject('settings', {}) });
});

router.put('/settings', async (req, res) => {
  const current = readObject('settings', {});
  const b = req.body || {};
  const merged = { ...current, ...b };
  // epay 嵌套合并
  if (b.epay) merged.epay = { ...(current.epay || {}), ...b.epay };
  await writeObject('settings', merged);
  res.json({ ok: true, settings: merged });
});

/* ---------------- 优惠券管理 ---------------- */
router.get('/coupons', (req, res) => {
  res.json({ coupons: readCollection('coupons').slice().sort((a, b) => b.id - a.id) });
});

router.post('/coupons', async (req, res) => {
  const b = req.body || {};
  const code = String(b.code || '').trim();
  if (!code) return res.status(400).json({ error: '优惠码必填' });
  const coupons = readCollection('coupons');
  if (coupons.some((c) => c.code.toLowerCase() === code.toLowerCase())) {
    return res.status(400).json({ error: '优惠码已存在' });
  }
  const coupon = {
    id: nextId(coupons),
    code,
    type: b.type === 'percent' ? 'percent' : 'fixed',
    value: Number(b.value) || 0,
    minAmount: Number(b.minAmount) || 0,
    firstOrderOnly: !!b.firstOrderOnly,
    maxUses: Number(b.maxUses) || 0, // 0=不限
    usedCount: 0,
    enabled: b.enabled !== false,
    expiresAt: b.expiresAt || '',
    createdAt: new Date().toISOString(),
  };
  coupons.push(coupon);
  await writeCollection('coupons', coupons);
  res.json({ ok: true, coupon });
});

router.put('/coupons/:id', async (req, res) => {
  const id = Number(req.params.id);
  const coupons = readCollection('coupons');
  const c = coupons.find((x) => x.id === id);
  if (!c) return res.status(404).json({ error: '优惠券不存在' });
  const b = req.body || {};
  for (const f of ['code', 'type', 'expiresAt']) if (b[f] !== undefined) c[f] = b[f];
  for (const f of ['value', 'minAmount', 'maxUses']) if (b[f] !== undefined) c[f] = Number(b[f]) || 0;
  if (b.firstOrderOnly !== undefined) c.firstOrderOnly = !!b.firstOrderOnly;
  if (b.enabled !== undefined) c.enabled = !!b.enabled;
  await writeCollection('coupons', coupons);
  res.json({ ok: true, coupon: c });
});

router.delete('/coupons/:id', async (req, res) => {
  const id = Number(req.params.id);
  const coupons = readCollection('coupons');
  if (!coupons.some((x) => x.id === id)) return res.status(404).json({ error: '优惠券不存在' });
  await writeCollection('coupons', coupons.filter((x) => x.id !== id));
  res.json({ ok: true });
});

/* ---------------- 返佣记录 ---------------- */
router.get('/commissions', (req, res) => {
  const logs = readCollection('commissions').slice().sort((a, b) => b.id - a.id);
  const total = logs.reduce((s, l) => s + (l.amount || 0), 0);
  res.json({ commissions: logs, total: Math.round(total * 100) / 100 });
});

/* ---------------- 数据分析（图表） ---------------- */
router.get('/analytics', (req, res) => {
  const orders = readCollection('orders');
  const paidStatuses = ['paid', 'processing', 'completed'];

  // 近 14 天营收与订单数
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, revenue: 0, orders: 0 });
  }
  const dayMap = Object.fromEntries(days.map((d) => [d.date, d]));
  for (const o of orders) {
    const key = (o.paidAt || o.createdAt || '').slice(0, 10);
    if (dayMap[key] && paidStatuses.includes(o.status)) {
      dayMap[key].revenue = Math.round((dayMap[key].revenue + (o.amount || 0)) * 100) / 100;
      dayMap[key].orders += 1;
    }
  }

  // 状态漏斗
  const funnel = {};
  for (const o of orders) funnel[o.status] = (funnel[o.status] || 0) + 1;

  // 卡密库存预警（可用 < 5 的卡密类商品）
  const products = readCollection('products');
  const cards = readCollection('cards');
  const lowStock = products
    .filter((p) => p.deliveryType === 'card' && p.active)
    .map((p) => ({
      id: p.id, name: p.name,
      available: cards.filter((c) => c.productId === p.id && c.status === 'available').length,
    }))
    .filter((x) => x.available < 5)
    .sort((a, b) => a.available - b.available);

  res.json({ daily: days, funnel, lowStock });
});

module.exports = router;
