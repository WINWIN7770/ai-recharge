const express = require('express');
const { readCollection, writeCollection, readObject, nextId, genOrderNo } = require('../db');
const { memoryUpload, saveUpload } = require('../upload');
const { requireAuth } = require('../auth');
const { autoDeliver, settleCommission } = require('../fulfill');

const router = express.Router();

/**
 * 校验优惠券是否可用，返回 { ok, discount, coupon, reason }。
 * subtotal 为折前金额；userId 用于「仅限首单」判断。
 */
function validateCoupon(code, subtotal, userId) {
  if (!code) return { ok: false, discount: 0, reason: '未填写优惠码' };
  const coupons = readCollection('coupons');
  const coupon = coupons.find((c) => c.code.toLowerCase() === String(code).trim().toLowerCase());
  if (!coupon || !coupon.enabled) return { ok: false, discount: 0, reason: '优惠码无效' };
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return { ok: false, discount: 0, reason: '优惠码已过期' };
  if (coupon.maxUses && (coupon.usedCount || 0) >= coupon.maxUses) return { ok: false, discount: 0, reason: '优惠码已被领完' };
  if (coupon.minAmount && subtotal < coupon.minAmount) return { ok: false, discount: 0, reason: `满 ¥${coupon.minAmount} 可用` };
  if (coupon.firstOrderOnly) {
    const paid = readCollection('orders').some(
      (o) => o.userId === userId && ['paid', 'processing', 'completed'].includes(o.status)
    );
    if (paid) return { ok: false, discount: 0, reason: '仅限首单使用' };
  }
  let discount = coupon.type === 'percent'
    ? Math.round(subtotal * (coupon.value / 100) * 100) / 100
    : coupon.value;
  discount = Math.min(discount, subtotal);
  return { ok: true, discount, coupon };
}

// 校验优惠码（下单前预览折扣）
router.post('/check-coupon', requireAuth, (req, res) => {
  const { productId, quantity, code } = req.body || {};
  const product = readCollection('products').find((p) => p.id === Number(productId) && p.active);
  if (!product) return res.status(400).json({ error: '商品不存在' });
  const qty = Math.max(1, Math.min(99, parseInt(quantity, 10) || 1));
  const subtotal = Math.round(product.price * qty * 100) / 100;
  const r = validateCoupon(code, subtotal, req.user.id);
  if (!r.ok) return res.status(400).json({ error: r.reason });
  res.json({ ok: true, discount: r.discount, payable: Math.round((subtotal - r.discount) * 100) / 100 });
});

// 创建订单
router.post('/', requireAuth, async (req, res) => {
  const { productId, quantity, chatgptEmail, chatgptPassword, contact, remark, couponCode } = req.body || {};
  const products = readCollection('products');
  const product = products.find((p) => p.id === Number(productId) && p.active);
  if (!product) return res.status(400).json({ error: '商品不存在或已下架' });

  const qty = Math.max(1, Math.min(99, parseInt(quantity, 10) || 1));
  if (product.stock < qty) return res.status(400).json({ error: '库存不足' });

  const subtotal = Math.round(product.price * qty * 100) / 100;

  // 优惠券（可选）
  let discount = 0;
  let appliedCoupon = '';
  if (couponCode) {
    const r = validateCoupon(couponCode, subtotal, req.user.id);
    if (!r.ok) return res.status(400).json({ error: '优惠码：' + r.reason });
    discount = r.discount;
    appliedCoupon = r.coupon.code;
    // 占用一次使用次数
    const coupons = readCollection('coupons');
    const c = coupons.find((x) => x.id === r.coupon.id);
    if (c) { c.usedCount = (c.usedCount || 0) + 1; await writeCollection('coupons', coupons); }
  }
  const amount = Math.max(0, Math.round((subtotal - discount) * 100) / 100);

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
    subtotal,
    discount,
    couponCode: appliedCoupon,
    amount,
    status: 'pending',
    chatgptEmail: chatgptEmail || '',
    chatgptPassword: chatgptPassword || '',
    contact: contact || '',
    remark: remark || '',
    paymentMethod: '',
    paymentProof: '',
    adminNote: '',
    deliverContent: '',
    autoDelivered: false,
    commissionSettled: false,
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

// 免登录订单查询（按订单号 + 联系方式/账号）
router.post('/query', (req, res) => {
  const { orderNo, contact } = req.body || {};
  if (!orderNo || !contact) return res.status(400).json({ error: '请输入订单号与下单时的联系方式' });
  const o = readCollection('orders').find((x) => x.orderNo === String(orderNo).trim());
  const key = String(contact).trim().toLowerCase();
  if (!o || (String(o.contact).toLowerCase() !== key && String(o.chatgptEmail).toLowerCase() !== key)) {
    return res.status(404).json({ error: '未找到匹配的订单，请核对订单号与联系方式' });
  }
  // 仅返回必要字段
  res.json({
    order: {
      orderNo: o.orderNo, productName: o.productName, quantity: o.quantity,
      amount: o.amount, status: o.status, createdAt: o.createdAt,
      paidAt: o.paidAt, completedAt: o.completedAt,
      deliverContent: o.status === 'completed' ? o.deliverContent : '',
      adminNote: o.adminNote || '',
    },
  });
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
  if (req.file) order.paymentProof = saveUpload(req.file, 'proof');
  order.status = 'paid';
  order.paidAt = new Date().toISOString();
  await autoDeliver(order);
  await settleCommission(order);
  await writeCollection('orders', orders);
  res.json({ ok: true, order });
});

// 模拟在线支付成功（测试用，需在设置中开启 mockPayEnabled）
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
  await autoDeliver(order);
  await settleCommission(order);
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
