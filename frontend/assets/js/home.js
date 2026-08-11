/* ============================================================
   home.js — 首页（舰队战力报告）页面逻辑
   依赖：api.js（KC_API）、style.css
   页面 DOM 需求见 index.html；本文件不含任何后端地址/鉴权信息。
   ============================================================ */

// ================= 状态 =================
let currentFleet = 1;
let selectedShipId = null;
let fleetCache = {};   // fleet_no -> api响应
let shipNameMap = {};  // api_id -> 自定义名（可选，localStorage）
try { shipNameMap = JSON.parse(localStorage.getItem('kc_ship_names') || '{}'); } catch (e) {}

// ================= 工具 =================
const $ = id => document.getElementById(id);
const posName = ['旗艦', '二番', '三番', '四番', '五番', '六番'];

function condClass(c) {
  if (c >= 50) return 'cond-sparkle';
  if (c >= 40) return 'cond-green';
  if (c >= 30) return 'cond-normal';
  if (c >= 20) return 'cond-orange';
  return 'cond-red';
}
function condText(c) {
  if (c >= 50) return '戦意高揚';
  if (c >= 40) return '士気良好';
  if (c >= 30) return '通常';
  if (c >= 20) return '士気低下';
  return '疲労';
}
function hpClass(now, max) {
  const r = now / max;
  if (r <= 0.25) return 'crit';
  if (r <= 0.5) return 'hurt';
  return '';
}
function shipDisplayName(s) {
  // 优先级：localStorage 自定义名 > 后端中文名 > 后端日文名 > 图鉴编号兜底
  return shipNameMap[s.api_id] || s.api_name_cn || s.api_name
    || `図鑑No.${s.api_sortno ?? '?'} （ID:${s.api_id}）`;
}
// 速度/射程
const SOKU = { 0: '陆上基地', 5: '低速', 10: '高速', 15: '高速+', 20: '最速' };
const LENG = { 1: '短', 2: '中', 3: '长', 4: '超长', 5: '超超长' };

// ================= 数据获取（经 api.js，带页面级缓存） =================
async function fetchFleet(no, force = false) {
  if (fleetCache[no] && !force) return fleetCache[no];
  const data = await KC_API.getFleet(no);
  fleetCache[no] = data;
  return data;
}

function setStatus(msg, isErr = false) {
  const el = $('statusLine');
  el.textContent = msg;
  el.className = 'status-line' + (isErr ? ' err' : '');
}

async function loadFleet(no, force = false) {
  setStatus('電文受信中…');
  try {
    const data = await fetchFleet(no, force);
    setStatus('');
    if (data.updated_at) {
      $('updatedTag').textContent =
        '最終電文受信：' + new Date(data.updated_at).toLocaleString('zh-CN', { hour12: false });
    }
    selectedShipId = null;
    $('shipDetail').innerHTML = '<div class="empty-slot">― 左の艦艇を選択せよ ―</div>';
    renderShipList(data);
    renderFleetSummary(data);
    if (data.ships && data.ships.length > 0) {
      selectShip(data.ships[0].api_id);
    }
  } catch (e) {
    setStatus('受信失敗: ' + e.message, true);
    $('shipList').innerHTML = '<div class="empty-slot">電文受信失敗<br>通信状態を確認せよ</div>';
    $('fleetSummary').innerHTML = '';
  }
}

// ================= 渲染：编成列表 =================
function renderShipList(data) {
  const ships = data.ships || [];
  if (ships.length === 0) {
    $('shipList').innerHTML = '<div class="empty-slot">― 編成データ無シ ―</div>';
    return;
  }
  $('shipList').innerHTML = ships.map((s, i) => `
    <div class="ship-item ${selectedShipId === s.api_id ? 'selected' : ''}" data-ship="${s.api_id}">
      <div class="ship-pos">${i + 1}</div>
      <div>
        <div class="ship-name">${shipDisplayName(s)}</div>
        <div class="ship-meta">
          <span>${posName[i] || ''}艦</span>
          ${s.api_stype_name ? `<span>${s.api_stype_name}</span>` : ''}
          <span class="hp-bar"><span class="hp-fill ${hpClass(s.api_nowhp, s.api_maxhp)}" style="display:block;width:${Math.round(100 * s.api_nowhp / s.api_maxhp)}%"></span></span>
          <span>HP ${s.api_nowhp}/${s.api_maxhp}</span>
          ${s.api_locked ? '<span>🔒</span>' : ''}
        </div>
      </div>
      <div class="ship-right">
        <div class="ship-lv">Lv.${s.api_lv}</div>
        <span class="cond-badge ${condClass(s.api_cond)}">${condText(s.api_cond)} ${s.api_cond}</span>
      </div>
    </div>
  `).join('');

  $('shipList').querySelectorAll('.ship-item').forEach(item => {
    item.addEventListener('click', () => selectShip(parseInt(item.dataset.ship)));
  });
}

function selectShip(id) {
  selectedShipId = id;
  const data = fleetCache[currentFleet];
  $('shipList').querySelectorAll('.ship-item').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.ship) === id);
  });
  const ship = (data.ships || []).find(s => s.api_id === id);
  if (ship) renderShipDetail(ship);
}

// ================= 雷达图 =================
function drawRadar(s) {
  const stats = [
    ['火力', s.api_karyoku_0, s.api_karyoku_1],
    ['雷装', s.api_raisou_0, s.api_raisou_1],
    ['対空', s.api_taiku_0, s.api_taiku_1],
    ['装甲', s.api_soukou_0, s.api_soukou_1],
    ['回避', s.api_kaihi_0, s.api_kaihi_1],
    ['対潜', s.api_taisen_0, s.api_taisen_1],
    ['索敵', s.api_sakuteki_0, s.api_sakuteki_1],
    ['運', s.api_lucky_0, s.api_lucky_1]
  ].map(([name, v, m]) => ({ name, v: v ?? 0, m: m || 100 }));

  const size = 290, c = size / 2, R = 92, step = Math.PI * 2 / 8;
  const pt = (j, r) => {
    const a = j * step - Math.PI / 2;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="max-width:100%">`;

  for (let i = 1; i <= 4; i++) {
    const r = R / 4 * i;
    let p = '';
    for (let j = 0; j < 8; j++) { const [x, y] = pt(j, r); p += `${x},${y} `; }
    svg += `<polygon points="${p}" fill="none" stroke="rgba(74,58,36,0.35)" stroke-width="1"/>`;
  }
  for (let j = 0; j < 8; j++) {
    const [x, y] = pt(j, R);
    svg += `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" stroke="rgba(74,58,36,0.35)"/>`;
  }
  let dp = '';
  for (let j = 0; j < 8; j++) {
    const ratio = Math.min(stats[j].v / stats[j].m, 1);
    const [x, y] = pt(j, R * ratio); dp += `${x},${y} `;
  }
  svg += `<polygon points="${dp}" fill="rgba(140,43,32,0.3)" stroke="#8c2b20" stroke-width="2"/>`;
  for (let j = 0; j < 8; j++) {
    const st = stats[j];
    const ratio = Math.min(st.v / st.m, 1);
    const [x, y] = pt(j, R * ratio);
    svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="#6b5013"/>`;
    const [lx, ly] = pt(j, R + 20);
    svg += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" fill="#6e5f45" font-size="12" font-family="serif">${st.name}</text>`;
    const [vx, vy] = pt(j, R + 34);
    svg += `<text x="${vx}" y="${vy}" text-anchor="middle" dominant-baseline="middle" fill="#77601a" font-size="11" font-weight="bold">${st.v}</text>`;
  }
  svg += '</svg>';
  return svg;
}

// ================= 渲染：详情 =================
function renderShipDetail(s) {
  const statBox = (label, v, m, ky) => `
    <div class="stat-box">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${v ?? '―'}</div>
      <div class="stat-max">/ ${m ?? '―'} ${ky > 0 ? `<span class="modernized">改修+${ky}</span>` : ''}</div>
    </div>`;

  const slots = [s.api_slot_0, s.api_slot_1, s.api_slot_2, s.api_slot_3, s.api_slot_4].slice(0, s.api_slotnum || 5);
  const onslots = [s.api_onslot_0, s.api_onslot_1, s.api_onslot_2, s.api_onslot_3, s.api_onslot_4];

  $('shipDetail').innerHTML = `
    <div style="text-align:center;margin-bottom:6px;">
      <span style="color:var(--brass-hi);font-size:19px;font-weight:700;letter-spacing:0.1em">${shipDisplayName(s)}</span>
      <span style="color:var(--ivory-dim);font-size:12px;margin-left:10px">Lv.${s.api_lv} ／ ${SOKU[s.api_soku] || '―'} ／ 射程${LENG[s.api_leng] || '―'}</span>
    </div>
    <div class="radar-container">${drawRadar(s)}</div>
    <div class="stats-grid">
      ${statBox('火力', s.api_karyoku_0, s.api_karyoku_1, s.api_kyouka_0)}
      ${statBox('雷装', s.api_raisou_0, s.api_raisou_1, s.api_kyouka_1)}
      ${statBox('対空', s.api_taiku_0, s.api_taiku_1, s.api_kyouka_2)}
      ${statBox('装甲', s.api_soukou_0, s.api_soukou_1, s.api_kyouka_3)}
      ${statBox('回避', s.api_kaihi_0, s.api_kaihi_1, 0)}
      ${statBox('対潜', s.api_taisen_0, s.api_taisen_1, s.api_kyouka_5)}
      ${statBox('索敵', s.api_sakuteki_0, s.api_sakuteki_1, 0)}
      ${statBox('運', s.api_lucky_0, s.api_lucky_1, s.api_kyouka_4)}
    </div>
    <div class="dossier">
      <b>兵装槽</b>
      <div class="equip-row">
        ${slots.map((sl, i) => `
          <div class="equip-slot ${sl > 0 ? 'filled' : ''}">
            <span>${sl > 0 ? '装備ID:' + sl : '― 空 ―'}</span>
            ${onslots[i] > 0 ? `<span class="cap">搭載 ${onslots[i]}</span>` : ''}
          </div>`).join('')}
      </div>
      <div style="margin-top:10px;display:flex;gap:18px;flex-wrap:wrap">
        <span>HP <b>${s.api_nowhp}/${s.api_maxhp}</b></span>
        <span>練度 <b>${'★'.repeat(Math.min(s.api_srate || 0, 7)) || '―'}</b></span>
        <span>稀有度 <b>${s.api_backs ?? '―'}</b></span>
        <span>補給 <b>油${s.api_fuel ?? '―'} / 弾${s.api_bull ?? '―'}</b></span>
        <span>状態 <b>${s.api_locked ? '保護鎖定' : '未鎖定'}</b></span>
      </div>
    </div>
  `;
}

// ================= 渲染：舰队总览 =================
function renderFleetSummary(data) {
  const ships = data.ships || [];
  const sum = k => ships.reduce((a, s) => a + (s[k] || 0), 0);
  const sparkle = ships.filter(s => s.api_cond >= 50).length;
  const item = (l, v) => `
    <div class="summary-item">
      <div class="summary-label">${l}</div>
      <div class="summary-value">${v}</div>
    </div>`;
  $('fleetSummary').innerHTML = ships.length === 0 ? '<div class="empty-slot">―</div>' : [
    item('編成隻数', `${ships.length}/6`),
    item('総火力', sum('api_karyoku_0')),
    item('総雷装', sum('api_raisou_0')),
    item('総対空', sum('api_taiku_0')),
    item('総索敵', sum('api_sakuteki_0')),
    item('総耐久', `${sum('api_nowhp')}/${sum('api_maxhp')}`),
    item('平均士気', ships.length ? Math.round(sum('api_cond') / ships.length) : 0),
    item('キラ艦', `${sparkle}隻`),
    item('旗艦練度', 'Lv.' + (ships[0]?.api_lv ?? '―'))
  ].join('');
}

// ================= 事件 =================
$('fleetTabs').querySelectorAll('.fleet-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.fleet-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFleet = parseInt(tab.dataset.fleet);
    loadFleet(currentFleet);
  });
});
$('btnRefresh').addEventListener('click', () => loadFleet(currentFleet, true));

// ================= 启动 =================
loadFleet(1);
