/* ============================================================
   nav.js — 全站顶部导航栏（所有页面共用）
   ============================================================
   用法：页面 <body> 开头放 <div id="siteNav"></div>，
   并在自身页面脚本之前引入本文件。
   新增页面：在 NAV_ITEMS 里加一项即可，无需改其他文件。
   ============================================================ */

const NAV_ITEMS = [
  { id: 'home',      label: '首頁',   href: 'index.html' },
  { id: 'resources', label: '資源',   href: 'resources.html' },
  { id: 'quests',    label: '任务',   href: 'quests.html' },
];

(function renderNav() {
  const host = document.getElementById('siteNav');
  if (!host) return;
  // 当前页：优先用 <body data-page="...">，否则按文件名推断
  const page = document.body.dataset.page
    || (location.pathname.split('/').pop() || 'index.html').replace('.html', '');
  host.className = 'site-nav';
  host.innerHTML =
    '<span class="brand">⚓ 聯合艦隊</span>' +
    NAV_ITEMS.map(it =>
      `<a class="nav-link ${it.id === page ? 'active' : ''}" href="${it.href}">${it.label}</a>`
    ).join('');
})();
