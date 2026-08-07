// ==UserScript==
// @name         舰C拦截测试-本地验证版
// @namespace    http://tampermonkey.net/
// @version      106
// @description  拦截舰C数据并推送到Supabase后端
// @author       Qing-Feng
// @match        https://osapi.dmm.com/*
// @match        https://www.dmm.com/*
// @match        https://play.games.dmm.com/*
// @match        *://*.kancolle-server.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置区域 ====================
    const CONFIG = {
        SUPABASE_URL: 'https://gzryvfrzkfpwayfybnkp.supabase.co',
        API_KEY: 'kc_qingfeng_20260807',
        ENABLE_PUSH: true
    };
    // ==================================================

    // 防止在 iframe 中重复创建面板
    if (window.self !== window.top) {
        // 当前在 iframe 中，不创建面板，只拦截数据
        console.log('[script106] 在iframe中运行，不创建UI面板');
    }

    let panel = null;
    let logCount = 0;
    let detectedApis = new Set();

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
            width: 360px !important;
            max-height: 400px !important;
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
                🐵 script106
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
        if (!panel) createPanel();
        const logs = panel.querySelector('#kc-logs');
        const status = panel.querySelector('#kc-status');
        if (status) status.textContent = '工作中 ✅';
        if (logs) {
            logCount++;
            const entry = document.createElement('div');
            entry.style.cssText = 'margin-bottom:5px;border-bottom:1px solid #333;padding-bottom:4px;';
            entry.innerHTML = `<span style="color:#888;">#${logCount}</span> ${msg}`;
            logs.prepend(entry);
            while (logs.children.length > 8) {
                logs.removeChild(logs.lastChild);
            }
        }
    }

    // ==================== Supabase 推送函数 ====================
    async function pushToSupabase(endpoint, data) {
        if (!CONFIG.ENABLE_PUSH || CONFIG.API_KEY === 'YOUR_API_KEY_HERE') {
            return { skipped: true };
        }

        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CONFIG.API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ raw_data: data })
            });

            if (response.ok) {
                return { success: true };
            } else {
                const errorText = await response.text();
                return { success: false, error: errorText };
            }
        } catch (e) {
            return { success: false, error: e.message };
        }
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

    // ==================== 核心拦截逻辑 ====================

    // 1. 拦截标准的 XMLHttpRequest
    const OriginalXHR = window.XMLHttpRequest;
    function FakeXHR() {
        const xhr = new OriginalXHR();
        const self = this;
        let requestUrl = '';

        // 拦截 open 方法获取 URL
        const originalOpen = xhr.open;
        xhr.open = function(method, url, ...args) {
            requestUrl = url;
            return originalOpen.apply(this, [method, url, ...args]);
        };

        xhr.addEventListener('load', function() {
            try {
                const url = requestUrl || xhr.responseURL || '';
                if (!url.includes('kcsapi')) return;

                const apiName = extractApiName(url);
                detectedApis.add(apiName);
                updateDetectedApis();

                let preview = '';
                let responseData = null;
                try {
                    const text = xhr.responseText;
                    preview = text.substring(0, 80).replace(/\s+/g, ' ');
                    responseData = JSON.parse(text);
                } catch(e) {
                    preview = '(无法读取)';
                }

                addLog(`<span style="color:#00ff41;">[XHR] 拦截</span> ${apiName}<br>预览: ${preview}...`);

                if (responseData && responseData.api_data) {
                    if (apiName.includes('deck')) {
                        pushDeck(responseData.api_data);
                    } else if (apiName.includes('ship2')) {
                        pushShip2(responseData.api_data);
                    }
                }
            } catch (e) {}
        });

        return new Proxy(xhr, {
            get(target, prop) {
                if (prop === 'open') {
                    return xhr.open.bind(xhr);
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
    window.XMLHttpRequest = FakeXHR;

    // 2. 拦截 fetch
    if (window.fetch) {
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

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
                        const data = JSON.parse(text);
                        if (data.api_data) {
                            if (apiName.includes('deck')) {
                                pushDeck(data.api_data);
                            } else if (apiName.includes('ship2')) {
                                pushShip2(data.api_data);
                            }
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
                            data = JSON.parse(response);
                        } else {
                            data = response;
                        }
                    } catch(e) {}

                    if (data && data.api_data) {
                        if (apiName.includes('deck')) {
                            pushDeck(data.api_data);
                        } else if (apiName.includes('ship2')) {
                            pushShip2(data.api_data);
                        }
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
    addLog('<span style="color:#ffd700;">脚本已激活 script106，等待舰C请求...</span>');
    addLog('<span style="color:#888;">已启用: XHR + fetch + gadgets 拦截（单窗口模式）</span>');
    if (CONFIG.API_KEY === 'YOUR_API_KEY_HERE') {
        addLog('<span style="color:#ff4444;">⚠️ 请先配置 API_KEY</span>');
    }

})();
