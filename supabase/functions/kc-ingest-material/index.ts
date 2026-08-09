// Edge Function: 接收母港资源快照（api_port/port 的 api_material）
// 路径: POST /functions/v1/kc-ingest-material
// 请求头: Authorization: Bearer <API_KEY>
// 报文: { raw_data: { timestamp, material_snapshot: [fuel, ammo, steel, bauxite, flame, bucket, devmat, screw] } }
//
// 作用（依据 construct_resource_account.md 第六章）：
// material_snapshot 是隐式消耗（开发资材/喷火硬编码值）的校验基准。
// 快照按 dock_id=0 写入渠1流水表（快照与渠无关，仅作时间轴上的校验点），
// 72h 后随滑动窗口自动清除。

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type"
};
const JSON_HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
// 时间戳兼容：接受 ISO 字符串或 epoch 毫秒/秒数字，统一输出 ISO 字符串
function normalizeTimestamp(ts: unknown): string {
    if (typeof ts === "number" && Number.isFinite(ts)) {
        const ms = ts < 1e12 ? ts * 1000 : ts;  // 秒级时间戳转毫秒
        return new Date(ms).toISOString();
    }
    if (typeof ts === "string" && ts.trim()) {
        if (/^\d+$/.test(ts.trim())) {
            const n = Number(ts.trim());
            return new Date(n < 1e12 ? n * 1000 : n).toISOString();
        }
        return ts;
    }
    return new Date().toISOString();
}


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
        const eventTime: string = normalizeTimestamp(payload.timestamp);
        const snapshot = payload.material_snapshot;

        if (!Array.isArray(snapshot) || snapshot.length !== 8) {
            return new Response(JSON.stringify({ error: "material_snapshot must be an 8-element array" }), { status: 400, headers: JSON_HEADERS });
        }

        // 快照与渠无关，统一写入 dock1 流水表作为时间轴校验点
        const { error: insertError } = await supabase.from("build_stream_dock1").insert({
            user_id: user.id,
            event_type: "material_snapshot",
            timestamp: eventTime,
            material_snapshot: snapshot.map((v: unknown) => parseInt(String(v)) || 0)
        });

        if (insertError) {
            return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers: JSON_HEADERS });
        }

        return new Response(JSON.stringify({ success: true }), { status: 200, headers: JSON_HEADERS });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: JSON_HEADERS });
    }
});
