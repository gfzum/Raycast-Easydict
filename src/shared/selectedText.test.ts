import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { getSelectedTextQuietly } from "./selectedText";

const mock = vi.hoisted(() => ({ execute: vi.fn(), frontmost: vi.fn(), selected: vi.fn(), chmod: vi.fn() }));
vi.mock("node:child_process", () => ({
  execFile: Object.assign(vi.fn(), { [Symbol.for("nodejs.util.promisify.custom")]: mock.execute }),
}));
vi.mock("node:fs/promises", () => ({ chmod: mock.chmod }));
vi.mock("@raycast/api", () => ({
  environment: { assetsPath: "/assets" },
  getFrontmostApplication: mock.frontmost,
  getSelectedText: mock.selected,
}));
vi.mock("./logger", () => ({ logTrace: vi.fn() }));

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(process, "platform", { value: "darwin" });
  mock.frontmost.mockResolvedValue({ path: "/Applications/TextEdit.app", bundleId: "com.apple.TextEdit" });
  mock.execute.mockResolvedValue({ stdout: JSON.stringify({ status: "selected", text: "  石斑鱼 grouper  " }) });
});
afterEach(() => Object.defineProperty(process, "platform", platform));

it("reads a macOS selection from the source application through the bounded native helper", async () => {
  await expect(getSelectedTextQuietly()).resolves.toBe("石斑鱼 grouper");
  expect(mock.execute).toHaveBeenCalledWith("/assets/read-selection", ["/Applications/TextEdit.app"], {
    encoding: "utf8",
    timeout: 1_000,
    maxBuffer: 1024 * 1024,
  });
  expect(mock.selected).not.toHaveBeenCalled();
});

it.each(["empty", "unavailable"])(
  "uses manual input for %s without falling back to the general selection API",
  async (status) => {
    mock.execute.mockResolvedValue({ stdout: JSON.stringify({ status }) });
    await expect(getSelectedTextQuietly()).resolves.toBe("");
    expect(mock.selected).not.toHaveBeenCalled();
  },
);

it.each(["not json", '{"status":"selected","text":3}', '{"status":"invalid"}'])(
  "recovers from malformed helper output: %s",
  async (stdout) => {
    mock.execute.mockResolvedValue({ stdout });
    await expect(getSelectedTextQuietly()).resolves.toBe("");
    expect(mock.selected).not.toHaveBeenCalled();
  },
);

it("returns manual input on timeout without retrying or generating a copy shortcut", async () => {
  mock.execute.mockRejectedValue(new Error("ETIMEDOUT"));
  await expect(getSelectedTextQuietly()).resolves.toBe("");
  expect(mock.execute).toHaveBeenCalledTimes(1);
  expect(mock.selected).not.toHaveBeenCalled();
});

it("does not inspect Raycast's own input when no external application is available", async () => {
  mock.frontmost.mockResolvedValue({ path: "/Applications/Raycast.app", bundleId: "com.raycast.macos" });
  await expect(getSelectedTextQuietly()).resolves.toBe("");
  expect(mock.execute).not.toHaveBeenCalled();
});

it("keeps the Windows selection API and quietly handles no selection", async () => {
  Object.defineProperty(process, "platform", { value: "win32" });
  mock.selected.mockResolvedValueOnce(" bearing ").mockRejectedValueOnce(new Error("No selection"));
  await expect(getSelectedTextQuietly()).resolves.toBe("bearing");
  await expect(getSelectedTextQuietly()).resolves.toBe("");
  expect(mock.frontmost).not.toHaveBeenCalled();
  expect(mock.execute).not.toHaveBeenCalled();
});
