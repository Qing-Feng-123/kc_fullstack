// Edge Function: 查询建造记录与资源消耗（build_archive）
// 路径: GET /functions/v1/kc-query-builds?date=YYYY-MM-DD&days=30
// 请求头: Authorization: Bearer <API_KEY>
//
// 参数：
//   date — 东京时间日期，返回当日建造记录；缺省为东京今天
//   days — 消耗聚合天数（1/7/30），按建造开始日(东京)分组求和
// 返回：
//   { date, records: [...], daily: [{date, fuel, ammo, steel, bauxite, count}] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type"
};
const TOKYO_OFFSET_MS = 9 * 3600 * 1000;

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...CORS }
    });
}

/** 当前东京日期 YYYY-MM-DD */
function tokyoToday(): string {
    return new Date(Date.now() + TOKYO_OFFSET_MS).toISOString().slice(0, 10);
}

/** 任意 Date → 东京日期 YYYY-MM-DD */
function tokyoDate(d: Date): string {
    return new Date(d.getTime() + TOKYO_OFFSET_MS).toISOString().slice(0, 10);
}

/** 东京某日 00:00 对应的 UTC Date */
function tokyoDayStart(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00+09:00`);
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
    }

    try {
        // 1. API Key 鉴权
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

        // 2. 参数
        const url = new URL(req.url);
        const date = url.searchParams.get("date") || tokyoToday();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return json({ error: "date must be YYYY-MM-DD (Tokyo)" }, 400);
        }
        const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30", 10) || 30, 1), 90);

        // 3. 当日记录（东京日界）
        const dayStart = tokyoDayStart(date);
        const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
        const { data: records, error: recError } = await supabase
            .from("build_archive")
            .select("*")
            .eq("user_id", user.id)
            .gte("started_at", dayStart.toISOString())
            .lt("started_at", dayEnd.toISOString())
            .order("started_at", { ascending: true });
        if (recError) return json({ error: recError.message }, 500);

        // 3.5 结果舰名对照
        const shipIds = [...new Set((records || []).map(r => r.output_ship_id).filter(Boolean))];
        let nameMap = new Map<number, { api_name: string; api_name_cn: string }>();
        if (shipIds.length > 0) {
            const { data: masters } = await supabase
                .from("ship_master")
                .select("api_ship_id, api_name, api_name_cn")
                .in("api_ship_id", shipIds);
            nameMap = new Map((masters || []).map(m => [m.api_ship_id, m]));
        }
        const recordsWithName = (records || []).map(r => ({
            ...r,
            output_ship_name: nameMap.get(r.output_ship_id)?.api_name_cn
                ?? nameMap.get(r.output_ship_id)?.api_name ?? null
        }));

        // 4. 近 N 天消耗聚合（按东京日分组，含无记录日补零）
        const rangeStart = new Date(dayStart.getTime() - (days - 1) * 24 * 3600 * 1000);
        const { data: rangeRows, error: rangeError } = await supabase
            .from("build_archive")
            .select("started_at, input_fuel, input_ammo, input_steel, input_bauxite")
            .eq("user_id", user.id)
            .gte("started_at", rangeStart.toISOString())
            .lt("started_at", dayEnd.toISOString());
        if (rangeError) return json({ error: rangeError.message }, 500);

        const daily: Record<string, { date: string; fuel: number; ammo: number; steel: number; bauxite: number; count: number }> = {};
        for (let i = days - 1; i >= 0; i--) {
            const d = tokyoDate(new Date(dayStart.getTime() - i * 24 * 3600 * 1000));
            daily[d] = { date: d, fuel: 0, ammo: 0, steel: 0, bauxite: 0, count: 0 };
        }
        for (const r of rangeRows || []) {
            const d = tokyoDate(new Date(r.started_at));
            if (daily[d]) {
                daily[d].fuel += r.input_fuel || 0;
                daily[d].ammo += r.input_ammo || 0;
                daily[d].steel += r.input_steel || 0;
                daily[d].bauxite += r.input_bauxite || 0;
                daily[d].count += 1;
            }
        }

        return json({
            date,
            days,
            records: recordsWithName,
            daily: Object.values(daily)
        });
    } catch (e) {
        return json({ error: String(e) }, 500);
    }
});
