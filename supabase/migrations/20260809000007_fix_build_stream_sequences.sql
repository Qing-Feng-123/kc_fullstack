-- ============================================================
-- 修复：build_stream_dock2~4 共用 dock1 序列导致 service_role 插入报
-- "permission denied for sequence build_stream_dock1_id_seq"
-- 1) 为 dock2~4 建立各自独立序列
-- 2) 显式授予 service_role 等角色所有序列的 USAGE 权限
-- ============================================================

-- ---------- 1. dock2~4 独立序列 ----------
CREATE SEQUENCE IF NOT EXISTS public.build_stream_dock2_id_seq;
ALTER SEQUENCE public.build_stream_dock2_id_seq OWNED BY public.build_stream_dock2.id;
ALTER TABLE public.build_stream_dock2
    ALTER COLUMN id SET DEFAULT nextval('public.build_stream_dock2_id_seq');
SELECT setval('public.build_stream_dock2_id_seq', COALESCE((SELECT MAX(id) FROM public.build_stream_dock2), 1));

CREATE SEQUENCE IF NOT EXISTS public.build_stream_dock3_id_seq;
ALTER SEQUENCE public.build_stream_dock3_id_seq OWNED BY public.build_stream_dock3.id;
ALTER TABLE public.build_stream_dock3
    ALTER COLUMN id SET DEFAULT nextval('public.build_stream_dock3_id_seq');
SELECT setval('public.build_stream_dock3_id_seq', COALESCE((SELECT MAX(id) FROM public.build_stream_dock3), 1));

CREATE SEQUENCE IF NOT EXISTS public.build_stream_dock4_id_seq;
ALTER SEQUENCE public.build_stream_dock4_id_seq OWNED BY public.build_stream_dock4.id;
ALTER TABLE public.build_stream_dock4
    ALTER COLUMN id SET DEFAULT nextval('public.build_stream_dock4_id_seq');
SELECT setval('public.build_stream_dock4_id_seq', COALESCE((SELECT MAX(id) FROM public.build_stream_dock4), 1));

-- ---------- 2. 序列权限授权 ----------
-- Edge Function 经 PostgREST 以 service_role 写库，必须对有序列有 USAGE
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- 以后再新建序列也自动授权
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO anon;
