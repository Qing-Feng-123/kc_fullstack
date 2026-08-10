-- ============================================================
-- 任务列表快照表 questlist_raw
-- 来源: api_get_member/questlist（script_1.19 拦截推送）
-- 约定: 不存历史 —— 每次推送即按 user_id 全量替换（upsert + 清理缺席项）
-- ============================================================

CREATE TABLE IF NOT EXISTS public.questlist_raw (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    api_no INT4 NOT NULL,                  -- 任务ID（唯一键的一部分）
    api_category INT2,                     -- 1編成 2出撃 3演習 4遠征 5補給/入渠 6工廠 7改装 8その他
    api_type INT2,                         -- 1デイリー 2ウィークリー 3マンスリー 4単発 5その他
    api_state INT2,                        -- 1未受领 2受领中 3达成
    api_title TEXT,
    api_detail TEXT,
    api_progress_flag INT2,                -- 0无 1=50% 2=80%
    raw_data JSONB NOT NULL,               -- 单条任务原始 JSON（原样保留）
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, api_no)
);

CREATE INDEX IF NOT EXISTS idx_questlist_raw_user ON public.questlist_raw(user_id);

COMMENT ON TABLE public.questlist_raw IS 'api_get_member/questlist 任务快照（无历史，每次推送全量刷新）';
