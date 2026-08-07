// Edge Function: 查询舰队数据（联合查询 deck_raw + ship2_raw + ship_master）
// 路径: GET /functions/v1/kc-query-fleet?fleet_no=1
// 请求头: Authorization: Bearer <API_KEY>

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

        // 2. fleet_no 参数校验（1-4）
        const url = new URL(req.url);
        const fleetNo = parseInt(url.searchParams.get("fleet_no") || "1", 10);
        if (isNaN(fleetNo) || fleetNo < 1 || fleetNo > 4) {
            return json({ error: "fleet_no must be 1-4" }, 400);
        }

        // 3. 查舰队编成（deck_raw，舰位为 api_ship_0..5 平铺列）
        const { data: deck, error: deckError } = await supabase
            .from("deck_raw")
            .select("api_id, api_name, api_ship_0, api_ship_1, api_ship_2, api_ship_3, api_ship_4, api_ship_5, created_at")
            .eq("user_id", user.id)
            .eq("api_id", fleetNo)
            .single();
        if (deckError || !deck) {
            return json({ error: `Fleet ${fleetNo} not found` }, 404);
        }

        // 4. 组装舰位数组并过滤无效位（空位为 -1 / null / 0）
        const shipIds: number[] = [
            deck.api_ship_0, deck.api_ship_1, deck.api_ship_2,
            deck.api_ship_3, deck.api_ship_4, deck.api_ship_5
        ];
        const validIds = shipIds.filter(
            (id) => id !== null && id !== undefined && id !== -1 && id !== 0
        );

        // 5. 查舰船数据（ship2_raw 全字段）+ 图鉴对照（ship_master）
        let ships: unknown[] = [];
        if (validIds.length > 0) {
            const { data: shipRows, error: shipError } = await supabase
                .from("ship2_raw")
                .select("*")
                .eq("user_id", user.id)
                .in("api_id", validIds);
            if (shipError) return json({ error: shipError.message }, 500);

            // 5.5 图鉴对照：api_ship_id → 舰名
            const typeIds = [...new Set((shipRows || []).map((s) => s.api_ship_id))];
            const { data: masters } = await supabase
                .from("ship_master")
                .select("api_ship_id, api_name, api_name_cn, api_stype_name")
                .in("api_ship_id", typeIds);
            const mst = new Map((masters || []).map((m) => [m.api_ship_id, m]));

            // 6. 按舰队编成顺序排序并合并舰名
            const byId = new Map((shipRows || []).map((s) => [s.api_id, s]));
            ships = validIds
                .map((id) => byId.get(id))
                .filter(Boolean)
                .map((s) => {
                    const m = mst.get(s.api_ship_id);
                    return {
                        ...s,
                        api_name: m?.api_name ?? null,
                        api_name_cn: m?.api_name_cn ?? null,
                        api_stype_name: m?.api_stype_name ?? null
                    };
                });
        }

        // 7. 返回
        return json({
            fleet: {
                api_id: deck.api_id,
                api_name: deck.api_name,
                ship_ids: shipIds
            },
            ships,
            updated_at: deck.created_at
        });
    } catch (e) {
        return json({ error: String(e) }, 500);
    }
});
