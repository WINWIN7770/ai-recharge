const express = require('express');
const path = require('path');
const multer = require('multer');
const { readCollection, writeCollection, readObject, nextId, genOrderNo, UPLOAD_DIR } = require('../db');
const { requireAuth, getCurrentUser } = require('../auth');

const router = express.Router();

// 上传支付凭证
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 10) || '.png';
    cb(null, `proof_${Date.now()}_${Math.floor(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /image\//.test(file.mimetype)),
});

// 订单状态：pending(待支付) paid(已支付待处理) processing(处理中) completed(已完成) cancelled(已取消)
const STATUS = ['pending', 'paid', 'processing', 'completed', 'cancelled'];

// 创建订单
router.post('/', requireAuth, (req, res) => {
  const { productId, quantity, chatgptEmail, chatgptPassword, contact, remark } = req.body || {};
  const products = readCollection('products');
  const product = products.find((p) => p.id === Number(productId) && p.active);
  if (!product) return res.status(400).json({ error: '商品不存在或已下架' });

  const qty = Math.max(1, Math.min(99, parseInt(quantity, 10) || 1));
  if (product.stock < qty) return res.status(400).json({ error: '库存不足' });

  const amount = Math.round(product.price * qty * 100) / 100;
  const orders = readCollection('orders');
  const order = {
    id: nextId(orders),
    orderNo: genOrderNo(),
    userId: req.user.id,
    username: req.user.username,
    productId: product.id,
    productName: product.name,
    category: product.category,
    price: product.price,
    quantity: qty,
    amount,
    status: 'pending',
    // 代充所需信息（敏感，请在生产环境加密存储）
    chatgptEmail: chatgptEmail || '',
    chatgptPassword: chatgptPassword || '',
    contact: contact || '',
    remark: remark || '',
    paymentMethod: '',
    paymentProof: '',
    adminNote: '',
    deliverContent: '', // 管理员交付内容（如兑换码）
    createdAt: new Date().toISOString(),
    paidAt: null,
    completedAt: null,
  };
  orders.push(order);
  writeCollection('orders', orders);
  res.json({ ok: true, order });
});

// 我的订单列表
router.get('/', requireAuth, (req, res) => {
  const orders = readCollection('orders')
    .filter((o) => o.userId === req.user.id)
    .sort((a, b) => b.id - a.id);
  res.json({ orders });
});

// 订单详情（仅本人或管理员）
router.get('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const order = readCollection('orders').find((o) => o.id === id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权访问' });
  }
  res.json({ order });
});

// 提交支付（收款码方式：上传凭证 / 或标记已付款）
router.post('/:id/pay', requireAuth, upload.single('proof'), (req, res) => {
  const id = Number(req.params.id);
  const orders = readCollection('orders');
  const order = orders.find((o) => o.id === id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.userId !== req.user.id) return res.status(403).json({ error: '无权操作' });
  if (order.status !== 'pending') return res.status(400).json({ error: '该订单无需支付或已处理' });

  const method = (req.body && req.body.method) || 'manual';
  order.paymentMethod = method;
  if (req.file) {
    order.paymentProof = `/uploads/${req.file.filename}`;
  }
  // 收款码方式：标记为「已支付待处理」，等待管理员核实
  order.status = 'paid';
  order.paidAt = new Date().toISOString();
  writeCollection('orders', orders);
  res.json({ ok: true, order });
});

// 模拟在线支付成功（仅用于测试跑通流程，需在设置中开启 mockPayEnabled）
router.post('/:id/mock-pay', requireAuth, (req, res) => {
  const settings = readObject('settings', {});
  if (!settings.mockPayEnabled) return res.status(403).json({ error: '模拟支付未开启' });
  const id = Number(req.params.id);
  const orders = readCollection('orders');
  const order = orders.find((o) => o.id === id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.userId !== req.user.id) return res.status(403).json({ error: '无权操作' });
  if (order.status !== 'pending') return res.status(400).json({ error: '订单状态不允许支付' });

  order.status = 'paid';
  order.paymentMethod = 'mock';
  order.paidAt = new Date().toISOString();
  writeCollection('orders', orders);
  res.json({ ok: true, order });
});

// 用户取消订单（仅待支付）
router.post('/:id/cancel', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const orders = readCollection('orders');
  const order = orders.find((o) => o.id === id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.userId !== req.user.id) return res.status(403).json({ error: '无权操作' });
  if (order.status !== 'pending') return res.status(400).json({ error: '仅待支付订单可取消' });
  order.status = 'cancelled';
  writeCollection('orders', orders);
  res.json({ ok: true, order });
});

module.exports = router;
