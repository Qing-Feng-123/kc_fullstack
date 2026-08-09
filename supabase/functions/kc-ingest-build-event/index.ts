// Edge Function: 接收建造事件（createship / getship / speedchange）
// 路径: POST /functions/v1/kc-ingest-build-event
// 请求头: Authorization: Bearer <API_KEY>
// 报文: { raw_data: { event_type, dock_id, timestamp, material_snapshot, ...事件字段 } }
//
// 核心逻辑（依据 construct_resource_account.md 第四章）：
//   1. 事件写入对应渠流水表 build_stream_dockN
//   2. createship 做 5 秒去重（防脚本重载重复推送）
//   3. getship 触发归档：往回找同渠最近 createship，合并中间 speedchange，
//      写入 build_archive，并删除已归档流水事件
//   4. 顺带执行 72h 滑动窗口清理

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
        // 1. 验证 API Key
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

        // 2. 解析请求体
        const body = await req.json();
        const evt = body.raw_data || body;

        const eventType: string = evt.event_type;
        const dockId: number = parseInt(evt.dock_id);
        const eventTime: string = evt.timestamp || new Date().toISOString();

        if (!["createship", "getship", "speedchange"].includes(eventType)) {
            return new Response(JSON.stringify({ error: `Unknown event_type: ${eventType}` }), { status: 400, headers: JSON_HEADERS });
        }
        if (!(dockId >= 1 && dockId <= 4)) {
            return new Response(JSON.stringify({ error: `Invalid dock_id: ${evt.dock_id}` }), { status: 400, headers: JSON_HEADERS });
        }

        const streamTable = `build_stream_dock${dockId}`;

        // 3. createship 5 秒去重：同渠、时间差 5s 内、投入完全相同 → 视为重复推送
        if (eventType === "createship") {
            const t = new Date(eventTime).getTime();
            const lo = new Date(t - 5000).toISOString();
            const hi = new Date(t + 5000).toISOString();
            const { data: dup } = await supabase
                .from(streamTable)
                .select("id")
                .eq("user_id", user.id)
                .eq("event_type", "createship")
                .eq("fuel", evt.fuel ?? 0)
                .eq("ammo", evt.ammo ?? 0)
                .eq("steel", evt.steel ?? 0)
                .eq("bauxite", evt.bauxite ?? 0)
                .gte("timestamp", lo)
                .lte("timestamp", hi)
                .limit(1);

            if (dup && dup.length > 0) {
                return new Response(JSON.stringify({ success: true, deduplicated: true }), { status: 200, headers: JSON_HEADERS });
            }
        }

        // 4. 写入流水表
        const row: Record<string, unknown> = {
            user_id: user.id,
            event_type: eventType,
            timestamp: eventTime,
            material_snapshot: evt.material_snapshot ?? null
        };
        if (eventType === "createship") {
            Object.assign(row, {
                fuel: evt.fuel ?? 0,
                ammo: evt.ammo ?? 0,
                steel: evt.steel ?? 0,
                bauxite: evt.bauxite ?? 0,
                is_large: !!evt.is_large,
                devmat_inferred: evt.devmat_inferred ?? 1
            });
        } else if (eventType === "getship") {
            Object.assign(row, {
                ship_id: evt.ship_id ?? null,
                ship_instance_id: evt.ship_instance_id ?? null
            });
        } else if (eventType === "speedchange") {
            Object.assign(row, { flame_inferred: evt.flame_inferred ?? 1 });
        }

        const { error: insertError } = await supabase.from(streamTable).insert(row);
        if (insertError) {
            return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers: JSON_HEADERS });
        }

        // 5. getship 触发事件驱动归档
        let archived = false;
        if (eventType === "getship") {
            archived = await archiveBuild(supabase, streamTable, user.id, dockId, eventTime, evt);
        }

        // 6. 72h 滑动窗口清理（顺带执行，低成本）
        await supabase.rpc("cleanup_build_streams");

        return new Response(JSON.stringify({ success: true, archived }), { status: 200, headers: JSON_HEADERS });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: JSON_HEADERS });
    }
});

// 归档流程：getship 往回找同渠最近 createship，融合中间 speedchange
async function archiveBuild(
    supabase: ReturnType<typeof createClient>,
    streamTable: string,
    userId: string,
    dockId: number,
    getshipTime: string,
    getshipEvt: Record<string, unknown>
): Promise<boolean> {
    // 步骤 2：往回找最近的 createship（72h 边界内）
    const windowStart = new Date(new Date(getshipTime).getTime() - 72 * 3600 * 1000).toISOString();
    const { data: createships } = await supabase
        .from(streamTable)
        .select("*")
        .eq("user_id", userId)
        .eq("event_type", "createship")
        .lt("timestamp", getshipTime)
        .gt("timestamp", windowStart)
        .order("timestamp", { ascending: false })
        .limit(1);

    if (!createships || createships.length === 0) {
        // 孤儿 getship：不归档，留在流水表等 72h 后删除
        return false;
    }
    const createship = createships[0];

    // 步骤 3：找中间所有 speedchange
    const { data: speedchanges } = await supabase
        .from(streamTable)
        .select("*")
        .eq("user_id", userId)
        .eq("event_type", "speedchange")
        .gt("timestamp", createship.timestamp)
        .lt("timestamp", getshipTime)
        .order("timestamp", { ascending: true });

    const speedupList = speedchanges ?? [];

    // 步骤 4：合并写入 build_archive
    const { error: archiveError } = await supabase.from("build_archive").insert({
        user_id: userId,
        dock_id: dockId,
        started_at: createship.timestamp,
        completed_at: getshipTime,
        build_type: createship.is_large ? "large" : "normal",
        speedup: speedupList.length > 0,
        input_fuel: createship.fuel,
        input_ammo: createship.ammo,
        input_steel: createship.steel,
        input_bauxite: createship.bauxite,
        input_devmat: createship.devmat_inferred,
        input_flame: speedupList.length > 0 ? speedupList[0].flame_inferred : null,
        output_ship_id: getshipEvt.ship_id ?? null,
        output_ship_instance_id: getshipEvt.ship_instance_id ?? null,
        before_material_snapshot: createship.material_snapshot ?? null,
        after_material_snapshot: getshipEvt.material_snapshot ?? null
    });

    if (archiveError) {
        console.error("archive insert failed:", archiveError.message);
        return false;
    }

    // 步骤 5：删除已归档的流水事件（createship ~ getship 区间）
    await supabase
        .from(streamTable)
        .delete()
        .eq("user_id", userId)
        .gte("timestamp", createship.timestamp)
        .lte("timestamp", getshipTime);

    return true;
}
