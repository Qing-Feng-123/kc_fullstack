-- 创建 user_settings 表（前端个人化设定：提督名 / 头像 / 中央框背景 / 全局背景）
-- 图片本体存 Supabase Storage（user-assets bucket），本表只存公开 URL
create table if not exists public.user_settings (
    user_id uuid primary key references public.users(id) on delete cascade,
    display_name text,
    avatar_url text,
    panel_bg_url text,
    page_bg_url text,
    updated_at timestamptz not null default now()
);

comment on table public.user_settings is '前端个人化设定（档案室设定面板）';
comment on column public.user_settings.display_name is '提督名（左上角文字）';
comment on column public.user_settings.avatar_url is '头像图片 URL（Storage: user-assets/{user_id}/avatar.*）';
comment on column public.user_settings.panel_bg_url is '首页中央框（司令部抬头）背景图 URL';
comment on column public.user_settings.page_bg_url is '全局背景图 URL（所有页面一致）';

-- 启用 RLS（与项目内其他表保持一致；服务端一律走 service_role 绕过）
alter table public.user_settings enable row level security;

-- 图片存储桶（公开读取；上传只允许通过 Edge Function + service_role）
insert into storage.buckets (id, name, public)
values ('user-assets', 'user-assets', true)
on conflict (id) do nothing;
