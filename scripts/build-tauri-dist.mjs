import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of ["index.html", "robots.txt", "sitemap.xml"]) {
  await cp(join(root, file), join(dist, file));
}

for (const directory of ["assets", "src", "samples", "docs"]) {
  await cp(join(root, directory), join(dist, directory), { recursive: true });
}
