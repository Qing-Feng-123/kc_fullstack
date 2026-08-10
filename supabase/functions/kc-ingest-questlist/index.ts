// Edge Function: 接收 questlist 全量刷新（api_get_member/questlist）
// 路径: POST /functions/v1/kc-ingest-questlist
// 请求头: Authorization: Bearer <API_KEY>
// 报文: { raw_data: { timestamp, quests: [...] } }
//
// 作用: 不存历史。每次收到推送即把该用户的 questlist_raw 全量替换为最新快照：
//   1. upsert 每条任务（按 user_id + api_no）
//   2. 删除本次快照中不存在的任务（已完成/消失的立即清除）

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type"
};
const JSON_HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

function toInt(v: unknown): number | null {
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
    }

    try {
        // 1. API Key 鉴权 → user.id
        const apiKey = req.headers.get("authorization")?.replace("Bearer ", "");
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "Missing API Key" }), { status: 401, headers: JSON_HEADERS });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const { data: user, error: userError } = await supabase
            .from("users")
            .select("id")
            .eq("api_key", apiKey)
            .single();

        if (userError || !user) {
            return new Response(JSON.stringify({ error: "Invalid API Key" }), { status: 403, headers: JSON_HEADERS });
        }

        // 2. 解析报文
        const body = await req.json();
        const payload = body.raw_data || body;
        const questList = Array.isArray(payload.quests) ? payload.quests : [];
        if (questList.length === 0) {
            return new Response(JSON.stringify({ error: "Empty quests" }), { status: 400, headers: JSON_HEADERS });
        }

        // 3. 组装行（api_no 去重，后者覆盖前者）
        const byNo = new Map<number, Record<string, unknown>>();
        for (const q of questList) {
            if (!q || typeof q !== "object") continue;
            const apiNo = toInt(q.api_no);
            if (!apiNo || apiNo <= 0) continue;   // api_list 里的占位项是 -1，跳过
            byNo.set(apiNo, {
                user_id: user.id,
                api_no: apiNo,
                api_category: toInt(q.api_category),
                api_type: toInt(q.api_type),
                api_state: toInt(q.api_state),
                api_title: q.api_title ?? null,
                api_detail: q.api_detail ?? null,
                api_progress_flag: toInt(q.api_progress_flag),
                raw_data: q,
                updated_at: new Date().toISOString()
            });
        }
        const rows = Array.from(byNo.values());
        if (rows.length === 0) {
            return new Response(JSON.stringify({ error: "No valid quest entries" }), { status: 400, headers: JSON_HEADERS });
        }

        // 4. 全量刷新：先 upsert，再删除本次快照缺席的旧行（无历史残留）
        const { error: upsertError } = await supabase
            .from("questlist_raw")
            .upsert(rows, { onConflict: "user_id,api_no" });
        if (upsertError) {
            return new Response(JSON.stringify({ error: upsertError.message }), { status: 500, headers: JSON_HEADERS });
        }

        const keepNos = rows.map((r) => r.api_no as number);
        const { error: delError } = await supabase
            .from("questlist_raw")
            .delete()
            .eq("user_id", user.id)
            .not("api_no", "in", `(${keepNos.join(",")})`);
        if (delError) {
            return new Response(JSON.stringify({ error: delError.message }), { status: 500, headers: JSON_HEADERS });
        }

        return new Response(JSON.stringify({ success: true, count: rows.length }), { status: 200, headers: JSON_HEADERS });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: JSON_HEADERS });
    }
});
