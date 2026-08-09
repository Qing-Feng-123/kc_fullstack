# 前端结构说明（供接手 agent 阅读）

纯静态站点，无构建步骤，直接用浏览器/静态服务器打开 `index.html` 即可。

```
frontend/
├── index.html            # 首页：舰队战力报告
├── resources.html        # 资源页（占位，接口待接）
├── assets/
│   ├── css/
│   │   └── style.css     # 全站唯一样式表，所有页面共用
│   └── js/
│       ├── api.js        # ★ 前后端接口层：所有后端通信只在这个文件
│       ├── nav.js        # 全站顶部导航栏（自动高亮当前页）
│       ├── home.js       # 首页逻辑（舰队编成/详情/雷达图/总览）
│       └── resources.js  # 资源页逻辑（占位骨架）
└── README.md             # 本文件
```

## 职责边界（重要）

- **后端通信**：只允许出现在 `api.js`。页面脚本一律调用 `KC_API.*`，
  不写 URL、不写 Header、不直接 `fetch`。
- **新增后端接口**：在 `api.js` 的 `CONFIG.ENDPOINTS` 登记路径，
  再在 `KC_API` 上加一个方法，文件头部注释有步骤说明。
- **新增页面**（以"任务页"为例）：
  1. 复制 `resources.html` 为 `quests.html`，改 `<body data-page="quests">` 和标题；
  2. 新建 `assets/js/quests.js` 写页面逻辑；
  3. 在 `nav.js` 的 `NAV_ITEMS` 加 `{ id: 'quests', label: '任務', href: 'quests.html' }`；
  4. 如需接口，按上面规则加到 `api.js`。
  页面导航高亮由 `nav.js` 按 `data-page` 自动处理，无需额外代码。
- **样式**：新页面复用 `style.css` 中已有组件类
  （`.card`、`.card-title`、`.summary-item`、`.empty-slot`、`.ctrl-btn` 等），
  新样式追加到 `style.css` 末尾并按注释分区。

## 现有后端接口

| 前端方法 | 后端 endpoint | 说明 |
|---|---|---|
| `KC_API.getFleet(fleetNo)` | `GET /functions/v1/kc-query-fleet?fleet_no=N` | 舰队编成，返回 `{ships, updated_at}` |

API 网关与鉴权 key 在 `api.js` 的 `CONFIG` 中；
key 可被 `localStorage.kc_api_key` 覆盖。

## 数据字段

ships 数组元素为 KC 原始 api_* 字段（api_id, api_lv, api_nowhp,
api_karyoku_0/1, api_kyouka_*, api_slot_* 等），用法见 `home.js`。
