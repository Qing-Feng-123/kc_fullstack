-- ============================================================
-- 建造资源消耗全栈：流水表 ×4 + 归档表 ×1
-- 依据: kc_integrate/construct_resource_account.md (2026-08-09)
-- 脚本: kc_fullstack/scripts/script113.user.js (script_1.13)
-- 注意: user_id 沿用仓库现有 users 表(uuid) 约定
-- ============================================================

-- ---------- 1. 流水表 build_stream_dock1 ~ dock4 ----------
-- 只保留最近 72 小时（东京时间概念由客户端时间戳保证），过期自动删除
CREATE TABLE IF NOT EXISTS public.build_stream_dock1 (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL,      -- createship | getship | speedchange | kdock_refresh | material_snapshot
    "timestamp" TIMESTAMPTZ NOT NULL,

    -- createship 时填充
    fuel INT,
    ammo INT,
    steel INT,
    bauxite INT,
    is_large BOOLEAN DEFAULT FALSE,
    devmat_inferred INT DEFAULT 1,

    -- getship 时填充
    ship_id INT,
    ship_instance_id INT,

    -- speedchange 时填充
    flame_inferred INT DEFAULT 1,

    -- 通用
    material_snapshot INT[],              -- [fuel, ammo, steel, bauxite, flame, bucket, devmat, screw]
    kdock_data JSONB,                     -- kdock_refresh 时填充

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.build_stream_dock2 (LIKE public.build_stream_dock1 INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.build_stream_dock3 (LIKE public.build_stream_dock1 INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.build_stream_dock4 (LIKE public.build_stream_dock1 INCLUDING ALL);

CREATE INDEX IF NOT EXISTS idx_build_stream_dock1_time ON public.build_stream_dock1("timestamp");
CREATE INDEX IF NOT EXISTS idx_build_stream_dock2_time ON public.build_stream_dock2("timestamp");
CREATE INDEX IF NOT EXISTS idx_build_stream_dock3_time ON public.build_stream_dock3("timestamp");
CREATE INDEX IF NOT EXISTS idx_build_stream_dock4_time ON public.build_stream_dock4("timestamp");

CREATE INDEX IF NOT EXISTS idx_build_stream_dock1_user_time ON public.build_stream_dock1(user_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_build_stream_dock2_user_time ON public.build_stream_dock2(user_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_build_stream_dock3_user_time ON public.build_stream_dock3(user_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_build_stream_dock4_user_time ON public.build_stream_dock4(user_id, "timestamp" DESC);

COMMENT ON TABLE public.build_stream_dock1 IS '建造渠1流水（72h滑动窗口）';
COMMENT ON TABLE public.build_stream_dock2 IS '建造渠2流水（72h滑动窗口）';
COMMENT ON TABLE public.build_stream_dock3 IS '建造渠3流水（72h滑动窗口）';
COMMENT ON TABLE public.build_stream_dock4 IS '建造渠4流水（72h滑动窗口）';

-- ---------- 2. 归档表 build_archive ----------
-- 永久保存已完成的建造记录，由 getship 事件驱动归档
CREATE TABLE IF NOT EXISTS public.build_archive (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    dock_id INT NOT NULL,                 -- 1~4

    started_at TIMESTAMPTZ NOT NULL,      -- createship 时间
    completed_at TIMESTAMPTZ NOT NULL,    -- getship 时间
    build_type VARCHAR(10),               -- 'normal' | 'large'
    speedup BOOLEAN DEFAULT FALSE,        -- 是否使用高速建造

    -- 投入
    input_fuel INT,
    input_ammo INT,
    input_steel INT,
    input_bauxite INT,
    input_devmat INT,                     -- 隐式开发资材消耗（硬编码推断）
    input_flame INT,                      -- 若 speedup=true，隐式喷火消耗

    -- 产出
    output_ship_id INT,                   -- 图鉴ID
    output_ship_instance_id INT,          -- 实例ID

    -- 校验
    before_material_snapshot INT[],       -- 建造前 port/material
    after_material_snapshot INT[],        -- 建造后 port/material

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_build_archive_user_time
    ON public.build_archive(user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_build_archive_user_dock
    ON public.build_archive(user_id, dock_id);

COMMENT ON TABLE public.build_archive IS '建造归档（永久）：createship + speedchange? + getship 融合为一条记录';

-- ---------- 3. 72 小时滑动窗口清理函数 ----------
-- 每次 ingest 时顺带执行；也可配 pg_cron 定时执行（见下方注释）
CREATE OR REPLACE FUNCTION public.cleanup_build_streams()
RETURNS void
LANGUAGE sql
AS $$
    DELETE FROM public.build_stream_dock1 WHERE "timestamp" < NOW() - INTERVAL '72 hours';
    DELETE FROM public.build_stream_dock2 WHERE "timestamp" < NOW() - INTERVAL '72 hours';
    DELETE FROM public.build_stream_dock3 WHERE "timestamp" < NOW() - INTERVAL '72 hours';
    DELETE FROM public.build_stream_dock4 WHERE "timestamp" < NOW() - INTERVAL '72 hours';
$$;

COMMENT ON FUNCTION public.cleanup_build_streams() IS '删除 4 张流水表中超过 72 小时的事件';

-- 可选：若项目已启用 pg_cron 扩展，取消下行注释即可每小时自动清理
-- SELECT cron.schedule('cleanup-build-streams', '7 * * * *', $$SELECT public.cleanup_build_streams()$$);
