// Edge Function: 接收 deck 数据
// 路径: POST /functions/v1/kc-ingest-deck
// 请求头: Authorization: Bearer <API_KEY>

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
    // CORS 预检
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "authorization, content-type"
            }
        });
    }

    try {
        // 1. 验证 API Key
        const apiKey = req.headers.get("authorization")?.replace("Bearer ", "");
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "Missing API Key" }), {
                status: 401,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        // 2. 初始化 Supabase 客户端
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // 3. 查找用户
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("id")
            .eq("api_key", apiKey)
            .single();

        if (userError || !user) {
            return new Response(JSON.stringify({ error: "Invalid API Key" }), {
                status: 403,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        // 4. 解析请求体
        const body = await req.json();
        const rawData = body.raw_data || body;

        // 5. 提取 deck 字段
        const deckData = {
            user_id: user.id,
            api_id: rawData.api_id,
            api_name: rawData.api_name,
            api_name_id: rawData.api_name_id,
            api_mission_0: rawData.api_mission?.[0],
            api_mission_1: rawData.api_mission?.[1],
            api_mission_2: rawData.api_mission?.[2],
            api_mission_3: rawData.api_mission?.[3],
            api_flagship: rawData.api_flagship,
            api_ship_0: rawData.api_ship?.[0],
            api_ship_1: rawData.api_ship?.[1],
            api_ship_2: rawData.api_ship?.[2],
            api_ship_3: rawData.api_ship?.[3],
            api_ship_4: rawData.api_ship?.[4],
            api_ship_5: rawData.api_ship?.[5],
            raw_data: rawData
        };

        // 6. UPSERT：同一用户同一舰队只保留最新数据
        const { error: upsertError } = await supabase
            .from("deck_raw")
            .upsert(deckData, { onConflict: "user_id,api_id" });

        if (upsertError) {
            return new Response(JSON.stringify({ error: upsertError.message }), {
                status: 500,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
    }
});
