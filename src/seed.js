/**
 * 初始化种子数据：默认管理员、示例商品、站点设置。
 * 仅在对应集合为空时写入，重复运行不会覆盖已有数据。
 */
const { readCollection, writeCollection, readObject, writeObject, has } = require('./db');
const { hashPassword } = require('./auth');

async function seedUsers() {
  if (readCollection('users').length > 0) return;
  const now = new Date().toISOString();
  await writeCollection('users', [
    { id: 1, username: 'admin', email: 'admin@example.com', passwordHash: hashPassword('admin123'), role: 'admin', balance: 0, createdAt: now },
    { id: 2, username: 'demo', email: 'demo@example.com', passwordHash: hashPassword('demo123'), role: 'user', balance: 0, createdAt: now },
  ]);
  console.log('  ✓ 已创建默认账号: admin/admin123 (管理员), demo/demo123 (用户)');
}

async function seedProducts() {
  if (readCollection('products').length > 0) return;
  const list = [
    { id: 1, name: 'ChatGPT Plus 会员 · 1个月', category: 'plus', description: '官方 ChatGPT Plus 会员，畅享 GPT-4o / GPT-5、高级语音、图像生成等全部高级功能。代充至您本人账号，安全无忧。', price: 158, originalPrice: 200, durationDays: 30, stock: 999, active: true, sales: 128, image: '' },
    { id: 2, name: 'ChatGPT Plus 会员 · 3个月', category: 'plus', description: '三个月连续会员，更优惠。代充至您本人账号，全程透明。', price: 450, originalPrice: 600, durationDays: 90, stock: 999, active: true, sales: 64, image: '' },
    { id: 3, name: 'ChatGPT API 额度 · $10', category: 'api', description: 'OpenAI API 官方额度充值 $10，用于开发者调用接口。下单后请提供 API 组织信息。', price: 88, originalPrice: 100, durationDays: 0, stock: 500, active: true, sales: 312, image: '' },
    { id: 4, name: 'ChatGPT API 额度 · $50', category: 'api', description: 'OpenAI API 官方额度充值 $50，量大从优。', price: 420, originalPrice: 500, durationDays: 0, stock: 300, active: true, sales: 96, image: '' },
    { id: 5, name: 'ChatGPT Team 团队版 · 1个月/席位', category: 'team', description: 'ChatGPT Team 团队版，更高额度与协作功能，按席位计费。', price: 260, originalPrice: 320, durationDays: 30, stock: 200, active: true, sales: 18, image: '' },
    { id: 6, name: 'OpenAI 礼品卡兑换码 · $20', category: 'gift', description: '官方礼品卡兑换码，自助兑换到账，发码秒到。', price: 175, originalPrice: 200, durationDays: 0, stock: 150, active: true, sales: 240, image: '' },
  ];
  await writeCollection('products', list);
  console.log(`  ✓ 已创建 ${list.length} 个示例商品`);
}

async function seedSettings() {
  if (has('settings') && readObject('settings', {}).siteName) return;
  await writeObject('settings', {
    siteName: 'GPT 代充小站',
    slogan: '安全 · 快速 · 官方渠道 ChatGPT 代充服务',
    announcement: '欢迎光临！本站提供 ChatGPT Plus、API 额度、礼品卡等代充服务，下单后客服将尽快为您处理。如有疑问请联系客服。',
    contactInfo: '客服微信：your_wechat_id ｜ 邮箱：service@example.com',
    alipayQr: '',
    wechatQr: '',
    epay: { enabled: false, apiUrl: '', pid: '', key: '' },
    mockPayEnabled: true,
  });
  console.log('  ✓ 已创建默认站点设置');
}

async function run() {
  console.log('正在初始化种子数据...');
  await seedUsers();
  await seedProducts();
  await seedSettings();
  console.log('种子数据初始化完成。');
}

module.exports = { run };
