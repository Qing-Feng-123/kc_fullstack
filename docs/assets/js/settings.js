/* ============================================================
   settings.js — 档案室设定（所有页面共用）
   ============================================================
   缓存策略（图片长驻 + 定期回源）：
     · 设定 JSON 存 localStorage（kc_settings_cache_v1），TTL 6 小时
     · 图片本体由 Service Worker（sw.js）Cache Storage 长驻缓存，
       切换页面 / 刷新均不重新请求网络
     · 缓存过期（或上传/清除/改名）后才回源后端同步一次
   面板功能：
     · 提督名 / 司令部名称 输入保存（存后端 user_settings）
     · 头像 / 中央框背景 / 全局背景 上传（同名覆盖）与清除（恢复默认）
     · 上传前本地预览，横版横显、纵版竖显
   ============================================================ */

(function () {
  const $ = id => document.getElementById(id);
  const CACHE_KEY = 'kc_settings_cache_v1';
  const TTL_MS = 2 * 60 * 1000;              // 2 分钟回源一次
  const IMG_CACHE = 'kc-user-assets-v1';     // 与 sw.js 保持一致

  /* ---------------- Service Worker 注册（图片长驻缓存） ---------------- */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  /* ---------------- 本地缓存读写 ---------------- */
  function readCache() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && c.data && (Date.now() - c.ts) < TTL_MS) return c.data;
    } catch (e) {}
    return null;
  }
  function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch (e) {}
  }

  /* ---------------- 图片缓存整理：清掉已更换/已清除的旧图 ---------------- */
  async function syncImageCache(s) {
    if (!('caches' in window)) return;
    try {
      const keep = [s.avatar_url, s.panel_bg_url, s.page_bg_url].filter(Boolean);
      const c = await caches.open(IMG_CACHE);
      const reqs = await c.keys();
      await Promise.all(reqs.map(r => {
        const base = r.url.split('?')[0];
        return keep.some(u => base === u) ? null : c.delete(r);
      }));
      // 预热当前图片（无网络时使用缓存，sw.js 拦截）
      keep.forEach(u => fetch(u).catch(() => {}));
    } catch (e) {}
  }

  /* ---------------- 设定应用 ---------------- */
  // 缓存刷新：后端同名覆盖后 URL 不变，附加版本参数强制加载最新图
  function bust(url, ver) {
    if (!url) return url;
    return url + (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(ver || Date.now());
  }

  function applySettings(s) {
    if (!s) return;
    const ver = s.updated_at || Date.now();
    // 左上角 brand：头像 + 提督名
    const icon = $('brandIcon'), text = $('brandText');
    if (text) text.textContent = s.display_name || '聯合艦隊';
    if (icon) {
      if (s.avatar_url) {
        icon.innerHTML = `<img class="brand-avatar" src="${bust(s.avatar_url, ver)}" alt="avatar">`;
      } else {
        icon.textContent = '⚓';
      }
    }
    // 首页司令部标题
    const hq = document.querySelector('.header h1');
    if (hq) hq.textContent = s.hq_name || '聯合艦隊司令部';
    // 首页中央框背景
    const header = document.querySelector('.header');
    if (header) {
      let layer = header.querySelector('.panel-bg');
      if (!layer) {
        layer = document.createElement('div');
        layer.className = 'panel-bg';
        header.prepend(layer);
      }
      if (s.panel_bg_url) {
        document.documentElement.style.setProperty('--user-panel-bg', `url("${bust(s.panel_bg_url, ver)}")`);
        header.classList.add('has-panel-bg');
      } else {
        header.classList.remove('has-panel-bg');
      }
    }
    // 全局背景（所有页面一致）
    if (s.page_bg_url) {
      document.documentElement.style.setProperty('--user-page-bg', `url("${bust(s.page_bg_url, ver)}")`);
      document.body.classList.add('has-page-bg');
    } else {
      document.body.classList.remove('has-page-bg');
    }
  }

  let currentSettings = null;

  async function loadSettings() {
    // 1. 本地缓存新鲜 → 直接用，不发请求（切页/刷新不重载）
    const cached = readCache();
    if (cached) {
      currentSettings = cached;
      applySettings(cached);
      return;
    }
    // 2. 过期或首次 → 回源同步一次
    await refreshSettings();
  }

  async function refreshSettings() {
    try {
      currentSettings = await KC_API.getSettings();
      writeCache(currentSettings);
      applySettings(currentSettings);
      syncImageCache(currentSettings);
    } catch (e) {
      // 后端未就绪或鉴权失败时静默降级为默认外观
      console.warn('設定読込失敗:', e.message);
    }
  }

  /* ---------------- 预览：横版横显 / 纵版竖显 ---------------- */
  function showPreview(box, src, isAvatar) {
    box.classList.remove('landscape', 'portrait');
    if (isAvatar) {
      box.innerHTML = `<img src="${src}" alt="preview">`;
      return;
    }
    const img = new Image();
    img.onload = () => {
      box.classList.add(img.naturalWidth >= img.naturalHeight ? 'landscape' : 'portrait');
    };
    img.src = src;
    box.innerHTML = '';
    box.appendChild(img);
  }
  function clearPreview(box, isAvatar) {
    box.classList.remove('landscape', 'portrait');
    box.innerHTML = `<span class="ph">― ${isAvatar ? '頭像' : '背景'}未設定 ―</span>`;
  }

  /* ---------------- 设定面板 ---------------- */
  function openPanel() {
    if ($('kcSettingsOverlay')) return;
    const s = currentSettings || {};
    const esc = v => String(v || '').replace(/"/g, '&quot;');
    const overlay = document.createElement('div');
    overlay.className = 'kc-modal-overlay';
    overlay.id = 'kcSettingsOverlay';
    overlay.innerHTML = `
      <div class="kc-settings-panel">
        <div class="kc-settings-head">
          <h2>檔 案 室 設 定</h2>
          <button class="kc-settings-close" id="kcClose">✕</button>
        </div>

        <!-- 上部：提督名 / 司令部名 / 头像 -->
        <div class="kc-sec">
          <div class="kc-sec-title">提督名 ・ 司令部名 ・ 头像</div>
          <div class="kc-field-row">
            <input class="kc-input" id="kcName" maxlength="24"
                   placeholder="提督名（左上角の文字）" value="${esc(s.display_name)}">
          </div>
          <div class="kc-field-row" style="margin-top:8px;">
            <input class="kc-input" id="kcHq" maxlength="24"
                   placeholder="司令部名（首頁中央の大標題）" value="${esc(s.hq_name)}">
            <button class="kc-btn primary" id="kcSaveName">保存</button>
          </div>
          <div class="kc-status" id="kcNameStatus"></div>
          <div class="kc-field-row" style="margin-top:10px;">
            <button class="kc-btn" id="kcPickAvatar">头像を選択…</button>
            <button class="kc-btn danger" id="kcClearAvatar">清除</button>
            <input type="file" id="kcAvatarFile" accept="image/*" hidden>
          </div>
          <div class="kc-preview avatar" id="kcAvatarPreview"></div>
          <div class="kc-status" id="kcAvatarStatus"></div>
        </div>

        <!-- 中部：首页中央框背景 -->
        <div class="kc-sec">
          <div class="kc-sec-title">中央パネル背景（首頁の司令部抬头）</div>
          <div class="kc-field-row">
            <button class="kc-btn" id="kcPickPanel">画像を選択…</button>
            <button class="kc-btn danger" id="kcClearPanel">清除</button>
            <input type="file" id="kcPanelFile" accept="image/*" hidden>
          </div>
          <div class="kc-preview" id="kcPanelPreview"></div>
          <div class="kc-status" id="kcPanelStatus"></div>
        </div>

        <!-- 下部：全局背景 -->
        <div class="kc-sec">
          <div class="kc-sec-title">全局背景（全ページ共通）</div>
          <div class="kc-field-row">
            <button class="kc-btn" id="kcPickPage">画像を選択…</button>
            <button class="kc-btn danger" id="kcClearPage">清除</button>
            <input type="file" id="kcPageFile" accept="image/*" hidden>
          </div>
          <div class="kc-preview" id="kcPagePreview"></div>
          <div class="kc-status" id="kcPageStatus"></div>
          <div class="kc-hint">画像は全て后端（Supabase）に保存され、再上載時は同名で上書きされます。<br>画像は端末に長期キャッシュされ、定期的に后端と同期されます。</div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // 初始化预览（按当前后端设定；带缓存刷新参数，永远显示最新）
    const ver = s.updated_at || Date.now();
    s.avatar_url ? showPreview($('kcAvatarPreview'), bust(s.avatar_url, ver), true) : clearPreview($('kcAvatarPreview'), true);
    s.panel_bg_url ? showPreview($('kcPanelPreview'), bust(s.panel_bg_url, ver), false) : clearPreview($('kcPanelPreview'), false);
    s.page_bg_url ? showPreview($('kcPagePreview'), bust(s.page_bg_url, ver), false) : clearPreview($('kcPagePreview'), false);

    // 关闭
    $('kcClose').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // 提督名 + 司令部名保存（存后端，成功后回源刷新）
    $('kcSaveName').addEventListener('click', async () => {
      const st = $('kcNameStatus');
      st.className = 'kc-status'; st.textContent = '同期中…';
      try {
        await KC_API.updateProfile({
          display_name: $('kcName').value.trim(),
          hq_name: $('kcHq').value.trim()
        });
        await refreshSettings();
        st.className = 'kc-status ok'; st.textContent = '✓ 同期完了';
      } catch (e) {
        st.className = 'kc-status err'; st.textContent = '保存失敗: ' + e.message;
      }
    });

    // 图片上传：本地预览 → 后端上传（覆盖）→ 回源刷新
    const bindUpload = (pickId, fileId, previewId, statusId, field, isAvatar) => {
      $(pickId).addEventListener('click', () => $(fileId).click());
      $(fileId).addEventListener('change', async () => {
        const file = $(fileId).files[0];
        if (!file) return;
        const st = $(statusId);
        const reader = new FileReader();
        reader.onload = () => showPreview($(previewId), reader.result, isAvatar);
        reader.readAsDataURL(file);
        st.className = 'kc-status'; st.textContent = '同期中…';
        try {
          await KC_API.uploadAsset(field, file);
          await refreshSettings();
          const url = currentSettings[field + '_url'];
          if (url) showPreview($(previewId), bust(url, currentSettings.updated_at), isAvatar);
          st.className = 'kc-status ok'; st.textContent = '✓ 同期完了（前の画像は上書き）';
        } catch (e) {
          st.className = 'kc-status err'; st.textContent = '保存失敗: ' + e.message;
        }
        $(fileId).value = '';
      });
    };
    bindUpload('kcPickAvatar', 'kcAvatarFile', 'kcAvatarPreview', 'kcAvatarStatus', 'avatar', true);
    bindUpload('kcPickPanel', 'kcPanelFile', 'kcPanelPreview', 'kcPanelStatus', 'panel_bg', false);
    bindUpload('kcPickPage', 'kcPageFile', 'kcPagePreview', 'kcPageStatus', 'page_bg', false);

    // 图片清除：后端删除 → 回源刷新 → 恢复默认外观
    const bindClear = (btnId, previewId, statusId, field, isAvatar) => {
      $(btnId).addEventListener('click', async () => {
        if (!confirm('この画像を清除しますか？（元の表示に戻ります）')) return;
        const st = $(statusId);
        st.className = 'kc-status'; st.textContent = '清除中…';
        try {
          await KC_API.clearAsset(field);
          await refreshSettings();
          clearPreview($(previewId), isAvatar);
          st.className = 'kc-status ok'; st.textContent = '✓ 清除しました';
        } catch (e) {
          st.className = 'kc-status err'; st.textContent = '清除失敗: ' + e.message;
        }
      });
    };
    bindClear('kcClearAvatar', 'kcAvatarPreview', 'kcAvatarStatus', 'avatar', true);
    bindClear('kcClearPanel', 'kcPanelPreview', 'kcPanelStatus', 'panel_bg', false);
    bindClear('kcClearPage', 'kcPagePreview', 'kcPageStatus', 'page_bg', false);
  }

  /* ---------------- 启动 ---------------- */
  document.addEventListener('click', e => {
    if (e.target && e.target.id === 'btnSettings') openPanel();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSettings);
  } else {
    loadSettings();
  }
})();
