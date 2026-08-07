-- 创建 users 表（用户认证）
create table if not exists public.users (
    id uuid primary key default gen_random_uuid(),
    api_key text unique not null,
    created_at timestamptz default now()
);

-- 添加注释
comment on table public.users is '用户认证表，存储 API Key';
comment on column public.users.api_key is 'Tampermonkey 脚本用这个认证';
