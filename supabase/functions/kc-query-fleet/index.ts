// Edge Function: 查询舰队数据
// 路径: GET /functions/v1/kc-query-fleet?fleet_no=1
// 请求头: Authorization: Bearer <API_KEY>

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "authorization, content-type"
            }
        });
    }

    try {
        const apiKey = req.headers.get("authorization")?.replace("Bearer ", "");
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "Missing API Key" }), {
                status: 401,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
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
            return new Response(JSON.stringify({ error: "Invalid API Key" }), {
                status: 403,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        // 获取查询参数
        const url = new URL(req.url);
        const fleetNo = parseInt(url.searchParams.get("fleet_no") || "1");

        // 1. 获取最新 deck 数据
        const { data: deckData, error: deckError } = await supabase
            .from("deck_raw")
            .select("*")
            .eq("user_id", user.id)
            .eq("api_id", fleetNo)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        if (deckError || !deckData) {
            return new Response(JSON.stringify({ error: "No fleet data found" }), {
                status: 404,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        // 2. 获取舰船ID列表
        const shipIds = [
            deckData.api_ship_0,
            deckData.api_ship_1,
            deckData.api_ship_2,
            deckData.api_ship_3,
            deckData.api_ship_4,
            deckData.api_ship_5
        ].filter(id => id !== null && id !== -1);

        // 3. 获取这些舰船的详细数据
        const { data: shipsData, error: shipsError } = await supabase
            .from("ship2_raw")
            .select("*")
            .eq("user_id", user.id)
            .in("api_id", shipIds);

        if (shipsError) {
            return new Response(JSON.stringify({ error: shipsError.message }), {
                status: 500,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        // 4. 组装响应
        const response = {
            fleet_no: fleetNo,
            fleet_name: deckData.api_name,
            mission: {
                status: deckData.api_mission_0,
                expedition_id: deckData.api_mission_1,
                return_time: deckData.api_mission_2
            },
            ships: shipsData || []
        };

        return new Response(JSON.stringify(response), {
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
