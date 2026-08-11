-- user_settings 增加司令部名称字段
alter table public.user_settings add column if not exists hq_name text;
comment on column public.user_settings.hq_name is '司令部名称（首页中央大标题）';
