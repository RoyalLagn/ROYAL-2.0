import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { destroyCloudinaryUrl, extractCloudinaryPublicId, assertMediaUnreferenced } from "../_shared/cloudinaryAdmin.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = request.headers.get("Authorization") ?? "";
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error("Authentication required");
    const { data: profile } = await client.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
    if (!profile?.is_active || !["admin", "super_admin"].includes(profile.role)) {
      throw new Error("Admin access required");
    }
    const { url } = await request.json();
    const value = String(url ?? "");
    if (!extractCloudinaryPublicId(value)) return Response.json({ ok: true, managed: false }, { headers: cors });
    await assertMediaUnreferenced(value);
    await destroyCloudinaryUrl(value, [
      "royallagn/hero/",
      "royallagn/categories/",
      "royallagn/general/",
    ]);
    return Response.json({ ok: true, managed: true, provider: "cloudinary" }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete media" }, { status: 400, headers: cors });
  }
});
