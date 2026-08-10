// Edge Function: 接收 questlist 全量刷新（api_get_member/questlist）+ 翻译合并为宽表
// 路径: POST /functions/v1/kc-ingest-questlist
// 请求头: Authorization: Bearer <API_KEY>
// 报文: { raw_data: { timestamp, quests: [...] } }
//
// 流程:
//   1. 提取全部 api_no，查 quest_translations 翻译表
//   2. 缺失的 ID 先查 quest_translate_misses 冷却表（48h 内跳过下载，直接标未翻译）
//   3. 不在冷却期的 → 整表下载 KC3 scn/quests.json 覆盖 quest_translations，重查
//      （翻译表中含 915LQ1 等季节限定变体键，非纯数字键一律跳过，避免与主键冲突）
//   4. 仍缺失 → 标记“新任务未翻译”并写入冷却表
//   5. 原字段 + 翻译列(name_cn/desc_cn/memo_cn) 组成宽行，upsert 进 questlist_raw（无历史全量刷新）

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type"
};
const JSON_HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
const TRANSLATION_URL = "https://raw.githubusercontent.com/KC3Kai/kc3-translations/master/data/scn/quests.json";
const UNTRANSLATED = "新任务未翻译";
const MISS_COOLDOWN_HOURS = 48;
const TR_CHUNK = 100;   // 翻译表批量插入粒度（避免单批过大静默失败）

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

        // 3. 按 api_no 去重收集任务
        const byNo = new Map<number, Record<string, unknown>>();
        for (const q of questList) {
            if (!q || typeof q !== "object") continue;
            const apiNo = toInt(q.api_no);
            if (!apiNo || apiNo <= 0) continue;   // api_list 里的占位项是 -1，跳过
            byNo.set(apiNo, q);
        }
        if (byNo.size === 0) {
            return new Response(JSON.stringify({ error: "No valid quest entries" }), { status: 400, headers: JSON_HEADERS });
        }
        const allNos = Array.from(byNo.keys());

        // 4. 查翻译表
        const trMap = new Map<number, { name: string | null; desc: string | null; memo: string | null }>();
        const fetchTranslations = async (nos: number[]) => {
            for (let i = 0; i < nos.length; i += TR_CHUNK) {
                const { data } = await supabase
                    .from("quest_translations")
                    .select("api_no, name, desc, memo")
                    .in("api_no", nos.slice(i, i + TR_CHUNK));
                for (const t of data || []) trMap.set(t.api_no, t);
            }
        };
        await fetchTranslations(allNos);
        let missing = allNos.filter((n) => !trMap.has(n));

        // 5. 缺失处理：先过滤掉 48h 冷却期内的（不再下载，直接标未翻译）
        let downloaded = false;
        let downloadError: string | null = null;
        if (missing.length > 0) {
            const { data: misses } = await supabase
                .from("quest_translate_misses")
                .select("api_no, last_attempt_at")
                .in("api_no", missing);
            const cutoff = Date.now() - MISS_COOLDOWN_HOURS * 3600 * 1000;
            const cooled = new Set(
                (misses || [])
                    .filter((m) => new Date(m.last_attempt_at).getTime() > cutoff)
                    .map((m) => m.api_no as number)
            );
            const needDownload = missing.filter((n) => !cooled.has(n));

            // 6. 不在冷却期 → 整表下载并覆盖翻译表，重查
            if (needDownload.length > 0) {
                try {
                    const res = await fetch(TRANSLATION_URL);
                    if (!res.ok) {
                        downloadError = `fetch HTTP ${res.status}`;
                    } else {
                        const json: Record<string, { name?: string; desc?: string; memo?: string }> = await res.json();
                        const trRows = Object.entries(json)
                            .filter(([id]) => /^\d+$/.test(id))   // 跳过 915LQ1 等变体键，防止主键冲突
                            .map(([id, v]) => ({
                                api_no: parseInt(id, 10),
                                name: v?.name ?? null,
                                desc: v?.desc ?? null,
                                memo: v?.memo ?? null,
                                updated_at: new Date().toISOString()
                            }));
                        if (trRows.length > 0) {
                            // 整表覆盖：先清空再分批重写，任一批失败即报错
                            const { error: delAllErr } = await supabase
                                .from("quest_translations").delete().not("api_no", "is", null);
                            if (delAllErr) throw new Error("clear translations: " + delAllErr.message);
                            for (let i = 0; i < trRows.length; i += TR_CHUNK) {
                                const { error: insErr } = await supabase
                                    .from("quest_translations")
                                    .insert(trRows.slice(i, i + TR_CHUNK));
                                if (insErr) throw new Error(`insert chunk ${i / TR_CHUNK}: ${insErr.message}`);
                            }
                            downloaded = true;
                            trMap.clear();
                            await fetchTranslations(allNos);
                            missing = allNos.filter((n) => !trMap.has(n));
                        }
                    }
                } catch (e) {
                    downloadError = String(e?.message ?? e);
                }

                // 7. 下载覆盖后仍缺失 → 写入冷却表（48h 内不再下载）
                if (missing.length > 0) {
                    await supabase.from("quest_translate_misses").upsert(
                        missing.map((n) => ({ api_no: n, last_attempt_at: new Date().toISOString() }))
                    );
                }
            }
        }

        // 8. 组装宽表行（原字段 + 翻译列）
        const nowIso = new Date().toISOString();
        const rows = allNos.map((apiNo) => {
            const q = byNo.get(apiNo)!;
            const tr = trMap.get(apiNo);
            return {
                user_id: user.id,
                api_no: apiNo,
                api_category: toInt(q.api_category),
                api_type: toInt(q.api_type),
                api_state: toInt(q.api_state),
                api_title: q.api_title ?? null,
                api_detail: q.api_detail ?? null,
                api_progress_flag: toInt(q.api_progress_flag),
                raw_data: q,
                name_cn: tr?.name ?? UNTRANSLATED,
                desc_cn: tr?.desc ?? UNTRANSLATED,
                memo_cn: tr ? (tr.memo ?? null) : UNTRANSLATED,
                updated_at: nowIso
            };
        });

        // 9. 全量刷新 questlist_raw：upsert + 删除缺席项（无历史残留）
        const { error: upsertError } = await supabase
            .from("questlist_raw")
            .upsert(rows, { onConflict: "user_id,api_no" });
        if (upsertError) {
            return new Response(JSON.stringify({ error: upsertError.message }), { status: 500, headers: JSON_HEADERS });
        }

        const { error: delError } = await supabase
            .from("questlist_raw")
            .delete()
            .eq("user_id", user.id)
            .not("api_no", "in", `(${allNos.join(",")})`);
        if (delError) {
            return new Response(JSON.stringify({ error: delError.message }), { status: 500, headers: JSON_HEADERS });
        }

        return new Response(JSON.stringify({
            success: true,
            count: rows.length,
            translated: rows.filter((r) => r.name_cn !== UNTRANSLATED).length,
            untranslated: missing.length,
            translation_table_refreshed: downloaded,
            download_error: downloadError
        }), { status: 200, headers: JSON_HEADERS });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: JSON_HEADERS });
    }
});
