import { corsHeaders, json, requireEnv, serviceClient } from "../_shared/subscriptions.ts";
import { deleteClipMediaAssets } from "../_shared/clipMedia.ts";

type PushJob = { notification_id: string; title: string; body: string; target_path: string; tokens: string[] };
type DeleteJob = { clip_id: string; vendor_id: string; bunny_asset_id: string };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const payload = await request.json().catch(() => ({})) as { dispatchToken?: string };
  const cronSecret = request.headers.get("x-cron-secret");
  const service = serviceClient();
  const tokenAccepted = payload.dispatchToken
    ? Boolean((await service.rpc("consume_subscription_lifecycle_dispatch", { token: payload.dispatchToken })).data)
    : false;
  if (!tokenAccepted && cronSecret !== requireEnv("SUBSCRIPTION_CRON_SECRET")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const { data, error } = await service.rpc("process_subscription_lifecycle");
  if (error) return json({ error: error.message }, 400);
  const { data: policy, error: policyError } = await service.rpc("prepare_elite_expiry_policy");
  if (policyError) return json({ error: policyError.message }, 400);

  let pushesSent = 0;
  const { data: pushJobs } = await service.rpc("list_pending_elite_expiry_pushes");
  for (const job of (pushJobs ?? []) as PushJob[]) {
    let pushError: string | null = null;
    if (job.tokens.length) {
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(job.tokens.map((to) => ({
            to, title: job.title, body: job.body, sound: "default", priority: "high",
            channelId: "default", data: { targetPath: job.target_path, kind: "elite_expiry_warning" },
          }))),
        });
        if (!response.ok) throw new Error(`Expo push returned ${response.status}`);
        pushesSent += job.tokens.length;
      } catch (caught) {
        pushError = caught instanceof Error ? caught.message : "Push delivery failed";
      }
    }
    await service.rpc("complete_elite_expiry_push", { notification_id: job.notification_id, error_message: pushError });
  }

  let clipsDeleted = 0;
  const { data: deleteJobs } = await service.rpc("list_pending_elite_clip_deletions", { batch_size: 100 });
  for (const job of (deleteJobs ?? []) as DeleteJob[]) {
    let deletionError: string | null = null;
    try {
      await deleteClipMediaAssets(job.bunny_asset_id, {
        requestId: crypto.randomUUID(), clipId: job.clip_id, vendorId: job.vendor_id,
      });
    } catch (caught) {
      deletionError = caught instanceof Error ? caught.message : "Storage deletion failed";
    }
    const { data: deleted } = await service.rpc("complete_elite_clip_deletion", {
      target_clip_id: job.clip_id, error_message: deletionError,
    });
    if (deleted) clipsDeleted += 1;
  }

  return json({ success: true, lifecycle: data, policy, pushesSent, clipsDeleted });
});
