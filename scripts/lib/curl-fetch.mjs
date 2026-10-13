import { spawnSync } from "node:child_process";

export function curlFetch(url, options = {}) {
  const method = options.method || "GET";
  const headers = options.headers || {};
  const body = options.body;

  const args = ["-s", "-i", "-X", method];

  for (const [k, v] of Object.entries(headers)) {
    args.push("-H", `${k}: ${v}`);
  }

  if (body) {
    args.push("--data-raw", typeof body === "string" ? body : JSON.stringify(body));
  }

  args.push(url);

  const res = spawnSync("curl.exe", args, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });

  if (res.error) {
    throw res.error;
  }

  const raw = res.stdout || "";
  // Split headers and body
  const headerEnd = raw.indexOf("\r\n\r\n");
  const headerEndAlt = raw.indexOf("\n\n");
  const splitIdx = headerEnd !== -1 ? headerEnd : headerEndAlt;

  let headerStr = "";
  let bodyStr = "";

  if (splitIdx !== -1) {
    headerStr = raw.slice(0, splitIdx);
    bodyStr = raw.slice(splitIdx + (headerEnd !== -1 ? 4 : 2));
  } else {
    bodyStr = raw;
  }

  const statusMatch = headerStr.match(/HTTP\/[12](\.[01])?\s+(\d{3})/i);
  const status = statusMatch ? parseInt(statusMatch[2], 10) : (res.status === 0 ? 200 : 500);

  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => bodyStr,
    json: async () => JSON.parse(bodyStr || "{}"),
  };
}
