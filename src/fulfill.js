/**
 * 履约与结算共享逻辑（用户端 orders 路由与管理端 admin 路由共用）
 *  - autoDeliver：卡密类商品付款后自动发货并完成订单
 *  - settleCommission：订单收款后给推荐人计入返佣（每单仅一次）
 * 说明：这些函数会写入 cards/products/users/commissions 集合，
 *       但不写 orders（由调用方在变更后统一 writeCollection('orders')）。
 */
const { readCollection, writeCollection, readObject, nextId } = require('./db');

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

  product.stock = cards.filter((c) => c.productId === order.productId && c.status === 'available').length;
  product.sales = (product.sales || 0) + order.quantity;
  await writeCollection('products', products);
  return true;
}

async function settleCommission(order) {
  if (order.commissionSettled) return false;
  const users = readCollection('users');
  const buyer = users.find((u) => u.id === order.userId);
  if (!buyer || !buyer.referredBy) { order.commissionSettled = true; return false; }
  const referrer = users.find((u) => u.id === buyer.referredBy);
  if (!referrer) { order.commissionSettled = true; return false; }

  const settings = readObject('settings', {});
  const rate = settings.commissionRate != null ? Number(settings.commissionRate) : 0.1;
  const commission = Math.round((order.amount || 0) * rate * 100) / 100;
  if (commission <= 0) { order.commissionSettled = true; return false; }

  referrer.balance = Math.round(((referrer.balance || 0) + commission) * 100) / 100;
  order.commissionSettled = true;
  order.commissionAmount = commission;
  order.commissionTo = referrer.id;
  await writeCollection('users', users);

  const logs = readCollection('commissions');
  logs.push({
    id: nextId(logs), orderId: order.id, orderNo: order.orderNo,
    referrerId: referrer.id, referrerName: referrer.username,
    buyerId: buyer.id, buyerName: buyer.username,
    amount: commission, rate, createdAt: new Date().toISOString(),
  });
  await writeCollection('commissions', logs);
  return true;
}

module.exports = { autoDeliver, settleCommission };
