const express = require('express');
const { readCollection, writeCollection, readObject, nextId, genOrderNo } = require('../db');
const { memoryUpload, saveUpload } = require('../upload');
const { requireAuth } = require('../auth');

const router = express.Router();

/**
 * 卡密自动发货：订单支付成功后调用。
 * 若商品为 deliveryType==='card' 且卡密库存充足，则自动分配卡密、填入交付内容、
 * 直接将订单标记为「已完成」，并同步库存/销量。库存不足则原样返回（转人工处理）。
 * 注意：本函数会写入 cards / products 集合，但不写 orders（由调用方统一写）。
 */
async function autoDeliver(order) {
  const products = readCollection('products');
  const product = products.find((p) => p.id === order.productId);
  if (!product || product.deliveryType !== 'card') return false;

  const cards = readCollection('cards');
  const avail = cards.filter((c) => c.productId === order.productId && c.status === 'available');
  if (avail.length < order.quantity) return false; // 卡密不足，转人工发货

  const now = new Date().toISOString();
  const picked = avail.slice(0, order.quantity);
  for (const c of picked) { c.status = 'sold'; c.orderId = order.id; c.soldAt = now; }
  await writeCollection('cards', cards);

  order.deliverContent = picked.map((c) => c.secret).join('\n');
  order.status = 'completed';
  order.completedAt = now;
  order.autoDelivered = true;

  // 同步库存（剩余可用卡密数）与销量
  product.stock = cards.filter((c) => c.productId === order.productId && c.status === 'available').length;
  product.sales = (product.sales || 0) + order.quantity;
  await writeCollection('products', products);
  return true;
}

// 创建订单
router.post('/', requireAuth, async (req, res) => {
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
  await writeCollection('orders', orders);
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
router.post('/:id/pay', requireAuth, memoryUpload.single('proof'), async (req, res) => {
  const id = Number(req.params.id);
  const orders = readCollection('orders');
  const order = orders.find((o) => o.id === id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.userId !== req.user.id) return res.status(403).json({ error: '无权操作' });
  if (order.status !== 'pending') return res.status(400).json({ error: '该订单无需支付或已处理' });

  const method = (req.body && req.body.method) || 'manual';
  order.paymentMethod = method;
  if (req.file) {
    order.paymentProof = saveUpload(req.file, 'proof');
  }
  // 收款码方式：标记为「已支付待处理」，等待管理员核实
  order.status = 'paid';
  order.paidAt = new Date().toISOString();
  await autoDeliver(order); // 卡密商品有货则自动发货并完成
  await writeCollection('orders', orders);
  res.json({ ok: true, order });
});

// 模拟在线支付成功（仅用于测试跑通流程，需在设置中开启 mockPayEnabled）
router.post('/:id/mock-pay', requireAuth, async (req, res) => {
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
  await autoDeliver(order); // 卡密商品有货则自动发货并完成
  await writeCollection('orders', orders);
  res.json({ ok: true, order });
});

// 用户取消订单（仅待支付）
router.post('/:id/cancel', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const orders = readCollection('orders');
  const order = orders.find((o) => o.id === id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.userId !== req.user.id) return res.status(403).json({ error: '无权操作' });
  if (order.status !== 'pending') return res.status(400).json({ error: '仅待支付订单可取消' });
  order.status = 'cancelled';
  await writeCollection('orders', orders);
  res.json({ ok: true, order });
});

module.exports = router;
