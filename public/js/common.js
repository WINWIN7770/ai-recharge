// 公共工具：API 请求、提示、导航栏渲染、状态映射
const API = {
  async req(method, url, body, isForm) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body) {
      if (isForm) {
        opts.body = body; // FormData
      } else {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(url, opts);
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
    return data;
  },
  get(url) { return this.req('GET', url); },
  post(url, body, isForm) { return this.req('POST', url, body, isForm); },
  put(url, body) { return this.req('PUT', url, body); },
  del(url) { return this.req('DELETE', url); },
};

function toast(msg, type = '') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'toast ' + type;
  // 触发动画
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}

const STATUS_MAP = {
  pending: { text: '待支付', cls: 'badge-pending' },
  paid: { text: '已支付·待处理', cls: 'badge-paid' },
  processing: { text: '处理中', cls: 'badge-processing' },
  completed: { text: '已完成', cls: 'badge-completed' },
  cancelled: { text: '已取消', cls: 'badge-cancelled' },
  refunded: { text: '已退款', cls: 'badge-refunded' },
};
function statusBadge(s) {
  const m = STATUS_MAP[s] || { text: s, cls: 'badge-refunded' };
  return `<span class="badge ${m.cls}">${m.text}</span>`;
}

const CATEGORY_MAP = {
  plus: { text: 'Plus 会员', icon: '⚡' },
  pro: { text: 'Pro 专业版', icon: '🚀' },
  max: { text: 'Max 旗舰版', icon: '💎' },
  team: { text: 'Team 团队版', icon: '👥' },
  advanced: { text: 'Advanced', icon: '✨' },
  api: { text: 'API 额度', icon: '🔌' },
  gift: { text: '礼品卡', icon: '🎁' },
  id: { text: 'Apple ID', icon: '🍎' },
  other: { text: '其他', icon: '📦' },
};

// 品牌分组（首页 Tab 与商品归类）
const BRAND_MAP = {
  gpt:    { text: 'ChatGPT', icon: '🟢', color: '#10a37f', tagline: 'OpenAI 旗舰模型，智能对话与创意助手' },
  claude: { text: 'Claude',  icon: '🟣', color: '#d97757', tagline: 'Anthropic 顶尖模型，长文本分析专家' },
  gemini: { text: 'Gemini',  icon: '🔵', color: '#4285f4', tagline: 'Google 原生多模态，深度集成生态' },
  grok:   { text: 'Grok',    icon: '⚫', color: '#111827', tagline: 'xAI 实时资讯模型，幽默风趣' },
  suno:   { text: 'Suno',    icon: '🎵', color: '#8b5cf6', tagline: 'AI 音乐生成平台，创作无限旋律' },
  apple:  { text: 'Apple ID', icon: '🍎', color: '#374151', tagline: '免费海外账号，畅享全球资源' },
};

const DELIVERY_MAP = {
  link: { text: '专属升级链接', icon: '🔗' },
  card: { text: '卡密秒发', icon: '⚡' },
  manual: { text: '人工代充', icon: '🛠️' },
};

function money(n) { return '¥' + Number(n || 0).toFixed(2); }
function fmtDate(s) { return s ? new Date(s).toLocaleString('zh-CN') : '-'; }
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 获取当前登录用户（无则 null）
async function fetchMe() {
  try {
    const { user } = await API.get('/api/auth/me');
    return user;
  } catch {
    return null;
  }
}

// 渲染前台导航栏
async function renderNavbar(active) {
  const user = await fetchMe();
  let settings = {};
  try { settings = (await API.get('/api/settings')).settings; } catch {}
  const siteName = settings.siteName || 'GPT 代充小站';
  const navEl = document.getElementById('navbar');
  if (!navEl) return user;
  const userArea = user
    ? `<span class="muted">你好，${escapeHtml(user.username)}</span>
       ${user.role === 'admin' ? '<a href="/admin/">管理后台</a>' : ''}
       <a href="/orders.html">我的订单</a>
       <button class="btn btn-sm btn-ghost" onclick="logout()">退出</button>`
    : `<a href="/login.html">登录</a><a href="/register.html" class="btn btn-sm">注册</a>`;
  navEl.innerHTML = `
    <div class="navbar-inner">
      <a href="/" class="brand"><span class="logo">◆</span>${escapeHtml(siteName)}</a>
      <div class="nav-links">
        <a href="/">首页</a>
        <a href="/query.html">订单查询</a>
        <a href="/promote.html">推广赚钱</a>
        <a href="/orders.html">我的订单</a>
        <div class="nav-user">${userArea}</div>
      </div>
    </div>`;
  return user;
}

async function logout() {
  await API.post('/api/auth/logout');
  toast('已退出登录', 'ok');
  setTimeout(() => (location.href = '/'), 600);
}

// 要求登录，否则跳转
async function requireLogin(redirect) {
  const user = await fetchMe();
  if (!user) {
    location.href = '/login.html?next=' + encodeURIComponent(redirect || location.pathname);
    return null;
  }
  return user;
}
