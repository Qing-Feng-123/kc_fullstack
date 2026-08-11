-- 为全部业务表启用行级安全（RLS）
-- 说明：本项目所有读写均经 Edge Function（service_role，绕过 RLS），
-- 启用后 anon/authenticated 直连将被默认拒绝（无策略即全拒），现有功能不受影响。
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ship2_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ship_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_stream_dock1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_stream_dock2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_stream_dock3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_stream_dock4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questlist_raw ENABLE ROW LEVEL SECURITY;
