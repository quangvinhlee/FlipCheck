import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reads = new Set([
  "state",
  "health",
  "export",
  "templates/listings",
  "templates/comparisons",
]);
const writes = new Set([
  "settings",
  "watchlists/save",
  "watchlists/archive",
  "location/search",
  "import/listings",
  "import/comparisons",
  "scan",
  "analyse",
  "decision",
  "correct",
]);

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const endpoint = path.join("/");
  const allowed = request.method === "GET" ? reads : writes;
  if (!allowed.has(endpoint))
    return Response.json({ error: "Unknown API endpoint." }, { status: 404 });
  // The browser talks to Next on the same origin. Only a fixed loopback Python API is proxied.
  const host = request.headers.get("host");
  if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
    return Response.json(
      { error: "FlipCheck is a local-only application." },
      { status: 403 },
    );
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== `http://${host}` && origin !== `https://${host}`) {
    return Response.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403 },
    );
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json(
      { error: "Cross-site requests are not allowed." },
      { status: 403 },
    );
  }
  let body: string | undefined;
  if (request.method === "POST") {
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return Response.json({ error: "Upload JSON data." }, { status: 415 });
    }
    const reader = request.body?.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2_000_000) {
          await reader.cancel();
          return Response.json(
            { error: "Import must be smaller than 2 MB." },
            { status: 413 },
          );
        }
        parts.push(value);
      }
    body = Buffer.concat(parts).toString("utf8");
  }
  const port = process.env.FLIPCHECK_BACKEND_PORT || "8765";
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    return Response.json(
      { error: "Invalid local API port configuration." },
      { status: 503 },
    );
  }
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/${endpoint}`, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        "X-FlipCheck-Token": request.headers.get("x-flipcheck-token") || "",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "The local analysis service is unavailable. Run npm run dev from the project root.",
      },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST };
