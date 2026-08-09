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
    // 示例：以后加资源接口时取消注释并新建对应函数
    // queryResources: '/kc-query-resources',
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

  // 示例：资源页接口（后端就绪后启用）
  // getResources() {
  //   return _kcGet('queryResources');
  // },
};
