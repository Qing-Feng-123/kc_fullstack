// ==UserScript==
// @name         舰C拦截测试-本地验证版
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  拦截舰C数据并推送到Supabase后端
// @author       Qing-Feng
// @match        https://osapi.dmm.com/*
// @match        https://www.dmm.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置区域 ====================
    const CONFIG = {
        SUPABASE_URL: 'https://gzryvfrzkfpwayfybnkp.supabase.co',
        API_KEY: 'kc_qingfeng_20260807',  // 在users表中创建的api_key
        ENABLE_PUSH: true               // 是否启用推送
    };
    // ==================================================

    let panel = null;
    let logCount = 0;

    function createPanel() {
        if (panel) return;
        panel = document.createElement('div');
        panel.id = 'kc-test-panel';
        panel.style.cssText = `
            position: fixed !important;
            bottom: 10px !important;
            right: 10px !important;
            width: 320px !important;
            max-height: 280px !important;
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
                🐵 舰C拦截测试 v1.3
            </div>
            <div style="color:#888;margin-bottom:6px;">
                状态: <span id="kc-status" style="color:#ffd700;">等待游戏请求...</span>
            </div>
            <div style="color:#888;margin-bottom:6px;font-size:10px;">
                后端: <span style="color:#00ff41;">${CONFIG.ENABLE_PUSH ? '已启用' : '已禁用'}</span>
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
            while (logs.children.length > 10) {
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

    // 推送 deck 数据
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

    // 推送 ship2 数据
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
    // ==========================================================

    const OriginalXHR = window.XMLHttpRequest;

    function FakeXHR() {
        const xhr = new OriginalXHR();
        const self = this;

        xhr.addEventListener('load', function() {
            try {
                const url = xhr.responseURL || '';
                if (url.includes('kcsapi') || url.includes('api_port')) {
                    let preview = '';
                    let responseData = null;
                    try {
                        preview = xhr.responseText.substring(0, 80).replace(/\s+/g, ' ');
                        responseData = JSON.parse(xhr.responseText);
                    } catch(e) {
                        preview = '(无法读取)';
                    }
                    const apiName = url.split('/').pop().split('?')[0];
                    addLog(`<span style="color:#00ff41;">拦截成功</span><br>API: <span style="color:#fff;">${apiName}</span><br>预览: ${preview}...`);

                    // 推送数据到 Supabase
                    if (responseData && responseData.api_data) {
                        if (apiName === 'deck') {
                            pushDeck(responseData.api_data);
                        } else if (apiName === 'ship2') {
                            pushShip2(responseData.api_data);
                        }
                    }
                }
            } catch (e) {}
        });

        return new Proxy(xhr, {
            get(target, prop) {
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

    if (window.fetch) {
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const response = await originalFetch.apply(this, args);
            const url = typeof args[0] === 'string' ? args[0] : '';
            if (url.includes('kcsapi') || url.includes('api_port')) {
                try {
                    const clone = response.clone();
                    const text = await clone.text();
                    const apiName = url.split('/').pop().split('?')[0];
                    addLog(`<span style="color:#00ff41;">[fetch] 拦截</span> ${apiName}`);

                    // 尝试解析并推送
                    try {
                        const data = JSON.parse(text);
                        if (data.api_data) {
                            if (apiName === 'deck') {
                                pushDeck(data.api_data);
                            } else if (apiName === 'ship2') {
                                pushShip2(data.api_data);
                            }
                        }
                    } catch(e) {}
                } catch(e) {}
            }
            return response;
        };
    }

    createPanel();
    addLog('<span style="color:#ffd700;">脚本已激活 v1.3，等待舰C请求...</span>');
    if (CONFIG.API_KEY === 'YOUR_API_KEY_HERE') {
        addLog('<span style="color:#ff4444;">⚠️ 请先配置 API_KEY</span>');
    }

})();
