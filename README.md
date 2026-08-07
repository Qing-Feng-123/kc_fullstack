# KC FullStack

舰C数据拦截全栈后端项目

## 项目结构

```
kc_fullstack/
├── supabase/                    # Supabase 配置目录
│   ├── config.toml              # Supabase 配置文件
│   ├── migrations/              # 数据库迁移
│   │   ├── 001_create_users.sql
│   │   ├── 002_create_deck_raw.sql
│   │   └── 003_create_ship2_raw.sql
│   └── functions/               # Edge Functions
│       ├── kc-ingest-deck/
│       │   └── index.ts         # 接收 deck 数据
│       ├── kc-ingest-ship2/
│       │   └── index.ts         # 接收 ship2 数据
│       └── kc-query-fleet/
│           └── index.ts         # 查询舰队数据
├── docs/                        # 文档
│   └── api.md                   # API 接口文档
└── .github/
    └── workflows/
        └── ping-supabase.yml    # 定时 ping（防暂停）
```

## 部署说明

1. 在 Supabase 网页关联此 GitHub 仓库
2. 推送代码后自动部署数据库迁移和 Edge Functions
3. 在 `users` 表中插入 API Key
4. 修改 Tampermonkey 脚本配置 Supabase URL 和 API Key

## 技术栈

- 后端：Supabase (PostgreSQL + Edge Functions)
- 数据库：PostgreSQL
- 部署：GitHub → Supabase 自动同步
