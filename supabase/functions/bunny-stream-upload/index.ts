import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bunnyStorageConfig, presignBunnyObject } from "../_shared/bunnyS3.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_BYTES = 20 * 1024 * 1024;
const FAILED_STATUSES = new Set([5, 8]);

type BunnyVideo = {
  guid?: string;
  title?: string;
  dateUploaded?: string;
  status?: number;
  storageSize?: number;
  length?: number;
  width?: number;
  height?: number;
  encodeProgress?: number;
  message?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ success: false, stage: "REQUEST", error: "Method not allowed" }, 405);

  let videoId: string | null = null;
  let bunnyVideoUrl: string | null = null;
  let bunnyApiKey: string | null = null;
  let sourceObjectKey: string | null = null;
  let sourceCleanupComplete = false;
  const cleanupSource = async () => {
    if (!sourceObjectKey || sourceCleanupComplete) return;
    const signedDelete = await presignBunnyObject("DELETE", sourceObjectKey);
    await fetch(signedDelete.uploadUrl, { method: "DELETE" }).catch(() => undefined);
    sourceCleanupComplete = true;
  };
  try {
    const body = await request.json();
    const vendorId = String(body?.vendorId || "").trim();
    const clipId = String(body?.clipId || "").trim();
    const fileName = String(body?.fileName || `clip-${clipId}.mp4`).trim();
    const sourceUrl = String(body?.sourceUrl || "").trim();
    const expectedBytes = Number(body?.expectedBytes || 0);
    if (!vendorId || !clipId || !sourceUrl || !Number.isFinite(expectedBytes) || expectedBytes <= 0 || expectedBytes > MAX_BYTES) {
      return json({ success: false, stage: "REQUEST", error: "Invalid Bunny Stream import request" }, 400);
    }

    const auth = request.headers.get("Authorization") || "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ success: false, stage: "AUTH", error: "Authentication required" }, 401);
    const { data: vendor } = await supabase.from("vendors").select("id")
      .eq("id", vendorId).eq("profile_id", user.id).eq("is_verified", true).maybeSingle();
    if (!vendor) return json({ success: false, stage: "AUTH", error: "Approved Vendor access required" }, 403);
    const { error: accessError } = await supabase.rpc("require_vendor_feature_access", {
      target_vendor_id: vendorId,
      requested_feature_key: "upload_clips",
    });
    if (accessError) return json({ success: false, stage: "AUTH", error: accessError.message }, 403);

    const storage = bunnyStorageConfig();
    let parsedSource: URL;
    try { parsedSource = new URL(sourceUrl); } catch { return json({ success: false, stage: "SOURCE_VERIFY", error: "Invalid Bunny Storage source URL" }, 400); }
    const expectedPrefix = `/clips/${vendorId}/${clipId}/source.`;
    if (parsedSource.protocol !== "https:" || parsedSource.hostname !== storage.cdnHostname || !parsedSource.pathname.startsWith(expectedPrefix)) {
      return json({ success: false, stage: "SOURCE_VERIFY", error: "Bunny Storage source does not belong to this Clip" }, 400);
    }
    sourceObjectKey = parsedSource.pathname.replace(/^\//, "");
    const sourceCheck = await fetch(sourceUrl, { method: "HEAD" });
    const sourceBytes = Number(sourceCheck.headers.get("content-length") || 0);
    console.log("[CLIP-UPLOAD] STORAGE_VERIFY", {
      sourceUrl,
      httpStatus: sourceCheck.status,
      expectedBytes,
      storageBytes: sourceBytes,
    });
    if (!sourceCheck.ok || sourceBytes <= 0 || sourceBytes !== expectedBytes) {
      await cleanupSource();
      return json({ success: false, stage: "SOURCE_VERIFY", error: `Bunny Storage contains ${sourceBytes} of ${expectedBytes} bytes` }, 502);
    }

    const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID")?.trim();
    bunnyApiKey = Deno.env.get("BUNNY_STREAM_API_KEY")?.trim() || null;
    const streamHostname = Deno.env.get("BUNNY_STREAM_CDN_HOSTNAME")?.trim()
      .replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!libraryId || !bunnyApiKey || !streamHostname) throw new Error("Bunny Stream is not configured");

    // Import directly from Bunny Storage instead of the public pull-zone URL.
    // A newly uploaded object can be unavailable or stale through the CDN even
    // though Storage already contains all bytes. The short-lived signed GET URL
    // gives Stream URL Fetch access to the authoritative Storage object.
    const signedSource = await presignBunnyObject("GET", sourceObjectKey, 900);
    const importUrl = signedSource.uploadUrl;
    const importTarget = new URL(importUrl);
    const title = `clip-${vendorId}-${clipId}-${crypto.randomUUID()}`;
    const importStartedAt = Date.now();
    const importResponse = await fetch(`https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/fetch`, {
      method: "POST",
      headers: { AccessKey: bunnyApiKey, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ url: importUrl, title }),
    });
    const importBody = await importResponse.text();
    let imported: BunnyVideo & { success?: boolean } = {};
    try { imported = JSON.parse(importBody); } catch { /* Preserve provider body in logs. */ }
    videoId = imported.guid || null;
    console.log("[CLIP-UPLOAD] BUNNY_URL_FETCH", {
      httpStatus: importResponse.status,
      responseBody: importBody,
      videoId,
      sourceBytes,
      targetUrl: `${importTarget.origin}${importTarget.pathname}`,
    });
    if (!importResponse.ok || imported.success === false) {
      await cleanupSource();
      return json({ success: false, stage: "BUNNY_URL_FETCH", bunnyStatus: importResponse.status, bunnyResponse: importBody, error: imported.message || `Bunny URL Fetch failed (${importResponse.status})` }, 502);
    }

    for (let attempt = 0; !videoId && attempt < 15; attempt += 1) {
      if (attempt > 0) await wait(500);
      const listUrl = new URL(`https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos`);
      listUrl.searchParams.set("page", "1");
      listUrl.searchParams.set("itemsPerPage", "20");
      listUrl.searchParams.set("search", title);
      const listResponse = await fetch(listUrl, { headers: { AccessKey: bunnyApiKey, Accept: "application/json" } });
      if (!listResponse.ok) continue;
      const listing = await listResponse.json().catch(() => ({})) as { items?: BunnyVideo[] };
      const match = (listing.items || []).find((item) => item.title === title && item.guid && Date.parse(item.dateUploaded || "") >= importStartedAt - 10_000);
      if (match?.guid) videoId = match.guid;
    }
    if (!videoId) {
      await cleanupSource();
      return json({ success: false, stage: "BUNNY_URL_FETCH", bunnyStatus: importResponse.status, bunnyResponse: importBody, error: "Bunny accepted the URL fetch but its video ID could not be resolved" }, 502);
    }

    bunnyVideoUrl = `https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(videoId)}`;
    let video: BunnyVideo = {};
    let verifyStatus = 0;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      if (attempt > 0) await wait(1000);
      const verifyResponse = await fetch(bunnyVideoUrl, { headers: { AccessKey: bunnyApiKey, Accept: "application/json" } });
      verifyStatus = verifyResponse.status;
      if (!verifyResponse.ok) continue;
      video = await verifyResponse.json().catch(() => ({}));
      if (FAILED_STATUSES.has(Number(video.status))) break;
      if (Number(video.storageSize || 0) > 0) break;
    }
    console.log("[CLIP-UPLOAD] BUNNY_VERIFY", {
      videoId,
      httpStatus: verifyStatus,
      status: video.status ?? null,
      storageSize: Number(video.storageSize || 0),
      length: Number(video.length || 0),
      encodeProgress: Number(video.encodeProgress || 0),
    });
    if (FAILED_STATUSES.has(Number(video.status)) || Number(video.storageSize || 0) <= 0) {
      await fetch(bunnyVideoUrl, { method: "DELETE", headers: { AccessKey: bunnyApiKey } }).catch(() => undefined);
      await cleanupSource();
      return json({ success: false, stage: "BUNNY_VERIFY", videoId, storageSize: Number(video.storageSize || 0), bunnyStatus: video.status ?? verifyStatus, error: "Bunny URL Fetch did not store the source video" }, 502);
    }

    await cleanupSource();
    return json({
      success: true,
      provider: "bunny",
      videoId,
      libraryId,
      uploadAccepted: true,
      processing: ![3, 4].includes(Number(video.status)),
      videoUrl: `https://${streamHostname}/${videoId}/playlist.m3u8`,
      thumbnailUrl: `https://${streamHostname}/${videoId}/thumbnail.jpg`,
      bytes: sourceBytes,
      storageSize: Number(video.storageSize || 0),
      status: typeof video.status === "number" ? video.status : null,
      length: Number(video.length || 0),
      width: Number(video.width || 0),
      height: Number(video.height || 0),
      encodeProgress: Number(video.encodeProgress || 0),
    });
  } catch (error) {
    if (videoId && bunnyVideoUrl && bunnyApiKey) {
      await fetch(bunnyVideoUrl, { method: "DELETE", headers: { AccessKey: bunnyApiKey } }).catch(() => undefined);
    }
    await cleanupSource().catch(() => undefined);
    const message = error instanceof Error ? error.message : "Unable to import Bunny video";
    console.error("[CLIP-UPLOAD] EDGE_ERROR", { videoId, error: message });
    return json({ success: false, stage: "EDGE", error: message }, 500);
  }
});
