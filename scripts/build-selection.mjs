import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const build = join(root, "work/selection-build");
mkdirSync(build, { recursive: true });
try {
  const binaries = ["arm64", "x86_64"].map((arch) => {
    const binary = join(build, `selection-${arch}`);
    execFileSync(
      "swiftc",
      ["-O", "-target", `${arch}-apple-macosx11.0`, join(root, "scripts/selection/main.swift"), "-o", binary],
      { stdio: "inherit" },
    );
    return binary;
  });
  execFileSync("lipo", ["-create", ...binaries, "-output", join(root, "assets/read-selection")], { stdio: "inherit" });
} finally {
  rmSync(build, { recursive: true, force: true });
}
