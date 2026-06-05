// 管理后台公共逻辑
const MENU = [
  { href: '/admin/', label: '数据看板', icon: '📊', key: 'dashboard' },
  { href: '/admin/products.html', label: '商品管理', icon: '📦', key: 'products' },
  { href: '/admin/orders.html', label: '订单管理', icon: '🧾', key: 'orders' },
  { href: '/admin/users.html', label: '用户管理', icon: '👤', key: 'users' },
  { href: '/admin/settings.html', label: '站点设置', icon: '⚙️', key: 'settings' },
];

async function initAdmin(activeKey) {
  // 鉴权
  let me = null;
  try { me = (await API.get('/api/auth/me')).user; } catch {}
  if (!me) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); return null; }
  if (me.role !== 'admin') { alert('需要管理员权限'); location.href = '/'; return null; }

  let siteName = 'GPT 代充';
  try { siteName = (await API.get('/api/settings')).settings.siteName || siteName; } catch {}

  document.body.classList.add('admin-body');
  const layout = document.getElementById('adminLayout');
  const sidebar = `
    <aside class="sidebar">
      <div class="logo-area">◆ ${escapeHtml(siteName)}</div>
      <nav>
        ${MENU.map(m => `<a href="${m.href}" class="${m.key === activeKey ? 'active' : ''}"><span>${m.icon} ${m.label}</span></a>`).join('')}
      </nav>
    </aside>`;
  const topbar = `
    <div class="admin-topbar">
      <div><strong id="pageTitle"></strong></div>
      <div class="nav-user">
        <a href="/" target="_blank">查看前台 ↗</a>
        <span class="muted">${escapeHtml(me.username)}</span>
        <button class="btn btn-sm btn-ghost" onclick="logout()">退出</button>
      </div>
    </div>`;
  layout.outerHTML = `
    <div class="admin-layout">
      ${sidebar}
      <div class="admin-main">
        ${topbar}
        <div class="admin-content" id="adminContent">${layout.innerHTML}</div>
      </div>
    </div>`;
  const active = MENU.find(m => m.key === activeKey);
  if (active) document.getElementById('pageTitle').textContent = active.label;
  return me;
}
