import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { keccak256, toBytes } from "viem";
const root = fileURLToPath(new URL("../../", import.meta.url));
const dist = resolve(root, "dist");
const read = async (p) => JSON.parse(await readFile(p, "utf8"));
const handoff = await read(resolve(root, "web/deployment/handoff.json"));
const network = await read(resolve(root, "web/deployment/network.json"));
const canonical = (x) =>
  Array.isArray(x)
    ? "[" + x.map(canonical).join(",") + "]"
    : x && typeof x === "object"
      ? "{" +
        Object.keys(x)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonical(x[k]))
          .join(",") +
        "}"
      : JSON.stringify(x);
const verify = process.argv.includes("--verify");
const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts: [],
  assets: [],
  ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
  network: network.network,
  ...(network.walletAddChain ? { walletAddChain: network.walletAddChain } : {}),
};
for (const c of handoff.contracts) {
  assert.match(c.name, /^\w+$/);
  const bytes = execFileSync(
    "git",
    ["show", `${handoff.sourceCommit}:docs/abi/${c.name}.json`],
    { cwd: root },
  );
  const abi = JSON.parse(bytes);
  assert.ok(Array.isArray(abi));
  assert.equal(
    keccak256(toBytes(canonical(abi))).slice(2),
    c.abiHash,
    `Pinned ABI hash: ${c.name}`,
  );
  const abiPath = `abi/${c.name}.json`;
  if (!verify) {
    await mkdir(resolve(dist, "abi"), { recursive: true });
    await writeFile(resolve(dist, abiPath), bytes);
  } else assert.deepEqual(await read(resolve(dist, abiPath)), abi);
  manifest.contracts.push({
    name: c.name,
    address: c.address,
    abiHash: c.abiHash,
    abiPath,
  });
}
async function walk(dir, prefix = "") {
  for (const f of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const p = prefix + f.name;
    assert.ok(!f.isSymbolicLink(), "No export symlinks");
    if (f.isDirectory()) await walk(resolve(dir, f.name), p + "/");
    else if (p !== "imd-deployment.json") {
      const bytes = await readFile(resolve(dir, f.name));
      assert.ok(bytes.length <= 8388608, `Asset too large: ${p}`);
      manifest.assets.push({
        path: p,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
}
await walk(dist);
assert.ok(manifest.assets.length <= 128);
assert.ok(manifest.assets.some((a) => a.path === "index.html"));
let size = 0;
for (const a of manifest.assets)
  size += (await stat(resolve(dist, a.path))).size;
assert.ok(size < 30 * 1024 * 1024);
if (verify)
  assert.deepEqual(await read(resolve(dist, "imd-deployment.json")), manifest);
else
  await writeFile(
    resolve(dist, "imd-deployment.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
// When worker inputs exist, confirm the durable snapshots exactly match them.
for (const [name, copy] of [
  ["deployment", handoff],
  ["network", network],
]) {
  try {
    assert.deepEqual(
      await read(resolve(root, `.imd/reads/${name}.json`)),
      copy,
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
console.log(
  `${verify ? "Verified" : "Exported"} ${manifest.assets.length} assets; ${size} bytes; pinned ABI and handoff match.`,
);
