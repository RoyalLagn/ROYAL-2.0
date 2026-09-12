import { stdin, stdout } from "node:process";

function readHiddenLine(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Set BUNNY_UPLOAD_EMAIL and BUNNY_UPLOAD_PASSWORD, or run this script in an interactive terminal.");
  }
  return new Promise((resolve, reject) => {
    let value = "";
    stdout.write(prompt);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    const finish = (error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      error ? reject(error) : resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") return finish(new Error("Upload cancelled."));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else value += character;
      }
    };
    stdin.on("data", onData);
  });
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.msg || `Request failed (${response.status}).`);
  return payload;
}

export async function createBunnyUploader(env) {
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const email = env.BUNNY_UPLOAD_EMAIL || process.env.BUNNY_UPLOAD_EMAIL || await readHiddenLine("Supabase login email: ");
  const password = env.BUNNY_UPLOAD_PASSWORD || process.env.BUNNY_UPLOAD_PASSWORD || await readHiddenLine("Supabase password: ");
  if (!supabaseUrl || !anonKey || !email || !password) {
    throw new Error("Supabase URL, anon key, BUNNY_UPLOAD_EMAIL, and password are required.");
  }
  const session = await requestJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return async function upload(bytes, mimeType) {
    const signed = await requestJson(`${supabaseUrl}/functions/v1/bunny-media-sign`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "general", mimeType, fileSize: bytes.byteLength }),
    });
    const uploaded = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: bytes });
    if (!uploaded.ok) throw new Error(`Bunny upload failed (${uploaded.status}).`);
    const verified = await fetch(`${signed.publicUrl}?verify=${Date.now()}`, { headers: { Range: "bytes=0-0" } });
    if (!verified.ok || Number(verified.headers.get("content-length") || 0) <= 0) {
      throw new Error("Bunny CDN did not return the uploaded file.");
    }
    return signed.publicUrl;
  };
}
