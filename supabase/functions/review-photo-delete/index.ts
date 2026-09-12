import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { presignBunnyObject } from "../_shared/bunnyS3.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");
    const { publicId, reviewId } = await request.json();
    const expectedPrefix = `royallagn/reviews/${user.id}/`;
    if (
      typeof publicId !== "string" ||
      !publicId.startsWith(expectedPrefix) ||
      publicId.includes("..")
    ) {
      throw new Error("Review photo not found");
    }
    if (reviewId) {
      const { data: review } = await supabase
        .from("reviews")
        .select("id,image_urls")
        .eq("id", reviewId)
        .eq("profile_id", user.id)
        .maybeSingle();
      const encodedId = encodeURIComponent(publicId).replaceAll("%2F", "/");
      const belongsToReview = review?.image_urls?.some(
        (url: string) => url.includes(publicId) || url.includes(encodedId),
      );
      if (!belongsToReview) throw new Error("Review photo not found");
    }

    if (!/\.[a-z0-9]{2,5}$/i.test(publicId)) throw new Error("Review photo is not a managed Bunny asset");
    const signedDelete = await presignBunnyObject("DELETE", publicId, 60);
    const deletion = await fetch(signedDelete.uploadUrl, { method: "DELETE" });
    if (!deletion.ok && deletion.status !== 404) throw new Error("Bunny review photo deletion failed");
    return Response.json({ ok: true, provider: "bunny" }, { headers: cors });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to delete photo" },
      { status: 400, headers: cors },
    );
  }
});
