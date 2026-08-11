/* ============================================================
   settings.js — 档案室设定（所有页面共用）
   ============================================================
   功能：
     1. 页面加载后自动从后端读取个人设定（KC_API.getSettings），
        并应用：左上角图标+文字 / 首页中央框背景 / 全局背景。
     2. 右上角齿轮打开设定面板：
        · 提督名输入 + 头像更换（左上角 brand）
        · 首页中央框（司令部抬头）背景图更换
        · 全局背景图更换（切页保持一致）
     3. 所有图片上传均走后端（Supabase Storage，同名覆盖），
        不写入浏览器存储；上传前本地即时预览，
        横版图片横版完整呈现，纵版图片纵版呈现。
   ============================================================ */

(function () {
  const $ = id => document.getElementById(id);

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
    try {
      currentSettings = await KC_API.getSettings();
      applySettings(currentSettings);
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

  /* ---------------- 设定面板 ---------------- */
  function openPanel() {
    if ($('kcSettingsOverlay')) return;
    const s = currentSettings || {};
    const overlay = document.createElement('div');
    overlay.className = 'kc-modal-overlay';
    overlay.id = 'kcSettingsOverlay';
    overlay.innerHTML = `
      <div class="kc-settings-panel">
        <div class="kc-settings-head">
          <h2>檔 案 室 設 定</h2>
          <button class="kc-settings-close" id="kcClose">✕</button>
        </div>

        <!-- 上部：提督名 + 头像 -->
        <div class="kc-sec">
          <div class="kc-sec-title">提督名 ・ 头像変更</div>
          <div class="kc-field-row">
            <input class="kc-input" id="kcName" maxlength="24"
                   placeholder="提督名を入力（左上角の文字）"
                   value="${(s.display_name || '').replace(/"/g, '&quot;')}">
            <button class="kc-btn primary" id="kcSaveName">保存</button>
          </div>
          <div class="kc-status" id="kcNameStatus"></div>
          <div class="kc-field-row" style="margin-top:10px;">
            <button class="kc-btn" id="kcPickAvatar">头像を選択…</button>
            <input type="file" id="kcAvatarFile" accept="image/*" hidden>
          </div>
          <div class="kc-preview avatar" id="kcAvatarPreview">
            ${s.avatar_url ? `<img src="${s.avatar_url}">` : '<span class="ph">― 頭像未設定 ―</span>'}
          </div>
          <div class="kc-status" id="kcAvatarStatus"></div>
        </div>

        <!-- 中部：首页中央框背景 -->
        <div class="kc-sec">
          <div class="kc-sec-title">中央パネル背景（首頁の司令部抬头）</div>
          <div class="kc-field-row">
            <button class="kc-btn" id="kcPickPanel">画像を選択…</button>
            <input type="file" id="kcPanelFile" accept="image/*" hidden>
          </div>
          <div class="kc-preview" id="kcPanelPreview">
            ${s.panel_bg_url ? `<img src="${s.panel_bg_url}">` : '<span class="ph">― 背景未設定 ―</span>'}
          </div>
          <div class="kc-status" id="kcPanelStatus"></div>
        </div>

        <!-- 下部：全局背景 -->
        <div class="kc-sec">
          <div class="kc-sec-title">全局背景（全ページ共通）</div>
          <div class="kc-field-row">
            <button class="kc-btn" id="kcPickPage">画像を選択…</button>
            <input type="file" id="kcPageFile" accept="image/*" hidden>
          </div>
          <div class="kc-preview" id="kcPagePreview">
            ${s.page_bg_url ? `<img src="${s.page_bg_url}">` : '<span class="ph">― 背景未設定 ―</span>'}
          </div>
          <div class="kc-status" id="kcPageStatus"></div>
          <div class="kc-hint">画像は全て后端（Supabase）に保存され、再上載時は同名で上書きされます。<br>ブラウザのローカルストレージには保存されません。</div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // 关闭
    $('kcClose').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // 已有图片也按横纵版式显示
    ['kcPanelPreview', 'kcPagePreview'].forEach(id => {
      const img = $(id).querySelector('img');
      if (img) showPreview($(id), img.src, false);
    });

    // 提督名保存（存后端）
    $('kcSaveName').addEventListener('click', async () => {
      const st = $('kcNameStatus');
      const name = $('kcName').value.trim();
      st.className = 'kc-status'; st.textContent = '保存中…';
      try {
        await KC_API.updateDisplayName(name);
        currentSettings = { ...(currentSettings || {}), display_name: name };
        applySettings(currentSettings);
        st.className = 'kc-status ok'; st.textContent = '✓ 后端に保存しました';
      } catch (e) {
        st.className = 'kc-status err'; st.textContent = '保存失敗: ' + e.message;
      }
    });

    // 图片上传：本地预览 → 后端上传（覆盖）→ 应用
    const bindUpload = (pickId, fileId, previewId, statusId, field, isAvatar) => {
      $(pickId).addEventListener('click', () => $(fileId).click());
      $(fileId).addEventListener('change', async () => {
        const file = $(fileId).files[0];
        if (!file) return;
        const st = $(statusId);
        // 本地即时预览（不上屏持久化，仅为预览）
        const reader = new FileReader();
        reader.onload = () => showPreview($(previewId), reader.result, isAvatar);
        reader.readAsDataURL(file);
        st.className = 'kc-status'; st.textContent = '后端へ送信中…';
        try {
          const res = await KC_API.uploadAsset(field, file);
          const url = res.url + (res.url.includes('?') ? '&' : '?') + 't=' + Date.now();
          currentSettings = { ...(currentSettings || {}), [field + '_url']: url };
          applySettings(currentSettings);
          showPreview($(previewId), url, isAvatar);
          st.className = 'kc-status ok'; st.textContent = '✓ 后端に保存しました（前の画像は上書き）';
        } catch (e) {
          st.className = 'kc-status err'; st.textContent = '保存失敗: ' + e.message;
        }
        $(fileId).value = '';
      });
    };
    bindUpload('kcPickAvatar', 'kcAvatarFile', 'kcAvatarPreview', 'kcAvatarStatus', 'avatar', true);
    bindUpload('kcPickPanel', 'kcPanelFile', 'kcPanelPreview', 'kcPanelStatus', 'panel_bg', false);
    bindUpload('kcPickPage', 'kcPageFile', 'kcPagePreview', 'kcPageStatus', 'page_bg', false);
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
