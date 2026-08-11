/* ============================================================
   api.js — 前后端接口层（唯一与后端通信的文件）
   ============================================================
   新增后端接口时，只改这一个文件：
     1. 在 CONFIG.ENDPOINTS 里登记 endpoint 名
     2. 在下面新增一个对应的 fetch 函数
   页面脚本（home.js / resources.js …）只调用这里暴露的
   KC_API.* 方法，不直接写 fetch / URL / Header。
   ============================================================ */

const CONFIG = {
  // Supabase Edge Functions 网关
  API_BASE: 'https://gzryvfrzkfpwayfybnkp.supabase.co/functions/v1',
  // 每个后端接口的相对路径
  ENDPOINTS: {
    queryFleet: '/kc-query-fleet',
    queryBuilds: '/kc-query-builds',
    queryQuests: '/kc-query-quests',
    userSettings: '/kc-user-settings',
  },
  // 优先读 localStorage 里用户覆盖的 key，否则用默认值
  API_KEY: localStorage.getItem('kc_api_key') || 'kc_qingfeng_20260807_abc123'
};

/** 内部：统一请求封装（鉴权、错误处理） */
async function _kcGet(endpoint, params = {}) {
  const url = new URL(CONFIG.API_BASE + CONFIG.ENDPOINTS[endpoint]);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + CONFIG.API_KEY }
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${t.slice(0, 120)}`);
  }
  return res.json();
}

/** 内部：POST 封装（body 为 FormData 或 JSON 对象） */
async function _kcPost(endpoint, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(CONFIG.API_BASE + CONFIG.ENDPOINTS[endpoint], {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + CONFIG.API_KEY,
      ...(isForm ? {} : { 'Content-Type': 'application/json' })
    },
    body: isForm ? body : JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${t.slice(0, 120)}`);
  }
  return res.json();
}

/* ---------------- 对外接口：页面只使用这个对象 ---------------- */
const KC_API = {
  /**
   * 查询舰队编成
   * @param {number} fleetNo 舰队编号 1-4
   * @returns {Promise<{ships: Array, updated_at: string}>}
   */
  getFleet(fleetNo) {
    return _kcGet('queryFleet', { fleet_no: fleetNo });
  },

  /**
   * 查询建造记录与资源消耗
   * @param {string} date 东京日期 YYYY-MM-DD（当日记录）
   * @param {number} days 消耗聚合天数（1/7/30）
   * @returns {Promise<{date, days, records: Array, daily: Array}>}
   */
  getBuilds(date, days = 30) {
    const params = { days };
    if (date) params.date = date;
    return _kcGet('queryBuilds', params);
  },

  /**
   * 查询任务快照（questlist_raw 全量、按 api_no 升序，无历史实时刷新）
   * @returns {Promise<{quests: Array, count: number, updated_at: string|null}>}
   */
  getQuests() {
    return _kcGet('queryQuests');
  },

  /**
   * 读取个人设定（提督名 / 头像 / 中央框背景 / 全局背景，图片均存后端）
   * @returns {Promise<{display_name, avatar_url, panel_bg_url, page_bg_url, updated_at}>}
   */
  getSettings() {
    return _kcGet('userSettings');
  },

  /**
   * 更新提督名 / 司令部名（保存到后端 user_settings 表）
   * @param {{display_name?: string, hq_name?: string}} profile
   */
  updateProfile(profile) {
    return _kcPost('userSettings', profile);
  },

  /**
   * 清除图片资产（后端删除 Storage 文件并置空 URL，恢复默认外观）
   * @param {'avatar'|'panel_bg'|'page_bg'} field
   */
  clearAsset(field) {
    return _kcPost('userSettings', { clear_field: field });
  },

  /**
   * 上传图片资产到后端（Supabase Storage，同名覆盖）
   * @param {'avatar'|'panel_bg'|'page_bg'} field 资产类型
   * @param {File} file 图片文件
   * @returns {Promise<{field, url}>}
   */
  uploadAsset(field, file) {
    const fd = new FormData();
    fd.append('field', field);
    fd.append('file', file);
    return _kcPost('userSettings', fd);
  },
};
