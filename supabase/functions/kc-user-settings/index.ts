// Edge Function: 前端个人化设定（档案室设定）
// GET  /functions/v1/kc-user-settings           → 读取当前用户设定
// POST /functions/v1/kc-user-settings           → 更新
//   - application/json  { display_name }                  更新提督名
//   - multipart/form-data field=avatar|panel_bg|page_bg   上传图片（同名覆盖）
// 请求头: Authorization: Bearer <API_KEY>
// 图片存储: Storage bucket "user-assets"，路径 {user_id}/{field}.{ext}，upsert 覆盖

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type"
};

const BUCKET = "user-assets";
const ALLOWED_FIELDS = ["avatar", "panel_bg", "page_bg"] as const;
const MAX_SIZE = 8 * 1024 * 1024; // 8MB

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

        // 2. GET：读取设定（无记录时返回空默认值）
        if (req.method === "GET") {
            const { data: settings } = await supabase
                .from("user_settings")
                .select("display_name, hq_name, avatar_url, panel_bg_url, page_bg_url, updated_at")
                .eq("user_id", user.id)
                .maybeSingle();
            return json(settings ?? {
                display_name: null,
                hq_name: null,
                avatar_url: null,
                panel_bg_url: null,
                page_bg_url: null,
                updated_at: null
            });
        }

        if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

        const contentType = req.headers.get("content-type") || "";

        // 3a. POST JSON：更新名称 / 清除图片
        if (contentType.includes("application/json")) {
            const body = await req.json().catch(() => ({}));

            // 清除图片：删除 Storage 文件并置空 URL
            if (body.clear_field) {
                const field = String(body.clear_field);
                if (!ALLOWED_FIELDS.includes(field as typeof ALLOWED_FIELDS[number])) {
                    return json({ error: `clear_field must be one of: ${ALLOWED_FIELDS.join(", ")}` }, 400);
                }
                const { data: objs } = await supabase.storage
                    .from(BUCKET)
                    .list(user.id);
                const targets = (objs || [])
                    .filter((o) => o.name.startsWith(field + "."))
                    .map((o) => `${user.id}/${o.name}`);
                if (targets.length > 0) {
                    await supabase.storage.from(BUCKET).remove(targets);
                }
                const { error } = await supabase
                    .from("user_settings")
                    .upsert({
                        user_id: user.id,
                        [`${field}_url`]: null,
                        updated_at: new Date().toISOString()
                    });
                if (error) return json({ error: error.message }, 500);
                return json({ ok: true, cleared: field });
            }

            // 更新提督名 / 司令部名
            const patch: Record<string, unknown> = {
                user_id: user.id,
                updated_at: new Date().toISOString()
            };
            if (body.display_name !== undefined) {
                patch.display_name = String(body.display_name ?? "").trim().slice(0, 24) || null;
            }
            if (body.hq_name !== undefined) {
                patch.hq_name = String(body.hq_name ?? "").trim().slice(0, 24) || null;
            }
            const { error } = await supabase.from("user_settings").upsert(patch);
            if (error) return json({ error: error.message }, 500);
            return json({ ok: true });
        }

        // 3b. POST multipart：上传图片（同名覆盖）
        if (contentType.includes("multipart/form-data")) {
            const form = await req.formData();
            const field = String(form.get("field") || "");
            const file = form.get("file");

            if (!ALLOWED_FIELDS.includes(field as typeof ALLOWED_FIELDS[number])) {
                return json({ error: `field must be one of: ${ALLOWED_FIELDS.join(", ")}` }, 400);
            }
            if (!(file instanceof File)) return json({ error: "Missing file" }, 400);
            if (!file.type.startsWith("image/")) {
                return json({ error: "Only image files are allowed" }, 400);
            }
            if (file.size > MAX_SIZE) {
                return json({ error: "File too large (max 8MB)" }, 400);
            }

            const ext = (file.name.split(".").pop() || "png").toLowerCase()
                .replace(/[^a-z0-9]/g, "") || "png";
            const path = `${user.id}/${field}.${ext}`;

            // upsert: true → 新图直接覆盖旧图
            const { error: upError } = await supabase.storage
                .from(BUCKET)
                .upload(path, await file.arrayBuffer(), {
                    contentType: file.type,
                    upsert: true
                });
            if (upError) return json({ error: upError.message }, 500);

            const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

            const { error: dbError } = await supabase
                .from("user_settings")
                .upsert({
                    user_id: user.id,
                    [`${field}_url`]: pub.publicUrl,
                    updated_at: new Date().toISOString()
                });
            if (dbError) return json({ error: dbError.message }, 500);

            return json({ ok: true, field, url: pub.publicUrl });
        }

        return json({ error: "Unsupported content-type" }, 400);
    } catch (e) {
        return json({ error: String(e) }, 500);
    }
});
