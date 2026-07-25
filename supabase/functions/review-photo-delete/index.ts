import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha1(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

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

    const timestamp = Math.floor(Date.now() / 1000);
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    if (!apiSecret || !apiKey || !cloudName) {
      throw new Error("Cloudinary server configuration is missing");
    }
    const signature = await sha1(
      `invalidate=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`,
    );
    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      invalidate: "true",
      api_key: apiKey,
      signature,
    });
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      { method: "POST", body },
    );
    const result = await response.json();
    if (!response.ok || !["ok", "not found"].includes(result.result)) {
      throw new Error("Cloudinary deletion failed");
    }
    return Response.json({ ok: true }, { headers: cors });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to delete photo" },
      { status: 400, headers: cors },
    );
  }
});
