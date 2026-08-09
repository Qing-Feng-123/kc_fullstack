# kc_fullstack

舰队Collection（艦これ）游戏数据全栈面板：Tampermonkey 脚本拦截 kcsapi → Supabase Edge Functions 入库 → 聯合艦隊司令部风格前端展示。

## 前端面板（GitHub Pages）

**https://qing-feng-123.github.io/kc_fullstack/**

聯合艦隊司令部・作戦室风格的数据面板：

- **首页**：舰队编成、舰娘八维雷达图、装备槽、舰队综合战力
- **资源页**：建造消耗（东京时间日历、油/弹/钢/铝消耗柱形图、当日建造记录）

## 项目结构

```
├── docs/                  # 前端面板（GitHub Pages 源，与 frontend/ 同步发布）
│   ├── index.html         # 首页
│   ├── resources.html     # 资源页
│   └── assets/            # css / js（api.js 为唯一接口层）
├── frontend/              # 前端源码（开发主副本，结构说明见 frontend/README.md）
├── scripts/               # Tampermonkey 拦截脚本（.user.js）
└── supabase/
    ├── migrations/        # 数据库迁移（push 到 main 自动应用）
    └── functions/         # Edge Functions（push 到 main 自动部署）
```

## 数据流

```
游戏客户端 --(kcsapi XHR)--> Tampermonkey 脚本拦截
    --(POST)--> kc-ingest-deck / kc-ingest-ship2 (Edge Functions)
    --> deck_raw / ship2_raw 表（UPSERT，只保留最新）
前端面板 --(GET)--> kc-query-fleet?fleet_no=N
    --(联合查询 deck_raw + ship2_raw + ship_master)--> 渲染
```

## 表结构

| 表 | 说明 |
|---|---|
| `users` | 用户与 API Key |
| `deck_raw` | 舰队编成（user_id + api_id 唯一，覆盖更新） |
| `ship2_raw` | 舰船数据（user_id + api_id 唯一，覆盖更新） |
| `ship_master` | 舰船图鉴对照表（943 艘，含中日舰名、舰种） |

## 部署方式

push 到 `main` 分支即自动部署（Supabase GitHub 集成）：

- `supabase/migrations/*.sql` → 自动应用迁移
- `supabase/functions/*` → 自动部署 Edge Functions

若偶发未触发，可用空提交重试：

```bash
git commit --allow-empty -m "trigger deploy" && git push origin main
```
