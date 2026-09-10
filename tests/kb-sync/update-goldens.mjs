// Regenerates tests/kb-sync/golden/<slug>.storage.xml from the fixtures. Run by hand only, after a
// deliberate converter change, then review the diff by eye: the goldens freeze the conversion
// behaviour. Not a test file (the name matches none of node --test's patterns).
//   node tests/kb-sync/update-goldens.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LIVE_SLUGS, fixtureHtml, fixturesDir, goldenDir } from "./helpers.mjs";
import { loadRegistry } from "../../scripts/kb-sync/registry.mjs";
import { convertGuide } from "../../scripts/kb-sync/convert.mjs";

const bySlug = Object.fromEntries(loadRegistry(fixturesDir).map((app) => [app.slug, app]));
mkdirSync(goldenDir, { recursive: true });
for (const slug of LIVE_SLUGS) {
  const { body, contentHash } = convertGuide(fixtureHtml(slug), bySlug[slug]);
  const file = path.join(goldenDir, `${slug}.storage.xml`);
  writeFileSync(file, `${body}\n`);
  console.log(`${slug}: ${body.length} bytes, sha256 ${contentHash.slice(0, 12)} -> ${path.relative(process.cwd(), file)}`);
}
