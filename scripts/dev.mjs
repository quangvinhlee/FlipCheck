/** Own both local processes; reuse a healthy existing API without killing it on exit. */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.FLIPCHECK_BACKEND_PORT || "8765";
const production = process.argv.includes("--production");
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
function launch(command, args, cwd = root) {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
  return child;
}
async function healthy() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return typeof data.model === "string" && "serpapi_configured" in data;
  } catch {
    return false;
  }
}
if (!(await healthy())) {
  launch(process.env.PYTHON || "python3", ["-m", "flipcheck", "--port", port]);
  let ready = false;
  for (let attempt = 0; attempt < 30 && !stopping; attempt++) {
    if (await healthy()) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) {
    console.error(
      "Local API did not start. Check Python and the configured port.",
    );
    stop(1);
  }
} else {
  console.log(`Using existing FlipCheck API on 127.0.0.1:${port}`);
}
if (!stopping) {
  launch(
    process.execPath,
    [
      resolve(root, "node_modules/next/dist/bin/next"),
      production ? "start" : "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      process.env.FLIPCHECK_WEB_PORT || "3030",
    ],
    resolve(root, "frontend"),
  );
}
