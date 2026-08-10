/* ============================================================
   quests.js — 任务一览页
   数据来源: KC_API.getQuests() → GET /kc-query-quests
   （questlist_raw 表，游戏端 script_1.19 实时全量刷新，无历史）
   布局: 左侧 category 多选筛选 / 上方 type 单选筛选 / 底部翻页
   ============================================================ */

const QUEST_CATEGORIES = {
  1: '編成', 2: '出撃', 3: '演習', 4: '遠征',
  5: '補給/入渠', 6: '工廠', 7: '改装', 8: 'その他'
};
const QUEST_TYPES = {
  1: 'デイリー', 2: 'ウィークリー', 3: 'マンスリー', 4: '単発', 5: 'その他'
};
const QUEST_STATES = { 1: '未受領', 2: '遂行中', 3: '達成' };
const PAGE_SIZE = 20;

const state = {
  all: [],            // 全部任务（已按 api_no 升序）
  cats: new Set(),    // 选中的 category（空 = 全部）
  type: 0,            // 选中的 type（0 = 全部）
  page: 1
};

/* ---------- 左侧 category 复选 ---------- */
function renderCatFilter() {
  const host = document.getElementById('catFilter');
  const present = new Set(state.all.map(q => q.api_category));
  const items = Object.entries(QUEST_CATEGORIES)
    .filter(([id]) => present.has(Number(id)))
    .map(([id, label]) => `
      <label class="cat-item">
        <input type="checkbox" data-cat="${id}" ${state.cats.has(Number(id)) ? 'checked' : ''}>
        <span>${label}</span>
      </label>`).join('');
  host.innerHTML = items || '<div class="quest-empty">― なし ―</div>';
  host.querySelectorAll('input[data-cat]').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = Number(cb.dataset.cat);
      cb.checked ? state.cats.add(id) : state.cats.delete(id);
      state.page = 1;
      renderList();
    });
  });
}

/* ---------- 上方 type 单选按钮 ---------- */
function renderTypeFilter() {
  const host = document.getElementById('typeFilter');
  const present = new Set(state.all.map(q => q.api_type));
  let html = `<button class="quest-type-btn ${state.type === 0 ? 'active' : ''}" data-type="0">全部</button>`;
  html += Object.entries(QUEST_TYPES)
    .filter(([id]) => present.has(Number(id)))
    .map(([id, label]) =>
      `<button class="quest-type-btn ${state.type === Number(id) ? 'active' : ''}" data-type="${id}">${label}</button>`
    ).join('');
  host.innerHTML = html;
  host.querySelectorAll('button[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.type = Number(btn.dataset.type);
      state.page = 1;
      renderTypeFilter();
      renderList();
    });
  });
}

/* ---------- 过滤 + 排序 + 分页渲染 ---------- */
function filtered() {
  return state.all
    .filter(q => state.cats.size === 0 || state.cats.has(q.api_category))
    .filter(q => state.type === 0 || q.api_type === state.type)
    .sort((a, b) => a.api_no - b.api_no);
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderList() {
  const list = filtered();
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (state.page > pages) state.page = pages;
  const slice = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

  const host = document.getElementById('questList');
  if (slice.length === 0) {
    host.innerHTML = '<div class="quest-empty">― 該当する任務なし ―</div>';
  } else {
    host.innerHTML = slice.map(q => `
      <div class="quest-row">
        <div class="quest-no">No.${q.api_no}</div>
        <div class="quest-body">
          <div class="quest-title">${esc(q.api_title)}</div>
          <div class="quest-detail">${esc(q.api_detail)}</div>
        </div>
        <div class="quest-badges">
          <span class="quest-badge">${QUEST_CATEGORIES[q.api_category] || '?'}</span>
          <span class="quest-badge">${QUEST_TYPES[q.api_type] || '?'}</span>
          <span class="quest-badge state-${q.api_state}">${QUEST_STATES[q.api_state] || '?'}</span>
        </div>
      </div>`).join('');
  }
  renderPager(pages, list.length);
}

function renderPager(pages, total) {
  const host = document.getElementById('questPager');
  let html = `<button data-p="prev" ${state.page <= 1 ? 'disabled' : ''}>◀</button>`;
  for (let p = 1; p <= pages; p++) {
    if (pages > 9 && Math.abs(p - state.page) > 3 && p !== 1 && p !== pages) {
      if (!html.endsWith('…')) html += '<span class="pager-info">…</span>';
      continue;
    }
    html += `<button data-p="${p}" class="${p === state.page ? 'active' : ''}">${p}</button>`;
  }
  html += `<button data-p="next" ${state.page >= pages ? 'disabled' : ''}>▶</button>`;
  html += `<span class="pager-info">第 ${state.page}/${pages} 頁 · 全 ${total} 件</span>`;
  host.innerHTML = html;
  host.querySelectorAll('button[data-p]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.p;
      if (v === 'prev') state.page--;
      else if (v === 'next') state.page++;
      else state.page = Number(v);
      renderList();
      document.getElementById('questList').scrollTop = 0;
    });
  });
}

/* ---------- 数据加载 ---------- */
async function loadQuests() {
  const status = document.getElementById('questStatus');
  status.textContent = ' 電文受信中… ';
  try {
    const res = await KC_API.getQuests();
    state.all = (res.quests || []).slice().sort((a, b) => a.api_no - b.api_no);
    renderCatFilter();
    renderTypeFilter();
    renderList();
    status.textContent = ` 最終更新: ${res.updated_at ? new Date(res.updated_at).toLocaleString('zh-CN', { hour12: false }) : '―'} · 全 ${res.count} 件 `;
  } catch (e) {
    status.textContent = ' 受信失敗: ' + e.message;
  }
}

document.getElementById('btnQuestRefresh').addEventListener('click', loadQuests);
loadQuests();
