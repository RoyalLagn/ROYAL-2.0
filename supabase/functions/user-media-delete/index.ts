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
    const { url } = await request.json();
    const value = String(url ?? "");
    const publicId = extractCloudinaryPublicId(value);
    if (!publicId) return Response.json({ ok: true, managed: false }, { headers: cors });

    const prefixes = [
      `royallagn/documents/${user.id}/`,
      `royallagn/document/${user.id}/`,
      `royallagn/applications/${user.id}/`,
      `royallagn/general/${user.id}/`,
      `royallagn/payout_destinations/${user.id}/`,
    ];
    const { data: application } = await client
      .from("vendor_applications")
      .select("logo_url,cover_image_url,business_documents")
      .eq("profile_id", user.id)
      .maybeSingle();
    const ownedUrls = new Set(
      [
        application?.logo_url,
        application?.cover_image_url,
        ...(((application?.business_documents ?? []) as { url?: string }[]).map((document) => document.url)),
      ].filter((item): item is string => typeof item === "string" && item.length > 0),
    );
    if (publicId.startsWith("royallagn/general/") && ownedUrls.has(value)) {
      prefixes.push("royallagn/general/");
    }

    await assertMediaUnreferenced(value);
    await destroyCloudinaryUrl(value, prefixes);
    return Response.json({ ok: true, managed: true, provider: "cloudinary" }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete media" }, { status: 400, headers: cors });
  }
});
