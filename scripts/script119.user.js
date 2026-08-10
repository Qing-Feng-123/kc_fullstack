// ==UserScript==
// @name         舰C拦截测试-本地验证版
// @namespace    http://tampermonkey.net/
// @version      1.19
// @description  拦截舰C数据并推送到Supabase后端（在1.18建造全栈基础上，新增 api_get_member/questlist 任务列表拦截与全量刷新）
// @author       Qing-Feng
// @match        https://osapi.dmm.com/*
// @match        https://www.dmm.com/*
// @match        https://play.games.dmm.com/*
// @match        *://*.kancolle-server.com/*
// @match        *://*/kcs2/*
// @include      /^https?:\/\/\d{1,3}(\.\d{1,3}){3}\//
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置区域 ====================
    const CONFIG = {
        SUPABASE_URL: 'https://gzryvfrzkfpwayfybnkp.supabase.co',
        API_KEY: 'kc_qingfeng_20260807_abc123',
        ENABLE_PUSH: true,
        DEVMAT_LARGE_BUILD: 1   // 大型建造开发资材消耗，默认1，可按实际游戏机制调整
    };
    // ==================================================

    // 防止在 iframe 中重复创建面板
    if (window.self !== window.top) {
        // 当前在 iframe 中，不创建面板，只拦截数据
        console.log('[script_1.19] 在iframe中运行，不创建UI面板');
    }

    let panel = null;
    let logCount = 0;
    let detectedApis = new Set();
    let lastMaterialSnapshot = null;   // 最近一次母港资源快照 [fuel, ammo, steel, bauxite, flame, bucket, devmat, screw]
    let lastCreateshipDock = 0;        // 最近一次 createship 的渠号（speedchange 解析失败时兜底）
    const questCache = new Map();            // api_no -> 任务对象（跨分页合并，游戏内翻页时累积）

    function createPanel() {
        // 只在顶层窗口创建面板，避免iframe重复
        if (window.self !== window.top) return;
        if (panel) return;
        panel = document.createElement('div');
        panel.id = 'kc-test-panel';
        panel.style.cssText = `
            position: fixed !important;
            bottom: 10px !important;
            right: 10px !important;
            width: 380px !important;
            max-height: 420px !important;
            background: rgba(0, 0, 0, 0.9) !important;
            color: #00ff41 !important;
            font-family: monospace !important;
            font-size: 11px !important;
            padding: 10px !important;
            border-radius: 8px !important;
            z-index: 2147483647 !important;
            border: 2px solid #00ff41 !important;
            overflow-y: auto !important;
            line-height: 1.4 !important;
        `;
        panel.innerHTML = `
            <div style="color:#fff;font-weight:bold;font-size:13px;margin-bottom:6px;">
                🐵 script_1.19
            </div>
            <div style="color:#888;margin-bottom:6px;">
                状态: <span id="kc-status" style="color:#ffd700;">等待游戏请求...</span>
            </div>
            <div style="color:#888;margin-bottom:6px;font-size:10px;">
                后端: <span style="color:#00ff41;">${CONFIG.ENABLE_PUSH ? '已启用' : '已禁用'}</span>
            </div>
            <div style="color:#fff;font-size:10px;margin-bottom:6px;border:1px solid #333;padding:4px;">
                <div style="color:#ffd700;margin-bottom:2px;">📡 检测到的API:</div>
                <div id="kc-detected-apis" style="color:#888;">暂无...</div>
            </div>
            <div id="kc-logs"></div>
        `;

        if (document.body) {
            document.body.appendChild(panel);
        } else {
            const waitBody = setInterval(() => {
                if (document.body) {
                    clearInterval(waitBody);
                    document.body.appendChild(panel);
                }
            }, 500);
        }
    }

    function updateDetectedApis() {
        if (window.self !== window.top) {
            try { window.top.postMessage({ __kc109_apis: Array.from(detectedApis) }, '*'); } catch(e) {}
            return;
        }
        const el = panel?.querySelector('#kc-detected-apis');
        if (el) {
            if (detectedApis.size === 0) {
                el.textContent = '暂无...';
            } else {
                el.innerHTML = Array.from(detectedApis).map(api =>
                    `<span style="color:#00ff41;">• ${api}</span>`
                ).join('<br>');
            }
        }
    }

    function addLog(msg) {
        if (window.self !== window.top) {
            // iframe 中没有面板，把日志转发给顶层窗口显示
            try {
                window.top.postMessage({
                    __kc109_log: String(msg).replace(/<[^>]+>/g, ''),
                    __kc109_from: location.host + location.pathname.substring(0, 30)
                }, '*');
            } catch (e) {}
            return;
        }
        if (!panel) createPanel();
        if (!panel) return;
        const logs = panel.querySelector('#kc-logs');
        const status = panel.querySelector('#kc-status');
        if (status) status.textContent = '工作中 ✅';
        if (logs) {
            logCount++;
            const entry = document.createElement('div');
            entry.style.cssText = 'margin-bottom:5px;border-bottom:1px solid #333;padding-bottom:4px;';
            entry.innerHTML = `<span style="color:#888;">#${logCount}</span> ${msg}`;
            logs.prepend(entry);
            while (logs.children.length > 10) {
                logs.removeChild(logs.lastChild);
            }
        }
    }

    // 顶层窗口接收来自各 iframe 的日志转发
    window.addEventListener('message', function(e) {
        if (e.data && e.data.__kc109_apis && window.self === window.top) {
            e.data.__kc109_apis.forEach(a => detectedApis.add(a));
            updateDetectedApis();
            return;
        }
        if (e.data && e.data.__kc109_log) {
            addLog('<span style="color:#66ccff;">[' + (e.data.__kc109_from || '?') + ']</span> ' + e.data.__kc109_log);
        }
    });

    // ==================== Supabase 推送函数 ====================
    // 使用 GM_xmlhttpRequest 跨域推送（绕过 CORS）
    function pushToSupabase(endpoint, data) {
        return new Promise((resolve) => {
            if (!CONFIG.ENABLE_PUSH || CONFIG.API_KEY === 'YOUR_API_KEY_HERE') {
                resolve({ skipped: true });
                return;
            }

            GM_xmlhttpRequest({
                method: 'POST',
                url: `${CONFIG.SUPABASE_URL}/functions/v1/${endpoint}`,
                headers: {
                    'Authorization': `Bearer ${CONFIG.API_KEY}`,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({ raw_data: data }),
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        resolve({ success: true });
                    } else {
                        resolve({ success: false, error: response.responseText || response.statusText });
                    }
                },
                onerror: function(error) {
                    resolve({ success: false, error: error.message || 'Network error' });
                }
            });
        });
    }

    async function pushDeck(data) {
        const result = await pushToSupabase('kc-ingest-deck', data);
        if (result.success) {
            addLog('<span style="color:#00ff41;">✅ deck 已同步</span>');
        } else if (result.skipped) {
            addLog('<span style="color:#888;">⏭️ deck 推送已跳过</span>');
        } else {
            addLog(`<span style="color:#ff4444;">❌ deck 同步失败: ${result.error}</span>`);
        }
    }

    async function pushShip2(data) {
        const result = await pushToSupabase('kc-ingest-ship2', data);
        if (result.success) {
            addLog('<span style="color:#00ff41;">✅ ship2 已同步</span>');
        } else if (result.skipped) {
            addLog('<span style="color:#888;">⏭️ ship2 推送已跳过</span>');
        } else {
            addLog(`<span style="color:#ff4444;">❌ ship2 同步失败: ${result.error}</span>`);
        }
    }

    // ==================== 建造全栈推送函数 ====================
    async function pushBuildEvent(payload) {
        const eventData = {
            ...payload,
            timestamp: new Date().toISOString(),
            material_snapshot: lastMaterialSnapshot
        };

        const result = await pushToSupabase('kc-ingest-build-event', eventData);

        const typeLabels = {
            createship: '🚢 建造开始',
            getship: '✅ 建造完成',
            speedchange: '⚡ 高速建造'
        };
        const label = typeLabels[payload.event_type] || payload.event_type;
        let detail = '';
        if (payload.event_type === 'createship') {
            detail = `渠${payload.dock_id} | 油${payload.fuel} 弹${payload.ammo} 钢${payload.steel} 铝${payload.bauxite}${payload.is_large ? ' | 大建' : ''}`;
        } else if (payload.event_type === 'getship') {
            detail = `渠${payload.dock_id} | 产出舰ID:${payload.ship_id}`;
        } else if (payload.event_type === 'speedchange') {
            detail = `渠${payload.dock_id} | 喷火-${payload.flame_inferred}`;
        }

        if (result.success) {
            addLog(`<span style="color:#00ff41;">[建造]</span> ${label} ${detail}`);
        } else if (result.skipped) {
            addLog(`<span style="color:#888;">[建造]</span> ${label} ${detail} (已跳过)`);
        } else {
            addLog(`<span style="color:#ff4444;">[建造]</span> ${label} ${detail} 失败: ${result.error}`);
        }
    }

    async function pushKDock(data) {
        const result = await pushToSupabase('kc-ingest-kdock', {
            timestamp: new Date().toISOString(),
            kdock_data: data,
            material_snapshot: lastMaterialSnapshot
        });
        if (result.success) {
            addLog('<span style="color:#00ff41;">📋 kdock 已同步</span>');
        } else if (result.skipped) {
            addLog('<span style="color:#888;">⏭️ kdock 推送已跳过</span>');
        } else {
            addLog(`<span style="color:#ff4444;">❌ kdock 同步失败: ${result.error}</span>`);
        }
    }

    async function pushMaterial(snapshot) {
        const result = await pushToSupabase('kc-ingest-material', {
            timestamp: new Date().toISOString(),
            material_snapshot: snapshot
        });
        if (result.success) {
            addLog('<span style="color:#888;">📊 material 快照已同步</span>');
        }
        // material 推送失败不显示错误，避免日志刷屏
    }


    // ==================== 任务列表全栈推送函数 ====================
    // questlist 是分页接口：脚本在本地跨页合并缓存，每次拦截都把完整任务表整体推送，
    // 后端据此对该用户的 questlist_raw 做全量替换（无历史、实时刷新）
    async function pushQuestlist() {
        const quests = Array.from(questCache.values()).sort((a, b) => (a.api_no || 0) - (b.api_no || 0));
        if (quests.length === 0) return;
        const result = await pushToSupabase('kc-ingest-questlist', {
            timestamp: new Date().toISOString(),
            quests: quests
        });
        if (result.success) {
            addLog(`<span style="color:#00ff41;">[任务]</span> 📜 questlist 已同步（${quests.length}条）</span>`);
        } else if (result.skipped) {
            addLog('<span style="color:#888;">[任务]</span> ⏭️ questlist 推送已跳过');
        } else {
            addLog(`<span style="color:#ff4444;">[任务]</span> ❌ questlist 同步失败: ${result.error}`);
        }
    }

    // ==================== 数据解析工具 ====================
    // kcsapi 响应带 svdata= 防劫持前缀，需先剥离再解析
    function parseSvdata(text) {
        if (typeof text !== 'string') return null;
        let t = text.trim();
        if (t.startsWith('svdata=')) t = t.substring(7);
        try { return JSON.parse(t); } catch (e) { return null; }
    }

    // 解析 form-urlencoded 请求体
    function parseFormData(body) {
        if (!body) return {};
        // 兼容字符串 / URLSearchParams / FormData 三种请求体
        if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
            const result = {};
            for (const [key, value] of body) result[key] = value;
            return result;
        }
        if (typeof FormData !== 'undefined' && body instanceof FormData) {
            const result = {};
            body.forEach((value, key) => { result[key] = value; });
            return result;
        }
        const text = typeof body === 'string' ? body : String(body);
        const params = new URLSearchParams(text);
        const result = {};
        for (const [key, value] of params) {
            result[key] = value;
        }
        return result;
    }

    // 从 api_port/port 的 api_material 提取 8 项快照数组
    function extractMaterialSnapshot(apiMaterial) {
        if (!Array.isArray(apiMaterial)) return null;
        const snapshot = new Array(8).fill(0);
        apiMaterial.forEach(item => {
            const idx = parseInt(item.api_id) - 1;
            if (idx >= 0 && idx < 8) {
                snapshot[idx] = parseInt(item.api_value) || 0;
            }
        });
        return snapshot;
    }

    // ==================== API名称提取 ====================
    function extractApiName(url) {
        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname;
            const parts = path.split('/').filter(p => p && p !== 'kcsapi');

            if (parts.length >= 2) {
                return parts.slice(-2).join('_');
            } else if (parts.length === 1) {
                return parts[0];
            }

            const searchParams = urlObj.searchParams;
            if (searchParams.has('api')) {
                return searchParams.get('api');
            }

            return path || 'unknown';
        } catch (e) {
            const parts = url.split('/');
            return parts[parts.length - 1].split('?')[0] || 'unknown';
        }
    }

    // ==================== API 数据分发（按 URL 精确匹配，适配 HTML5 版） ====================
    function handleApiData(url, apiData, requestBody = null) {
        // 0. 建造发起类事件：createship / createship_speedchange 的响应
        //    只有 api_result 没有 api_data，必须仅靠请求体处理，
        //    且必须先判 speedchange 再判 createship（URL 前缀包含关系）
        if (url.includes('/api_req_kousyou/createship_speedchange')) {
            const form = parseFormData(requestBody);
            const dockId = parseInt(form.api_kdock_id) || lastCreateshipDock || 0;
            if (!dockId) {
                addLog('<span style="color:#ff4444;">[建造]</span> ⚡ 高速建造 渠号解析失败，事件未推送');
                return;
            }
            pushBuildEvent({
                event_type: 'speedchange',
                dock_id: dockId,
                flame_inferred: 1
            });
            return;
        }
        if (url.includes('/api_req_kousyou/createship')) {
            const form = parseFormData(requestBody);
            const isLarge = form.api_large_flag === '1';
            const dockId = parseInt(form.api_kdock_id) || 0;
            if (dockId) lastCreateshipDock = dockId;
            pushBuildEvent({
                event_type: 'createship',
                dock_id: dockId,
                fuel: parseInt(form.api_item1) || 0,
                ammo: parseInt(form.api_item2) || 0,
                steel: parseInt(form.api_item3) || 0,
                bauxite: parseInt(form.api_item4) || 0,
                is_large: isLarge,
                devmat_inferred: isLarge ? (CONFIG.DEVMAT_LARGE_BUILD || 1) : 1
            });
            return;
        }

        if (!apiData) return;

        // 1. 原有分支：舰队/舰娘数据
        if (url.includes('/api_get_member/preset_deck')) return; // 编成记录，不是舰队编成，忽略
        if (url.includes('/api_get_member/deck')) {
            pushDeck(apiData);
        } else if (url.includes('/api_get_member/ship2')) {
            pushShip2(apiData);
        } else if (url.includes('/api_get_member/ship_deck')) {
            // HTML5 版进编成时调用：舰船+舰队一起返回
            if (apiData.api_ship_data) pushShip2(apiData.api_ship_data);
            (apiData.api_deck_data || []).forEach(d => pushDeck(d));
        }
        // 1.5 任务列表：api_list 跨分页合并进缓存后整体推送（占位项 api_no=-1 跳过）
        else if (url.includes('/api_get_member/questlist')) {
            const list = Array.isArray(apiData.api_list) ? apiData.api_list : [];
            let added = 0;
            list.forEach(q => {
                if (q && typeof q === 'object' && parseInt(q.api_no) > 0) {
                    questCache.set(parseInt(q.api_no), q);
                    added++;
                }
            });
            if (added > 0) pushQuestlist();
        }
        // 2. 母港综合数据（扩展：提取资源快照）
        else if (url.includes('/api_port/port')) {
            // 回母港必发：api_ship=全部舰船，api_deck_port=4个舰队编成
            if (apiData.api_ship) pushShip2(apiData.api_ship);
            (apiData.api_deck_port || []).forEach(d => pushDeck(d));

            if (apiData.api_material) {
                const snapshot = extractMaterialSnapshot(apiData.api_material);
                if (snapshot) {
                    lastMaterialSnapshot = snapshot;
                    pushMaterial(snapshot);
                }
            }
        }
        // 3. 建造全栈事件（getship 响应含 api_data；createship/speedchange 已在入口处理）
        if (url.includes('/api_req_kousyou/getship')) {
            const form = parseFormData(requestBody);
            pushBuildEvent({
                event_type: 'getship',
                dock_id: parseInt(form.api_kdock_id) || 0,
                ship_id: apiData.api_ship_id,
                ship_instance_id: apiData.api_id
            });
        }
        else if (url.includes('/api_get_member/kdock')) {
            pushKDock(apiData);
        }
    }

    // ==================== 核心拦截逻辑 ====================

    // 1. 拦截标准的 XMLHttpRequest
    // 使用 unsafeWindow 访问页面真实对象（绕过 Tampermonkey 沙箱）
    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const OriginalXHR = win.XMLHttpRequest;
    function FakeXHR() {
        const xhr = new OriginalXHR();
        const self = this;
        let requestUrl = '';
        let requestBody = null;

        // 劫持 open 方法记录 URL
        const origOpen = xhr.open;
        xhr.open = function(method, url, ...args) {
            requestUrl = url;
            return origOpen.apply(this, [method, url, ...args]);
        };

        // 劫持 send 方法，缓存请求体，在内部设置 onreadystatechange（KC3改方式）
        const origSend = xhr.send;
        xhr.send = function(body) {
            requestBody = body;   // 缓存请求体（form-data）
            const origOnReady = xhr.onreadystatechange;

            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    try {
                        const url = requestUrl || xhr.responseURL || '';

                        // 只拦截包含 kcsapi 的请求
                        if (url.includes('kcsapi')) {
                            const apiName = extractApiName(url);
                            detectedApis.add(apiName);
                            updateDetectedApis();

                            let preview = '';
                            let responseData = null;
                            try {
                                const text = xhr.responseText;
                                preview = text.substring(0, 80).replace(/\s+/g, ' ');
                                responseData = parseSvdata(text);
                            } catch(e) {
                                // responseType 为 json/arraybuffer 时 responseText 会抛错，改用 xhr.response
                                try {
                                    const resp = xhr.response;
                                    if (resp && typeof resp === 'object' && !(resp instanceof ArrayBuffer)) {
                                        responseData = resp;
                                        preview = JSON.stringify(resp).substring(0, 80);
                                    } else if (typeof resp === 'string') {
                                        preview = resp.substring(0, 80).replace(/\s+/g, ' ');
                                        responseData = parseSvdata(resp);
                                    } else {
                                        preview = '(' + (xhr.responseType || 'unknown') + ' 类型响应)';
                                    }
                                } catch(e2) {
                                    preview = '(无法读取)';
                                }
                            }

                            addLog(`<span style="color:#00ff41;">[XHR] 拦截</span> ${apiName}<br>预览: ${preview}...`);

                            // 推送数据到 Supabase（携带请求体，供建造事件解析）
                            // 注意：createship/speedchange 响应无 api_data，只要解析成功即分发
                            if (responseData) {
                                handleApiData(url, responseData.api_data || null, requestBody);
                            }
                        }
                    } catch (e) {
                        console.error('XHR拦截错误:', e);
                    }
                }

                // 调用原始 onreadystatechange
                if (origOnReady) origOnReady.apply(this, arguments);
            };

            return origSend.call(this, body);
        };

        return new Proxy(xhr, {
            get(target, prop) {
                if (prop === 'open' || prop === 'send') {
                    return xhr[prop].bind(xhr);
                }
                if (typeof target[prop] === 'function') {
                    return target[prop].bind(target);
                }
                return self[prop] !== undefined ? self[prop] : target[prop];
            },
            set(target, prop, value) {
                self[prop] = value;
                target[prop] = value;
                return true;
            }
        });
    }
    win.XMLHttpRequest = FakeXHR;

    // 2. 拦截 fetch
    if (win.fetch) {
        const originalFetch = win.fetch;
        win.fetch = async function(...args) {
            const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
            let requestBody = null;
            if (args[1] && args[1].body) {
                const b = args[1].body;
                if (typeof b === 'string'
                    || (typeof URLSearchParams !== 'undefined' && b instanceof URLSearchParams)
                    || (typeof FormData !== 'undefined' && b instanceof FormData)) {
                    requestBody = b;
                }
            }

            const response = await originalFetch.apply(this, args);

            if (url.includes('kcsapi')) {
                try {
                    const apiName = extractApiName(url);
                    detectedApis.add(apiName);
                    updateDetectedApis();

                    const clone = response.clone();
                    const text = await clone.text();
                    addLog(`<span style="color:#00ff41;">[fetch] 拦截</span> ${apiName}`);

                    try {
                        const data = parseSvdata(text);
                        if (data) {
                            handleApiData(url, data.api_data || null, requestBody);
                        }
                    } catch(e) {}
                } catch(e) {}
            }

            return response;
        };
    }

    // 3. 拦截 gadgets_makeRequest（DMM游戏常用）
    if (window.gadgets && window.gadgets.makeRequest) {
        const originalMakeRequest = window.gadgets.makeRequest;
        window.gadgets.makeRequest = function(url, callback, params) {
            const apiName = extractApiName(url);
            detectedApis.add(`gadgets_${apiName}`);
            updateDetectedApis();

            addLog(`<span style="color:#ffd700;">[gadgets] 请求</span> ${apiName}`);

            // 包装回调以捕获响应
            const wrappedCallback = function(response) {
                try {
                    addLog(`<span style="color:#00ff41;">[gadgets] 响应</span> ${apiName}`);

                    let data = null;
                    try {
                        // gadgets 响应可能是 JSON 字符串或对象
                        if (typeof response === 'string') {
                            data = parseSvdata(response);
                        } else {
                            data = response;
                        }
                    } catch(e) {}

                    if (data && data.api_data) {
                        handleApiData(url, data.api_data);
                    }
                } catch(e) {}

                if (callback) callback(response);
            };

            return originalMakeRequest.call(this, url, wrappedCallback, params);
        };
        addLog('<span style="color:#00ff41;">✅ gadgets.makeRequest 已拦截</span>');
    }

    // 4. 拦截 DMM 的通用 API 请求
    const dmmApis = [
        'window.__DMM_API__',
        'window.dmmAPI',
        'window.API',
        'window.gameAPI'
    ];

    dmmApis.forEach(apiName => {
        try {
            const parts = apiName.split('.');
            let obj = window;
            for (let i = 1; i < parts.length - 1; i++) {
                obj = obj[parts[i]];
            }
            // 如果存在，尝试拦截
        } catch(e) {}
    });

    // 5. 全局网络请求监听（MutationObserver 检测 iframe）
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.tagName === 'IFRAME') {
                    try {
                        const iframeUrl = node.src || '';
                        if (iframeUrl.includes('kcsapi') || iframeUrl.includes('dmm') || iframeUrl.includes('kancolle-server')) {
                            addLog(`<span style="color:#ffd700;">[iframe] 加载</span> ${iframeUrl.substring(0, 50)}...`);
                        }
                    } catch(e) {}
                }
            });
        });
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    createPanel();
    addLog('<span style="color:#ffd700;">脚本已激活 script_1.19 @ ' + location.host + '，等待舰C请求...</span>');
    addLog('<span style="color:#888;">已启用: XHR劫持 + fetch劫持 + GM_xmlhttpRequest推送 + 建造全栈拦截</span>');
    if (CONFIG.API_KEY === 'YOUR_API_KEY_HERE') {
        addLog('<span style="color:#ff4444;">⚠️ 请先配置 API_KEY</span>');
    }

})();
