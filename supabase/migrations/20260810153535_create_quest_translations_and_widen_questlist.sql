-- ============================================================
-- 任务翻译表 + questlist_raw 宽表化
-- 翻译源: KC3Kai/kc3-translations scn/quests.json（{id:{name,desc,memo?}}）
-- 流程: ingest 时按 api_no 查翻译 → 缺失则整表下载覆盖后重查
--       → 仍缺失记 quest_translate_misses（48h 内不再重复下载）
-- ============================================================

-- 1. 翻译表（整表覆盖式刷新，非按用户）
CREATE TABLE IF NOT EXISTS public.quest_translations (
    api_no INT4 PRIMARY KEY,
    name TEXT,                 -- 翻译后任务名
    "desc" TEXT,               -- 翻译后任务描述
    memo TEXT,                 -- 奖励/备注（可空）
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.quest_translations IS '任务简中翻译表（KC3 scn/quests.json 整表覆盖刷新）';

-- 2. 翻译缺失冷却表：记录某 api_no 最近一次“下载覆盖后仍查不到”的时间
CREATE TABLE IF NOT EXISTS public.quest_translate_misses (
    api_no INT4 PRIMARY KEY,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.quest_translate_misses IS '翻译缺失冷却：48h 内相同 api_no 不再触发下载覆盖';

-- 3. questlist_raw 加宽：翻译列 + memo 列
ALTER TABLE public.questlist_raw ADD COLUMN IF NOT EXISTS name_cn TEXT;
ALTER TABLE public.questlist_raw ADD COLUMN IF NOT EXISTS desc_cn TEXT;
ALTER TABLE public.questlist_raw ADD COLUMN IF NOT EXISTS memo_cn TEXT;

-- 4. 新表沿用全项目约定：启用 RLS（Edge Function 走 service_role 不受影响）
ALTER TABLE public.quest_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_translate_misses ENABLE ROW LEVEL SECURITY;
