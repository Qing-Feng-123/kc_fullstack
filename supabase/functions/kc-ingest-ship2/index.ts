// Edge Function: 接收 ship2 数据
// 路径: POST /functions/v1/kc-ingest-ship2
// 请求头: Authorization: Bearer <API_KEY>

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
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

        const body = await req.json();
        // ship2 返回的是数组，包含所有舰船
        const ships = body.raw_data || body;
        const shipArray = Array.isArray(ships) ? ships : [ships];

        // 批量插入所有舰船
        const insertData = shipArray.map((ship) => ({
            user_id: user.id,
            api_id: ship.api_id,
            api_sortno: ship.api_sortno,
            api_ship_id: ship.api_ship_id,
            api_lv: ship.api_lv,
            api_exp: ship.api_exp?.[0],
            api_nowhp: ship.api_nowhp,
            api_maxhp: ship.api_maxhp,
            api_soku: ship.api_soku,
            api_leng: ship.api_leng,
            api_slot_0: ship.api_slot?.[0],
            api_slot_1: ship.api_slot?.[1],
            api_slot_2: ship.api_slot?.[2],
            api_slot_3: ship.api_slot?.[3],
            api_slot_4: ship.api_slot?.[4],
            api_onslot_0: ship.api_onslot?.[0],
            api_onslot_1: ship.api_onslot?.[1],
            api_onslot_2: ship.api_onslot?.[2],
            api_onslot_3: ship.api_onslot?.[3],
            api_onslot_4: ship.api_onslot?.[4],
            api_kyouka_0: ship.api_kyouka?.[0],
            api_kyouka_1: ship.api_kyouka?.[1],
            api_kyouka_2: ship.api_kyouka?.[2],
            api_kyouka_3: ship.api_kyouka?.[3],
            api_kyouka_4: ship.api_kyouka?.[4],
            api_kyouka_5: ship.api_kyouka?.[5],
            api_backs: ship.api_backs,
            api_fuel: ship.api_fuel,
            api_bull: ship.api_bull,
            api_slotnum: ship.api_slotnum,
            api_ndock_time: ship.api_ndock_time,
            api_ndock_item_0: ship.api_ndock_item?.[0],
            api_ndock_item_1: ship.api_ndock_item?.[1],
            api_srate: ship.api_srate,
            api_cond: ship.api_cond,
            api_karyoku_0: ship.api_karyoku?.[0],
            api_karyoku_1: ship.api_karyoku?.[1],
            api_raisou_0: ship.api_raisou?.[0],
            api_raisou_1: ship.api_raisou?.[1],
            api_taiku_0: ship.api_taiku?.[0],
            api_taiku_1: ship.api_taiku?.[1],
            api_soukou_0: ship.api_soukou?.[0],
            api_soukou_1: ship.api_soukou?.[1],
            api_kaihi_0: ship.api_kaihi?.[0],
            api_kaihi_1: ship.api_kaihi?.[1],
            api_taisen_0: ship.api_taisen?.[0],
            api_taisen_1: ship.api_taisen?.[1],
            api_sakuteki_0: ship.api_sakuteki?.[0],
            api_sakuteki_1: ship.api_sakuteki?.[1],
            api_lucky_0: ship.api_lucky?.[0],
            api_lucky_1: ship.api_lucky?.[1],
            api_locked: ship.api_locked,
            api_locked_equip: ship.api_locked_equip,
            api_sally_area: ship.api_sally_area,
            raw_data: ship
        }));

        const { error: insertError } = await supabase
            .from("ship2_raw")
            .upsert(insertData, { onConflict: "user_id,api_id" });

        if (insertError) {
            return new Response(JSON.stringify({ error: insertError.message }), {
                status: 500,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        return new Response(JSON.stringify({ success: true, count: insertData.length }), {
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
