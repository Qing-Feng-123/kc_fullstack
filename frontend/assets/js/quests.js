/* ============================================================
   quests.js — 任务一览页（双语对照版）
   数据来源: KC_API.getQuests() → GET /kc-query-quests
   （questlist_raw 宽表：原文字段 + name_cn/desc_cn/memo_cn 翻译列）

   布局（参照游戏内任务界面）:
     上半 = 纵轴筛选(左) + 横轴筛选(上) + 左右双语列表 + 共享翻页
       · 纵轴: 全 / 遂行中 / Daily / Weekly / Monthly / Once / Others
       · 横轴: 出撃 / 演習 / 遠征 / 工廠 / その他
       · 每页 5 条；左右列表共享同一套筛选与翻页
       · 点击任一侧行 → 两侧同一行同步高亮
     下半 = memo 呈现框（显示选中任务的 memo_cn）
   ============================================================ */

const UNTRANSLATED = '新任务未翻译';
const PAGE_SIZE = 5;   // 与游戏内任务界面一致：每页 5 条

/* 纵轴：value 含义 all=全部 | doing=遂行中(api_state=2) | 数字=api_type */
const V_ITEMS = [
  { value: 'all',   jp: '全',   en: 'All' },
  { value: 'doing', jp: '遂行中', en: 'Doing' },
  { value: '1',     jp: '日',   en: 'Daily' },
  { value: '2',     jp: '週',   en: 'Weekly' },
  { value: '3',     jp: '月',   en: 'Monthly' },
  { value: '4',     jp: '単',   en: 'Once' },
  { value: '5',     jp: '他',   en: 'Others' },
];

/* 横轴：出撃=2 演習=3 遠征=4 工廠=6 その他=其余（編成1/補給入渠5/改装7/その他8） */
const H_ITEMS = [
  { value: '2',     label: '出撃' },
  { value: '3',     label: '演習' },
  { value: '4',     label: '遠征' },
  { value: '6',     label: '工廠' },
  { value: 'other', label: 'その他' },
];

const QUEST_STATES = { 1: '未受領', 2: '遂行中', 3: '達成' };

const state = {
  all: [],
  v: 'all',          // 纵轴当前值
  h: null,           // 横轴当前值（null = 不限）
  page: 1,
  selectedNo: null,  // 当前高亮任务 api_no
};

/* ---------- 纵轴渲染 ---------- */
function renderVFilter() {
  const host = document.getElementById('vFilter');
  host.innerHTML = V_ITEMS.map(it => `
    <div class="vfilter-item ${state.v === it.value ? 'active' : ''}" data-v="${it.value}">
      <span class="vf-jp">${it.jp}</span><span class="vf-en">${it.en}</span>
    </div>`).join('');
  host.querySelectorAll('.vfilter-item').forEach(el => {
    el.addEventListener('click', () => {
      state.v = el.dataset.v;
      state.page = 1;
      renderVFilter();
      renderAll();
    });
  });
}

/* ---------- 横轴渲染 ---------- */
function renderHFilter() {
  const host = document.getElementById('hFilter');
  host.innerHTML = H_ITEMS.map(it => `
    <button class="hfilter-btn ${state.h === it.value ? 'active' : ''}" data-h="${it.value}">${it.label}</button>`
  ).join('');
  host.querySelectorAll('.hfilter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // 再点一次取消横轴筛选
      state.h = (state.h === btn.dataset.h) ? null : btn.dataset.h;
      state.page = 1;
      renderHFilter();
      renderAll();
    });
  });
}

/* ---------- 过滤 + 排序 ---------- */
function matchV(q) {
  if (state.v === 'all') return true;
  if (state.v === 'doing') return q.api_state === 2;   // 遂行中单独成项
  return q.api_type === Number(state.v);
}
function matchH(q) {
  if (state.h === null) return true;
  if (state.h === 'other') return ![2, 3, 4, 6].includes(q.api_category);
  return q.api_category === Number(state.h);
}
function filtered() {
  return state.all
    .filter(matchV)
    .filter(matchH)
    .sort((a, b) => a.api_no - b.api_no);
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------- 行渲染（左右共用结构，内容字段不同） ---------- */
function rowHtml(q, titleKey, detailKey) {
  const sel = q.api_no === state.selectedNo ? ' selected' : '';
  return `
    <div class="quest-row state-${q.api_state}${sel}" data-no="${q.api_no}">
      <div class="qr-top">
        <span class="qr-no">No.${q.api_no}</span>
        <span class="qr-title">${esc(q[titleKey])}</span>
        <span class="qr-badge state-${q.api_state}">${QUEST_STATES[q.api_state] || '?'}</span>
      </div>
      <div class="qr-detail">${esc(q[detailKey])}</div>
    </div>`;
}

function renderAll() {
  const list = filtered();
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (state.page > pages) state.page = pages;
  const slice = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

  const lo = document.getElementById('listOriginal');
  const lt = document.getElementById('listTranslated');
  if (slice.length === 0) {
    const empty = '<div class="quest-empty">― 該当する任務なし ―</div>';
    lo.innerHTML = empty;
    lt.innerHTML = empty;
  } else {
    lo.innerHTML = slice.map(q => rowHtml(q, 'api_title', 'api_detail')).join('');
    lt.innerHTML = slice.map(q => rowHtml(q, 'name_cn', 'desc_cn')).join('');
  }

  // 行点击：两侧同步高亮 + 下方 memo 联动
  document.querySelectorAll('.quest-row[data-no]').forEach(el => {
    el.addEventListener('click', () => {
      const no = Number(el.dataset.no);
      state.selectedNo = (state.selectedNo === no) ? null : no;
      document.querySelectorAll('.quest-row').forEach(r => {
        r.classList.toggle('selected', Number(r.dataset.no) === state.selectedNo);
      });
      renderMemo();
    });
  });

  renderPager(pages, list.length);
}

function renderPager(pages, total) {
  const host = document.getElementById('questPager');
  let html = `<button data-p="prev" ${state.page <= 1 ? 'disabled' : ''}>◀</button>`;
  for (let p = 1; p <= pages; p++) {
    html += `<button data-p="${p}" class="${p === state.page ? 'active' : ''}">${p}</button>`;
  }
  html += `<button data-p="next" ${state.page >= pages ? 'disabled' : ''}>▶</button>`;
  html += `<span class="pager-info">${state.page}/${pages} 頁 · 全 ${total} 件</span>`;
  host.innerHTML = html;
  host.querySelectorAll('button[data-p]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.p;
      if (v === 'prev') state.page--;
      else if (v === 'next') state.page++;
      else state.page = Number(v);
      renderAll();
    });
  });
}

/* ---------- 下半：memo 呈现框 ---------- */
function renderMemo() {
  const host = document.getElementById('memoContent');
  const q = state.all.find(x => x.api_no === state.selectedNo);
  if (!q) {
    host.innerHTML = '<span class="memo-empty">― 任務を選択せよ ―</span>';
    return;
  }
  const memo = q.memo_cn;
  if (!memo || memo === UNTRANSLATED) {
    host.innerHTML = `<span class="memo-empty">No.${q.api_no} ― ${memo === UNTRANSLATED ? '新任务未翻译' : 'メモなし'} ―</span>`;
    return;
  }
  host.innerHTML = `<span style="color:#6b5013;">No.${q.api_no}</span><br>${esc(memo)}`;
}

/* ---------- 数据加载 ---------- */
async function loadQuests() {
  const status = document.getElementById('questStatus');
  status.textContent = ' 電文受信中… ';
  try {
    const res = await KC_API.getQuests();
    state.all = (res.quests || []).slice().sort((a, b) => a.api_no - b.api_no);
    renderVFilter();
    renderHFilter();
    renderAll();
    renderMemo();
    status.textContent = ` 最終更新: ${res.updated_at ? new Date(res.updated_at).toLocaleString('zh-CN', { hour12: false }) : '―'} · 全 ${res.count} 件 `;
  } catch (e) {
    status.textContent = ' 受信失敗: ' + e.message;
  }
}

document.getElementById('btnQuestRefresh').addEventListener('click', loadQuests);
loadQuests();
