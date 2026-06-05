/**
 * ChatGPT 代充平台 - 服务入口
 */
const fs = require('fs');
const path = require('path');

// 极简 .env 加载（无需依赖）：存在 .env 时把其中变量注入 process.env
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
})();

const express = require('express');
const cookieParser = require('cookie-parser');

const { run: seed } = require('./src/seed');
const db = require('./src/db');
const { UPLOAD_DIR } = db;

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// 部署在 Nginx / 负载均衡 / PaaS 反向代理之后时，信任代理以正确识别 HTTPS 与客户端 IP
app.set('trust proxy', 1);

// 限额放宽以容纳云模式下以 base64 形式提交的收款码/商品图（上传上限 5MB → base64 约 6.7MB）
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use(cookieParser());

// 静态资源：前端页面
app.use(express.static(path.join(__dirname, 'public')));
// 上传文件（收款码、商品图、支付凭证）
app.use('/uploads', express.static(UPLOAD_DIR));

// API 路由
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/products', require('./src/routes/products'));
app.use('/api/settings', require('./src/routes/settings'));
app.use('/api/orders', require('./src/routes/orders'));
app.use('/api/account', require('./src/routes/account'));
app.use('/api/admin', require('./src/routes/admin'));

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// SEO：robots.txt（自动识别当前域名）
app.get('/robots.txt', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`);
});

// SEO：sitemap.xml（自动识别当前域名，含公开页面）
app.get('/sitemap.xml', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const pages = ['/', '/login.html', '/register.html'];
  const urls = pages
    .map((p) => `  <url><loc>${base}${p}</loc><changefreq>daily</changefreq><priority>${p === '/' ? '1.0' : '0.6'}</priority></url>`)
    .join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
});

// 管理后台入口（默认指向 admin/index.html）
app.get('/admin', (req, res) => res.redirect('/admin/'));

// 错误处理
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

// 先连接/载入数据库，再初始化种子数据，最后启动监听
(async function start() {
  try {
    await db.init();
    await seed();
  } catch (e) {
    console.error('启动失败:', e.message);
    process.exit(1);
  }
  app.listen(PORT, HOST, () => {
    console.log('');
    console.log('  ====================================================');
    console.log('   ChatGPT 代充平台已启动');
    console.log(`   存储模式: ${db.USE_MONGO ? 'MongoDB（云端持久）' : '本地 JSON 文件'}`);
    console.log(`   用户端:  http://localhost:${PORT}/`);
    console.log(`   管理端:  http://localhost:${PORT}/admin/`);
    console.log('   默认管理员: admin / admin123');
    console.log('   默认用户:   demo / demo123');
    console.log('  ====================================================');
    console.log('');
  });
})();
