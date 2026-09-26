import { createHash } from "node:crypto";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prefix = "io.github.sredgarr.idg.dev.";

export function hostNameForCheckout(checkoutPath) {
  const normalized = path.resolve(checkoutPath).replaceAll("\\", "/").toLowerCase();
  const suffix = createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 16);
  return prefix + suffix;
}

export function developmentNativeHostName(checkoutRoot) {
  return hostNameForCheckout(realpathSync.native(path.resolve(checkoutRoot)));
}

export function saveDevelopmentNativeHostName(checkoutRoot, hostName) {
  const directory = path.join(checkoutRoot, ".local", "native-host");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "host-name.txt"), `${hostName}\n`, "utf8");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rootArgument = args.find((argument) => argument !== "--write");
  const checkoutRoot = realpathSync.native(
    path.resolve(rootArgument ?? path.resolve(fileURLToPath(new URL("..", import.meta.url)))),
  );
  const hostName = developmentNativeHostName(checkoutRoot);
  if (args.includes("--write")) saveDevelopmentNativeHostName(checkoutRoot, hostName);
  process.stdout.write(hostName);
}
