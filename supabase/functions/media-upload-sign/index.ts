import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signCloudinaryUpload } from "../_shared/cloudinaryUpload.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error("Authentication required");
    const { data: profile } = await client.from("profiles").select("role,is_active").eq("id", user.id).single();
    if (!profile?.is_active) throw new Error("Active account required");
    const { mimeType, fileSize, folder: requestedFolder } = await request.json();
    const document = mimeType === "application/pdf";
    if (!document && !["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(mimeType)) throw new Error("Unsupported media type");
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > (document ? 10 : 5) * 1024 * 1024) throw new Error("Media file size is not allowed");
    const isAdmin = ["admin", "super_admin"].includes(profile.role);
    let folder: string;
    if (isAdmin && ["royallagn/hero", "royallagn/categories", "royallagn/general"].includes(requestedFolder)) {
      // The existing admin RLS check also enforces the project's MFA policy.
      const { error } = await client.from("hero_slides").select("id").limit(1);
      if (error) throw error;
      folder = requestedFolder;
    } else {
      const purpose = String(requestedFolder ?? "").startsWith("royallagn/documents") ? "documents"
        : String(requestedFolder ?? "").startsWith("royallagn/payout_destinations") ? "payout_destinations" : "general";
      folder = `royallagn/${purpose}/${user.id}`;
    }
    return Response.json(await signCloudinaryUpload(folder, document ? "raw" : "image"), { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to authorize upload" }, { status: 400, headers: cors });
  }
});
