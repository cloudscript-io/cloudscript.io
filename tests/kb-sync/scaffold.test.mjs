// Scaffold checks for scripts/kb-sync: the package is private, ESM, has exactly one dependency
// pinned to an exact version, and the committed lockfile agrees with it. Also guards the two
// repository-level settings the sync relies on: the .gitignore negations that let the manifest
// and lockfile be committed, and the Jekyll exclude that keeps scripts/ and tests/ off the site.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const pkgDir = path.join(repoRoot, "scripts", "kb-sync");
const read = (p) => readFileSync(p, "utf8");

test("package.json is private ESM with one exactly pinned dependency", () => {
  const pkg = JSON.parse(read(path.join(pkgDir, "package.json")));
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, "module");
  const deps = Object.entries(pkg.dependencies ?? {});
  assert.equal(deps.length, 1, "exactly one runtime dependency");
  const [name, version] = deps[0];
  assert.equal(name, "parse5");
  assert.match(version, /^\d+\.\d+\.\d+$/, "version is pinned exactly, no range");
  assert.equal(pkg.devDependencies, undefined, "no dev dependencies");
});

test("package-lock.json matches package.json and resolves the dependency", () => {
  const pkg = JSON.parse(read(path.join(pkgDir, "package.json")));
  const lock = JSON.parse(read(path.join(pkgDir, "package-lock.json")));
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(lock.packages[""].dependencies, pkg.dependencies);
  const parse5 = lock.packages["node_modules/parse5"];
  assert.ok(parse5, "lockfile resolves parse5");
  assert.equal(parse5.version, pkg.dependencies.parse5);
  assert.match(parse5.integrity ?? "", /^sha512-/);
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === "") continue;
    assert.match(entry.resolved ?? "", /^https:\/\/registry\.npmjs\.org\//, `${key} comes from the npm registry`);
  }
});

test(".gitignore commits the manifest and lockfile but never node_modules", () => {
  const lines = read(path.join(repoRoot, ".gitignore")).split("\n").map((l) => l.trim());
  assert.ok(lines.includes("!scripts/kb-sync/package.json"));
  assert.ok(lines.includes("!scripts/kb-sync/package-lock.json"));
  assert.ok(lines.includes("scripts/kb-sync/node_modules/"));
});

test("_config.yml excludes scripts/ and tests/ from the Jekyll build", () => {
  const config = read(path.join(repoRoot, "_config.yml"));
  const excludeBlock = config.slice(config.indexOf("\nexclude:"));
  assert.match(excludeBlock, /^\s+- scripts\/$/m);
  assert.match(excludeBlock, /^\s+- tests\/$/m);
});
