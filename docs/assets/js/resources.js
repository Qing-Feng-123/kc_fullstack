/* ============================================================
   resources.js — 资源页逻辑
   依赖：api.js（KC_API）、style.css
   结构：
     - 顶部下拉菜单（RES_VIEWS 登记视图，第一项：建造消耗）
     - 建造消耗视图：日历（东京时间）+ 四个柱形图 + 当日建造记录
   ============================================================ */

const $ = id => document.getElementById(id);
const TOKYO_OFFSET_MS = 9 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** 当前东京日期 YYYY-MM-DD */
function tokyoToday() {
  return new Date(Date.now() + TOKYO_OFFSET_MS).toISOString().slice(0, 10);
}
/** ISO 时间 → 东京时分 HH:MM */
function tokyoHM(iso) {
  if (!iso) return '―';
  const d = new Date(new Date(iso).getTime() + TOKYO_OFFSET_MS);
  return d.toISOString().slice(11, 16);
}

/* ================= 视图注册（下拉菜单） =================
   新增资源类目：在数组末尾追加 { id, label, show() } 即可。 */
const RES_VIEWS = [
  { id: 'build', label: '建造消耗', show: () => { $('viewBuild').style.display = ''; loadBuildView(); } },
];

function initMenu() {
  const sel = $('resMenu');
  // <option> 已在 HTML 中按 RES_VIEWS 顺序写好，两者需保持一致
  sel.addEventListener('change', () => switchView(sel.value));
  switchView(sel.value);
}
function switchView(id) {
  const view = RES_VIEWS.find(v => v.id === id) || RES_VIEWS[0];
  // 目前只有一个视图；多视图时在此统一隐藏再显示
  view.show();
}

function setStatus(msg, isErr = false) {
  const el = $('resStatus');
  el.textContent = msg;
  el.className = 'status-line' + (isErr ? ' err' : '');
}

/* ================= 建造消耗视图 ================= */
const buildState = {
  selectedDate: tokyoToday(),   // 日历点选的日期（东京）
  calYear: 0, calMonth: 0,      // 日历当前展示的年/月
  daily: [],                    // 近30天消耗聚合（KC_API.getBuilds）
  records: [],                  // 选中日期建造记录
  chartRanges: { fuel: 7, ammo: 7, steel: 7, bauxite: 7 },  // 每个图的视图范围
};
{
  const [y, m] = buildState.selectedDate.split('-').map(Number);
  buildState.calYear = y; buildState.calMonth = m;
}

async function loadBuildView() {
  setStatus('電文受信中…');
  try {
    const data = await KC_API.getBuilds(buildState.selectedDate, 30);
    buildState.daily = data.daily || [];
    buildState.records = data.records || [];
    setStatus('');
    renderCalendar();
    renderCharts();
    renderBuildRecords();
  } catch (e) {
    setStatus('受信失敗: ' + e.message, true);
  }
}

/* ---------------- 日历 ---------------- */
const WEEKDAY_OFFSET = d => (d.getDay() + 6) % 7;  // 周一为一周之首

function renderCalendar() {
  // 年/月选择器（首次填充）
  const yearSel = $('calYear'), monthSel = $('calMonth');
  const today = tokyoToday();
  const curYear = Number(today.slice(0, 4));
  if (!yearSel.options.length) {
    for (let y = curYear - 3; y <= curYear + 1; y++) {
      yearSel.add(new Option(`${y}年`, y));
    }
    for (let m = 1; m <= 12; m++) {
      monthSel.add(new Option(`${m}月`, m));
    }
    yearSel.addEventListener('change', () => { buildState.calYear = +yearSel.value; renderCalendar(); });
    monthSel.addEventListener('change', () => { buildState.calMonth = +monthSel.value; renderCalendar(); });
    $('calPrev').addEventListener('click', () => shiftMonth(-1));
    $('calNext').addEventListener('click', () => shiftMonth(1));
  }
  yearSel.value = buildState.calYear;
  monthSel.value = buildState.calMonth;

  // 有记录日期集合（来自近30天聚合）
  const recordDays = new Set(buildState.daily.filter(d => d.count > 0).map(d => d.date));

  const first = new Date(Date.UTC(buildState.calYear, buildState.calMonth - 1, 1));
  const daysInMonth = new Date(Date.UTC(buildState.calYear, buildState.calMonth, 0)).getUTCDate();
  const lead = WEEKDAY_OFFSET(first);   // 月初前补几个上月日期
  const prevDays = new Date(Date.UTC(buildState.calYear, buildState.calMonth - 1, 0)).getUTCDate();

  const cells = [];
  for (let i = lead - 1; i >= 0; i--) {
    cells.push({ day: prevDays - i, other: true, date: shiftDateStr(first, -(i + 1)) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${buildState.calYear}-${String(buildState.calMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, other: false, date });
  }
  let offset = daysInMonth;   // 下月1日相对月初的偏移
  while (cells.length % 7 !== 0) {
    const date = shiftDateStr(first, offset++);
    cells.push({ day: +date.slice(8, 10), other: true, date });
  }

  let html = '';
  for (let w = 0; w < cells.length / 7; w++) {
    html += '<tr>';
    for (const c of cells.slice(w * 7, w * 7 + 7)) {
      const cls = ['cal-day'];
      if (c.other) cls.push('other-month');
      if (c.date === today) cls.push('today');
      if (c.date === buildState.selectedDate) cls.push('selected');
      const hasRec = !c.other && recordDays.has(c.date);
      html += `<td><span class="${cls.join(' ')}" data-date="${c.date}" data-other="${c.other}">${c.day}<span class="dot ${hasRec ? '' : 'none'}"></span></span></td>`;
    }
    html += '</tr>';
  }
  $('calBody').innerHTML = html;

  $('calBody').querySelectorAll('.cal-day').forEach(el => {
    el.addEventListener('click', () => {
      const date = el.dataset.date;
      buildState.selectedDate = date;
      if (el.dataset.other === 'true') {
        // 点了上月/下月的日子：日历跟着跳过去
        buildState.calYear = +date.slice(0, 4);
        buildState.calMonth = +date.slice(5, 7);
      }
      loadBuildView();
    });
  });
}

function shiftDateStr(firstOfMonth, offsetDays) {
  const d = new Date(firstOfMonth.getTime() + offsetDays * DAY_MS);
  return d.toISOString().slice(0, 10);
}
function shiftMonth(delta) {
  let m = buildState.calMonth + delta;
  let y = buildState.calYear;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }
  buildState.calYear = y; buildState.calMonth = m;
  renderCalendar();
}

/* ---------------- 四个小柱形图 ---------------- */
const CHARTS = [
  { key: 'fuel',    label: '燃料' },
  { key: 'steel',   label: '鋼材' },
  { key: 'ammo',    label: '弾薬' },
  { key: 'bauxite', label: 'ボーキ' },
];
// 布局顺序：第一列 油/弹，第二列 钢/铝 → DOM 顺序 油、钢、弹、铝 由 CSS grid 两列排列
const RANGE_OPTIONS = [{ d: 1, label: '当日' }, { d: 7, label: '7日' }, { d: 30, label: '30日' }];

function renderCharts() {
  const grid = $('chartsGrid');
  // 首列 燃料/弾薬，次列 鋼材/ボーキ
  const order = ['fuel', 'steel', 'ammo', 'bauxite'];
  grid.innerHTML = order.map(key => {
    const c = CHARTS.find(x => x.key === key);
    const range = buildState.chartRanges[key];
    return `
      <div class="mini-chart">
        <div class="mini-chart-head">
          <span class="mini-chart-title">${c.label}</span>
          <span class="range-switch">
            ${RANGE_OPTIONS.map(o => `<button class="range-btn ${range === o.d ? 'active' : ''}" data-key="${key}" data-d="${o.d}">${o.label}</button>`).join('')}
          </span>
        </div>
        ${drawBars(buildState.daily.slice(-range), key)}
      </div>`;
  }).join('');

  grid.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      buildState.chartRanges[btn.dataset.key] = +btn.dataset.d;
      renderCharts();
    });
  });
}

function drawBars(rows, key) {
  const max = Math.max(...rows.map(r => r[key]), 0);
  if (max === 0) return '<div class="mini-chart-empty">― 記録無シ ―</div>';
  const W = 220, H = 90, padB = 14, padT = 8;
  const n = rows.length;
  const bw = Math.min(18, (W - 8) / n - 3);
  const gap = (W - 8) / n;
  let bars = '';
  rows.forEach((r, i) => {
    const h = (H - padB - padT) * (r[key] / max);
    const x = 4 + i * gap + (gap - bw) / 2;
    const y = H - padB - h;
    const isSelected = r.date === buildState.selectedDate;
    const fill = isSelected ? '#8a7226' : '#9c8a55';
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${Math.max(h, 0.5).toFixed(1)}" fill="${fill}" opacity="${r[key] > 0 ? 1 : 0.25}"/>`;
    if (n <= 7 || (n <= 30 && i % 5 === 0)) {
      bars += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 3}" text-anchor="middle" fill="#8a7b5c" font-size="8">${r.date.slice(5).replace('-', '/')}</text>`;
    }
    if (r[key] > 0 && n <= 7) {
      bars += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="middle" fill="#6e5f45" font-size="8">${r[key]}</text>`;
    }
  });
  return `<svg viewBox="0 0 ${W} ${H}">${bars}</svg>`;
}

/* ---------------- 当日建造记录 ---------------- */
function renderBuildRecords() {
  const recs = buildState.records;
  $('buildDateLabel').innerHTML = `選択日：<b>${buildState.selectedDate}</b>（東京時間）　建造 <b>${recs.length}</b> 回`;
  if (recs.length === 0) {
    $('buildRecords').innerHTML = '<div class="empty-slot">― 当日ノ建造記録無シ ―</div>';
    return;
  }
  const row = r => `
    <tr>
      <td><span class="build-type-badge ${r.build_type === 'large' ? 'bt-large' : 'bt-normal'}">${r.build_type === 'large' ? '大型建造' : '普通建造'}</span></td>
      <td>${r.input_fuel ?? '―'}</td>
      <td>${r.input_ammo ?? '―'}</td>
      <td>${r.input_steel ?? '―'}</td>
      <td>${r.input_bauxite ?? '―'}</td>
      <td class="${r.speedup ? 'speedup-yes' : 'speedup-no'}">${r.speedup ? '使用' : '未使用'}</td>
      <td>${tokyoHM(r.completed_at)}</td>
      <td class="build-result">${r.output_ship_name || (r.output_ship_id ? `ID:${r.output_ship_id}` : '―')}</td>
    </tr>`;
  $('buildRecords').innerHTML = `
    <table class="build-table">
      <thead><tr>
        <th>建造类型</th><th>油</th><th>弹</th><th>钢</th><th>铝</th>
        <th>高速建材</th><th>完成时间</th><th>建造结果</th>
      </tr></thead>
      <tbody>${recs.map(row).join('')}</tbody>
    </table>`;
}

/* ================= 启动 ================= */
initMenu();
