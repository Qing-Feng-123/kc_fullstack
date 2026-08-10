// Edge Function: 查询任务快照（questlist_raw，无历史、实时刷新）
// 路径: GET /functions/v1/kc-query-quests
// 请求头: Authorization: Bearer <API_KEY>
// 返回: { quests: [...按 api_no 升序], count, updated_at }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type"
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...CORS }
    });
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
    }

    try {
        // 1. API Key 鉴权 → user.id
        const apiKey = req.headers.get("authorization")?.replace("Bearer ", "");
        if (!apiKey) return json({ error: "Missing API Key" }, 401);

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const { data: user, error: userError } = await supabase
            .from("users")
            .select("id")
            .eq("api_key", apiKey)
            .single();
        if (userError || !user) return json({ error: "Invalid API Key" }, 401);

        // 2. 全量取出该用户任务快照，按任务ID升序
        const { data: quests, error } = await supabase
            .from("questlist_raw")
            .select("api_no, api_category, api_type, api_state, api_title, api_detail, api_progress_flag, raw_data, updated_at")
            .eq("user_id", user.id)
            .order("api_no", { ascending: true });
        if (error) return json({ error: error.message }, 500);

        const updatedAt = (quests && quests.length > 0)
            ? quests.reduce((m, q) => q.updated_at > m ? q.updated_at : m, quests[0].updated_at)
            : null;

        return json({ quests: quests || [], count: quests?.length ?? 0, updated_at: updatedAt });
    } catch (e) {
        return json({ error: String(e) }, 500);
    }
});
