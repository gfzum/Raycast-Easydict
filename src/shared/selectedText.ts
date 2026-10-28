import { execFile } from "node:child_process";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { environment, getFrontmostApplication, getSelectedText } from "@raycast/api";

import { logTrace } from "./logger";

const execute = promisify(execFile);

function decodeSelection(raw: string): string {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("status" in value)) throw new Error("Invalid selection response");
  if (value.status === "empty" || value.status === "unavailable") return "";
  if (value.status === "selected" && "text" in value && typeof value.text === "string") return value.text.trim();
  throw new Error("Invalid selection response");
}

/** Missing/unsupported selections are normal. Never attempt a copy-key fallback on macOS. */
export async function getSelectedTextQuietly(): Promise<string> {
  try {
    if (process.platform !== "darwin") return (await getSelectedText()).trim();
    const app = await getFrontmostApplication();
    if (!app.path || app.bundleId?.startsWith("com.raycast.")) return "";
    const helper = join(environment.assetsPath, "read-selection");
    await chmod(helper, 0o755);
    const { stdout } = await execute(helper, [app.path], { encoding: "utf8", timeout: 1_000, maxBuffer: 1024 * 1024 });
    return decodeSelection(stdout);
  } catch {
    // Do not log selected text, or surface an error/toast for an ordinary manual lookup.
    logTrace("Selection", "Selection unavailable; using manual input");
    return "";
  }
}
