// Edge Function: 接收 kdock 全量刷新（api_get_member/kdock）
// 路径: POST /functions/v1/kc-ingest-kdock
// 请求头: Authorization: Bearer <API_KEY>
// 报文: { raw_data: { timestamp, kdock_data: [...4渠], material_snapshot } }
//
// 作用（依据 construct_resource_account.md 5.4）：校对/补全。
// 把每条渠状态作为 kdock_refresh 事件写入对应渠流水表，
// 其中 api_item1~api_item4 是投入资源的冗余副本，可与 createship 交叉验证。

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type"
};
const JSON_HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
    }

    try {
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

        const body = await req.json();
        const payload = body.raw_data || body;
        const eventTime: string = payload.timestamp || new Date().toISOString();
        const snapshot = payload.material_snapshot ?? null;

        const kdockList = Array.isArray(payload.kdock_data) ? payload.kdock_data : [];
        if (kdockList.length === 0) {
            return new Response(JSON.stringify({ error: "Empty kdock_data" }), { status: 400, headers: JSON_HEADERS });
        }

        // 每条渠写一条 kdock_refresh 事件到对应流水表
        let inserted = 0;
        for (const kdock of kdockList) {
            const dockId = parseInt(kdock.api_id);
            if (!(dockId >= 1 && dockId <= 4)) continue;

            const { error } = await supabase.from(`build_stream_dock${dockId}`).insert({
                user_id: user.id,
                event_type: "kdock_refresh",
                timestamp: eventTime,
                kdock_data: kdock,
                material_snapshot: snapshot
            });
            if (!error) inserted++;
        }

        await supabase.rpc("cleanup_build_streams");

        return new Response(JSON.stringify({ success: true, inserted }), { status: 200, headers: JSON_HEADERS });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: JSON_HEADERS });
    }
});
