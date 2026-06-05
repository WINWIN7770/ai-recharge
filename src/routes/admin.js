const express = require('express');
const path = require('path');
const multer = require('multer');
const { readCollection, writeCollection, readObject, writeObject, nextId, UPLOAD_DIR } = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();
router.use(requireAdmin); // 整个 admin 路由都需要管理员权限

// 通用图片上传（商品图 / 收款码）
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 10) || '.png';
    cb(null, `img_${Date.now()}_${Math.floor(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  res.json({ ok: true, url: `/uploads/${req.file.filename}` });
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
  res.json({ products: readCollection('products').sort((a, b) => b.id - a.id) });
});

router.post('/products', (req, res) => {
  const products = readCollection('products');
  const b = req.body || {};
  if (!b.name || b.price == null) return res.status(400).json({ error: '名称和价格必填' });
  const product = {
    id: nextId(products),
    name: b.name,
    category: b.category || 'other',
    description: b.description || '',
    price: Number(b.price) || 0,
    originalPrice: Number(b.originalPrice) || Number(b.price) || 0,
    durationDays: Number(b.durationDays) || 0,
    stock: Number(b.stock) || 0,
    active: b.active !== false,
    sales: 0,
    image: b.image || '',
  };
  products.push(product);
  writeCollection('products', products);
  res.json({ ok: true, product });
});

router.put('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  const products = readCollection('products');
  const p = products.find((x) => x.id === id);
  if (!p) return res.status(404).json({ error: '商品不存在' });
  const b = req.body || {};
  const fields = ['name', 'category', 'description', 'image'];
  for (const f of fields) if (b[f] !== undefined) p[f] = b[f];
  for (const f of ['price', 'originalPrice', 'durationDays', 'stock']) {
    if (b[f] !== undefined) p[f] = Number(b[f]) || 0;
  }
  if (b.active !== undefined) p.active = !!b.active;
  writeCollection('products', products);
  res.json({ ok: true, product: p });
});

router.delete('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  let products = readCollection('products');
  if (!products.some((x) => x.id === id)) return res.status(404).json({ error: '商品不存在' });
  products = products.filter((x) => x.id !== id);
  writeCollection('products', products);
  res.json({ ok: true });
});

/* ---------------- 订单管理 ---------------- */
router.get('/orders', (req, res) => {
  let orders = readCollection('orders').sort((a, b) => b.id - a.id);
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
router.put('/orders/:id', (req, res) => {
  const id = Number(req.params.id);
  const orders = readCollection('orders');
  const o = orders.find((x) => x.id === id);
  if (!o) return res.status(404).json({ error: '订单不存在' });
  const b = req.body || {};
  const VALID = ['pending', 'paid', 'processing', 'completed', 'cancelled', 'refunded'];
  if (b.status) {
    if (!VALID.includes(b.status)) return res.status(400).json({ error: '无效状态' });
    o.status = b.status;
    if (b.status === 'completed' && !o.completedAt) {
      o.completedAt = new Date().toISOString();
      // 完成时扣减库存、增加销量
      const products = readCollection('products');
      const p = products.find((x) => x.id === o.productId);
      if (p) {
        p.stock = Math.max(0, p.stock - o.quantity);
        p.sales = (p.sales || 0) + o.quantity;
        writeCollection('products', products);
      }
    }
  }
  if (b.adminNote !== undefined) o.adminNote = b.adminNote;
  if (b.deliverContent !== undefined) o.deliverContent = b.deliverContent;
  writeCollection('orders', orders);
  res.json({ ok: true, order: o });
});

/* ---------------- 用户管理 ---------------- */
router.get('/users', (req, res) => {
  const users = readCollection('users').map(({ passwordHash, ...u }) => u).sort((a, b) => b.id - a.id);
  res.json({ users });
});

router.put('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const users = readCollection('users');
  const u = users.find((x) => x.id === id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const b = req.body || {};
  if (b.role && ['user', 'admin'].includes(b.role)) u.role = b.role;
  if (b.balance !== undefined) u.balance = Number(b.balance) || 0;
  writeCollection('users', users);
  const { passwordHash, ...safe } = u;
  res.json({ ok: true, user: safe });
});

/* ---------------- 站点设置 ---------------- */
router.get('/settings', (req, res) => {
  res.json({ settings: readObject('settings', {}) });
});

router.put('/settings', (req, res) => {
  const current = readObject('settings', {});
  const b = req.body || {};
  const merged = { ...current, ...b };
  // epay 嵌套合并
  if (b.epay) merged.epay = { ...(current.epay || {}), ...b.epay };
  writeObject('settings', merged);
  res.json({ ok: true, settings: merged });
});

module.exports = router;
