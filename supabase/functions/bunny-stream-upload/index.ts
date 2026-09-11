import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, content-length",
  "Access-Control-Allow-Methods": "PUT, POST, OPTIONS",
};
const MAX_BYTES = 20 * 1024 * 1024;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!['PUT', 'POST'].includes(request.method)) throw new Error("Method not allowed");
    const url = new URL(request.url);
    const importBody = request.method === "POST" ? await request.json() : null;
    const videoId = url.searchParams.get("videoId")?.trim();
    const vendorId = String(importBody?.vendorId || url.searchParams.get("vendorId") || "").trim();
    const clipId = String(importBody?.clipId || url.searchParams.get("clipId") || "").trim();
    if (!vendorId || !clipId || (request.method === "PUT" && !videoId)) throw new Error("Invalid Bunny upload request");
    const auth = request.headers.get("Authorization") || "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");
    const { data: vendor } = await supabase.from("vendors").select("id")
      .eq("id", vendorId).eq("profile_id", user.id).eq("is_verified", true).maybeSingle();
    if (!vendor) throw new Error("Approved Vendor access required");
    const { error: accessError } = await supabase.rpc("require_vendor_feature_access", {
      target_vendor_id: vendorId, requested_feature_key: "upload_clips",
    });
    if (accessError) throw accessError;
    const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID")?.trim();
    const apiKey = Deno.env.get("BUNNY_STREAM_API_KEY")?.trim();
    if (!libraryId || !apiKey) throw new Error("Bunny Stream is not configured");

    if (request.method === "POST") {
      const sourceUrl = String(importBody?.sourceUrl || "").trim();
      const storageHostname = Deno.env.get("BUNNY_STORAGE_CDN_HOSTNAME")?.trim()
        .replace(/^https?:\/\//, "").replace(/\/$/, "");
      const streamHostname = Deno.env.get("BUNNY_STREAM_CDN_HOSTNAME")?.trim()
        .replace(/^https?:\/\//, "").replace(/\/$/, "");
      const expectedPath = `/clips/${vendorId}/${clipId}/source.mp4`;
      let parsedSource: URL;
      try { parsedSource = new URL(sourceUrl); } catch { throw new Error("Invalid Bunny source URL"); }
      if (!storageHostname || !streamHostname || parsedSource.protocol !== "https:" || parsedSource.hostname !== storageHostname || parsedSource.pathname !== expectedPath) {
        throw new Error("Invalid Bunny source URL");
      }
      const sourceCheck = await fetch(sourceUrl, { method: "HEAD" });
      const sourceBytes = Number(sourceCheck.headers.get("content-length") || 0);
      if (!sourceCheck.ok || sourceBytes <= 0 || sourceBytes > MAX_BYTES) throw new Error("Bunny source video is missing or invalid");
      const title = `clip-${clipId}`;
      const importStartedAt = Date.now();
      const fetchResponse = await fetch(`https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/fetch`, {
        method: "POST",
        headers: { AccessKey: apiKey, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl, title }),
      });
      const fetched = await fetchResponse.json().catch(() => ({}));
      if (!fetchResponse.ok || fetched.success === false) throw new Error(fetched.message || `Bunny Stream import failed (${fetchResponse.status})`);

      // The URL-fetch endpoint returns { success: true, message: "OK" }, not
      // the created video's guid. Resolve the just-created item by its unique
      // clip title so the client can persist the correct playback URL.
      let importedVideo = fetched.guid ? fetched : null;
      for (let attempt = 0; !importedVideo && attempt < 10; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500));
        const listUrl = new URL(`https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos`);
        listUrl.searchParams.set("page", "1");
        listUrl.searchParams.set("itemsPerPage", "100");
        listUrl.searchParams.set("search", title);
        const listResponse = await fetch(listUrl, { headers: { AccessKey: apiKey, Accept: "application/json" } });
        if (!listResponse.ok) continue;
        const listing = await listResponse.json().catch(() => ({}));
        const matches = (Array.isArray(listing.items) ? listing.items : [])
          .filter((item: { title?: string; guid?: string; dateUploaded?: string }) => item.title === title && item.guid)
          .sort((a: { dateUploaded?: string }, b: { dateUploaded?: string }) =>
            Date.parse(b.dateUploaded || "") - Date.parse(a.dateUploaded || ""));
        const newest = matches[0];
        if (newest && Date.parse(newest.dateUploaded || "") >= importStartedAt - 10_000) importedVideo = newest;
      }
      if (!importedVideo?.guid) throw new Error("Bunny imported the video but its video ID could not be resolved");
      return Response.json({
        uploaded: true,
        videoId: importedVideo.guid,
        sourceBytes,
        videoUrl: `https://${streamHostname}/${importedVideo.guid}/playlist.m3u8`,
        thumbnailUrl: `https://${streamHostname}/${importedVideo.guid}/thumbnail.jpg`,
      }, { headers: cors });
    }

    const length = Number(request.headers.get("content-length") || 0);
    if (length <= 0 || length > MAX_BYTES) throw new Error("Clip must be between 1 byte and 20 MB");
    // Buffering is intentional here. Forwarding request.body directly through a
    // Supabase Edge Function can produce a successful zero-byte Bunny upload.
    // Clips are capped at 20 MB, so reading the body lets us verify the exact
    // bytes before Bunny accepts the video.
    const uploadBody = await request.arrayBuffer();
    if (uploadBody.byteLength <= 0 || uploadBody.byteLength > MAX_BYTES) {
      throw new Error("Clip must be between 1 byte and 20 MB");
    }
    if (uploadBody.byteLength !== length) {
      throw new Error(`Incomplete clip upload: received ${uploadBody.byteLength} of ${length} bytes`);
    }

    const bunnyVideoUrl = `https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(videoId)}`;
    const response = await fetch(bunnyVideoUrl, {
      method: "PUT",
      headers: {
        AccessKey: apiKey,
        Accept: "application/json",
        "Content-Type": "application/octet-stream",
        // Bunny's binary upload endpoint needs a fixed-length request. Without
        // this Deno sends chunked transfer encoding; Bunny can answer OK while
        // leaving the newly-created video at zero bytes.
        "Content-Length": String(uploadBody.byteLength),
      },
      body: new Uint8Array(uploadBody),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Bunny Stream upload failed (${response.status}): ${body.slice(0, 160)}`);
    let uploadResult: { success?: boolean; message?: string } = {};
    try { uploadResult = JSON.parse(body); } catch { /* Bunny can return an empty success response. */ }
    if (uploadResult.success === false) throw new Error(`Bunny Stream rejected upload: ${uploadResult.message || "Unknown error"}`);

    // Do not let the client create a playable database record until Bunny itself
    // confirms that the original file exists.
    let storedBytes = 0;
    let bunnyStatus: number | null = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
      const verify = await fetch(bunnyVideoUrl, { headers: { AccessKey: apiKey, Accept: "application/json" } });
      if (!verify.ok) continue;
      const video = await verify.json();
      storedBytes = Number(video.storageSize || 0);
      bunnyStatus = typeof video.status === "number" ? video.status : null;
      if (storedBytes > 0 || Number(video.length || 0) > 0 || video.hasOriginal === true) break;
    }
    if (storedBytes <= 0) {
      throw new Error(`Bunny accepted the request but stored 0 bytes (status ${bunnyStatus ?? "unknown"})`);
    }
    return Response.json({ uploaded: true, videoId, bytes: uploadBody.byteLength, storedBytes, bunnyStatus }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to upload Bunny video" }, { status: 400, headers: cors });
  }
});
