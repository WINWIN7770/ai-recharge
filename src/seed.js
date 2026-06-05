/**
 * 初始化种子数据：默认管理员、多品牌商品目录、站点设置。
 * 仅在对应集合为空时写入，重复运行不会覆盖已有数据。
 *
 * 商品字段说明（升级版）：
 *  brand        品牌分组，用于首页 Tab：gpt / claude / gemini / grok / suno / apple
 *  category     业务类型：plus / pro / team / max / advanced / api / gift / id
 *  deliveryType 交付方式：link(专属升级链接) / card(卡密自动发货) / manual(人工代充)
 *  needAccount  下单是否需要填写对方账号（人工代充类需要，卡密类不需要）
 *  badge        角标文案（热销/旗舰/超值…），空则不显示
 *  features     卖点列表，展示在商品详情
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

// 商品目录版本号：每次调整下面的目录就 +1，部署后会自动覆盖线上旧目录（不影响订单/用户）。
const PRODUCTS_SEED_VERSION = 2;

async function seedProducts() {
  const meta = readObject('meta', {});
  const existing = readCollection('products');
  // 已有商品且版本已是最新 → 跳过（保留管理员在后台的改动）
  if (existing.length > 0 && (meta.productsSeedVersion || 0) >= PRODUCTS_SEED_VERSION) return;
  const reseed = existing.length > 0; // 仅用于日志区分「首次创建」与「版本升级覆盖」
  const P = (o) => ({
    originalPrice: o.price, durationDays: 30, stock: 999, active: true,
    sales: 0, image: '', badge: '', deliveryType: 'link', needAccount: false,
    features: [], ...o,
  });
  const list = [
    // ===== ChatGPT =====
    P({ id: 1, brand: 'gpt', name: 'ChatGPT Plus 会员 · 1个月', category: 'plus', price: 158, originalPrice: 200, sales: 1286, badge: '🔥 热销',
      deliveryType: 'link', needAccount: true,
      description: '官方 ChatGPT Plus 会员，解锁 GPT-5.5、高级语音、深度搜索、数据分析与图像生成。',
      features: ['GPT-5.5 旗舰模型不限速', '高级语音 / 联网搜索 / 文件分析', '官方原价直充，2 分钟到账', '支持 30 天质保'] }),
    P({ id: 2, brand: 'gpt', name: 'ChatGPT Plus 会员 · 3个月', category: 'plus', price: 450, originalPrice: 600, sales: 642, badge: '超值',
      deliveryType: 'link', needAccount: true,
      description: '连续三个月 Plus，长期使用更划算，稳定续费不掉订。',
      features: ['等同 3 次月度充值，立省 ¥150', '到期前自动提醒续费', '优先客服通道'] }),
    P({ id: 3, brand: 'gpt', name: 'ChatGPT Pro 会员 · 1个月', category: 'pro', price: 1399, originalPrice: 1680, sales: 88, badge: '旗舰',
      deliveryType: 'link', needAccount: true,
      description: 'ChatGPT Pro，GPT-5.5 Pro 无限用量 + o系列推理模型 + Sora 视频额度。',
      features: ['Pro 专属 o3-pro 深度推理', 'Sora 视频生成高额度', '所有高级功能满血版'] }),
    P({ id: 4, brand: 'gpt', name: 'ChatGPT Team 团队版 · 1席位/月', category: 'team', price: 260, originalPrice: 320, sales: 156, badge: '企业',
      deliveryType: 'manual', needAccount: true,
      description: 'Team 团队版，更高额度 + 团队协作 + 数据不用于训练，按席位计费，支持对公/发票。',
      features: ['独立工作区，数据更安全', '支持对公打款 / 增值税发票', '批量开通，统一管理'] }),

    // ===== Claude =====
    P({ id: 5, brand: 'claude', name: 'Claude Pro 会员 · 1个月', category: 'pro', price: 158, originalPrice: 200, sales: 534, badge: '🔥 热销',
      deliveryType: 'link', needAccount: true,
      description: 'Anthropic Claude Pro，超长上下文、Claude Opus 顶尖模型，长文写作与代码神器。',
      features: ['Claude Opus / Sonnet 满血', '200K 超长上下文', 'Projects 项目知识库', '官方原价直充'] }),
    P({ id: 6, brand: 'claude', name: 'Claude Max 会员 · 1个月', category: 'max', price: 1099, originalPrice: 1380, sales: 47, badge: '旗舰',
      deliveryType: 'link', needAccount: true,
      description: 'Claude Max，5~20 倍用量上限，重度用户与开发者首选。',
      features: ['用量上限提升至 Pro 的 5–20 倍', '高峰期优先访问', 'Claude Code 不限速'] }),

    // ===== Gemini =====
    P({ id: 7, brand: 'gemini', name: 'Gemini Advanced · 1个月', category: 'advanced', price: 138, originalPrice: 180, sales: 213, badge: '推荐',
      deliveryType: 'manual', needAccount: true,
      description: 'Google Gemini Advanced（Google One AI），Gemini 旗舰多模态 + 2TB 云空间。',
      features: ['Gemini 旗舰多模态模型', '深度集成 Gmail / Docs / 表格', '附赠 2TB Google 云空间'] }),

    // ===== Grok =====
    P({ id: 8, brand: 'grok', name: 'SuperGrok · 1个月', category: 'plus', price: 188, originalPrice: 240, sales: 176, badge: '新',
      deliveryType: 'manual', needAccount: true,
      description: 'xAI SuperGrok，实时资讯 + 幽默风趣 + Grok 旗舰推理，X 平台原生体验。',
      features: ['Grok 旗舰模型不限速', '实时联网 X 资讯', '图像理解与生成'] }),

    // ===== Suno =====
    P({ id: 9, brand: 'suno', name: 'Suno Pro · 1个月', category: 'pro', price: 99, originalPrice: 128, sales: 308, badge: '🎵',
      deliveryType: 'manual', needAccount: true,
      description: 'Suno AI 音乐 Pro，每月 2500 积分，商业版权，创作无限旋律。',
      features: ['每月约 500 首歌额度', '作品拥有商业使用版权', '更快生成队列'] }),

    // ===== API 额度 =====
    P({ id: 10, brand: 'gpt', name: 'OpenAI API 额度 · $10', category: 'api', price: 88, originalPrice: 100, durationDays: 0, stock: 500, sales: 980, badge: '秒发',
      deliveryType: 'card',
      description: 'OpenAI 官方 API 额度，充值至您的组织，开发者调用 GPT-5.5 / o 系列接口。',
      features: ['官方额度，非中转', '下单后填组织 ID 自动充', '发票可开'] }),
    P({ id: 11, brand: 'claude', name: 'Anthropic API 额度 · $20', category: 'api', price: 168, originalPrice: 200, durationDays: 0, stock: 400, sales: 421, badge: '',
      deliveryType: 'card',
      description: 'Anthropic 官方 API 额度，调用 Claude Opus / Sonnet 接口。',
      features: ['官方 Console 额度', '支持 Claude Code / SDK', '量大从优'] }),

    // ===== 礼品卡 =====
    P({ id: 12, brand: 'gpt', name: 'OpenAI 礼品卡兑换码 · $20', category: 'gift', price: 175, originalPrice: 200, durationDays: 0, stock: 200, sales: 760, badge: '秒发卡密',
      deliveryType: 'card',
      description: '官方礼品卡兑换码，自助兑换、发码秒到，可用于 Plus / API。',
      features: ['付款后立即发码', '官方兑换，永久有效', '附图文兑换教程'] }),

    // ===== 苹果 ID =====
    P({ id: 13, brand: 'apple', name: '免费海外 Apple ID（美区）', category: 'id', price: 0, originalPrice: 0, durationDays: 0, stock: 9999, sales: 5210, badge: '免费领',
      deliveryType: 'card',
      description: '免费领取美区 Apple ID，用于下载海外 App / 订阅，无需注册，一键获取。',
      features: ['美区共享账号，开箱即用', '附登录教程', '0 元免费领取'] }),
  ];
  await writeCollection('products', list);
  await writeObject('meta', { ...meta, productsSeedVersion: PRODUCTS_SEED_VERSION });
  console.log(`  ✓ ${reseed ? '已升级' : '已创建'}商品目录（v${PRODUCTS_SEED_VERSION}，共 ${list.length} 个多品牌商品）`);
}

async function seedCoupons() {
  if (readCollection('coupons').length > 0) return;
  await writeCollection('coupons', [
    {
      id: 1, code: 'WELCOME10', type: 'fixed', value: 10, minAmount: 50,
      firstOrderOnly: true, maxUses: 0, usedCount: 0, enabled: true,
      expiresAt: '', createdAt: new Date().toISOString(),
    },
  ]);
  console.log('  ✓ 已创建首单优惠券 WELCOME10');
}

async function seedSettings() {
  if (has('settings') && readObject('settings', {}).siteName) return;
  await writeObject('settings', {
    siteName: 'NebulaGPT 星充',
    slogan: '一站式 AI 订阅代充 · 2 分钟自动到账 · 不成功全额退款',
    announcement: '🎉 新用户首单立减 ¥10！支持 ChatGPT / Claude / Gemini / Grok / Suno 全系列，下单后 2 分钟内自动到账。',
    contactInfo: '客户经理微信：your_wechat_id ｜ 邮箱：service@example.com ｜ 工作时间 9:00–24:00',
    heroStats: { users: '10万+', orders: '38万+', rate: '99.6%' },
    commissionRate: 0.1,
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
  await seedCoupons();
  await seedSettings();
  console.log('种子数据初始化完成。');
}

module.exports = { run };
