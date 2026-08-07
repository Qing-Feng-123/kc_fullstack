-- 创建 deck_raw 表（舰队编成原始数据）
create table if not exists public.deck_raw (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete cascade,
    api_id int2 not null,
    api_name text,
    api_name_id text,
    api_mission_0 int2,
    api_mission_1 int2,
    api_mission_2 int2,
    api_mission_3 int2,
    api_flagship int4,
    api_ship_0 int4,
    api_ship_1 int4,
    api_ship_2 int4,
    api_ship_3 int4,
    api_ship_4 int4,
    api_ship_5 int4,
    raw_data jsonb not null,
    created_at timestamptz default now()
);

-- 索引加速查询
create index if not exists idx_deck_raw_user_created 
    on public.deck_raw(user_id, created_at desc);

comment on table public.deck_raw is 'api_get_member/deck 原始数据';
