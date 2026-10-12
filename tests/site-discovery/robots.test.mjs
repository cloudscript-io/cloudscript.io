// Requirement: robots.txt allows all crawlers and names the sitemap (specs/site-discovery/spec.md).
// Reads the built site; see helpers.mjs for the fresh-build gate.
import test from "node:test";
import assert from "node:assert/strict";
import { CANONICAL, read, readSource, sitemap } from "./helpers.mjs";

const robots = read("robots.txt");

/** The directive lines of a robots.txt as `[field, value]`, comments and blank lines dropped. */
function directives(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf(":");
      assert.notEqual(at, -1, `not a directive: ${line}`);
      return [line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim()];
    });
}

/** Groups as RFC 9309 defines them: one or more user-agent lines, then that group's rules. */
function groups(text) {
  const out = [];
  let current = null;
  let inAgents = false;
  for (const [field, value] of directives(text)) {
    if (field === "user-agent") {
      if (!inAgents) {
        current = { agents: [], rules: [] };
        out.push(current);
      }
      current.agents.push(value.toLowerCase());
      inAgents = true;
    } else if (field === "allow" || field === "disallow") {
      assert.ok(current, `${field} before any user-agent line`);
      current.rules.push({ allow: field === "allow", path: value });
      inAgents = false;
    } else {
      inAgents = false;
    }
  }
  return out;
}

/** RFC 9309: the group naming the crawler, else `*`; the longest matching rule wins, allow on a tie. */
function allowed(text, agent, urlPath) {
  const all = groups(text);
  const named = all.filter((g) => g.agents.some((a) => a !== "*" && agent.toLowerCase().includes(a)));
  const rules = (named.length ? named : all.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  let best = null;
  for (const rule of rules) {
    if (rule.path === "" || !urlPath.startsWith(rule.path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

test("the evaluator itself blocks what a Disallow would block", () => {
  const sample = "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\nDisallow: /private/\n";
  assert.equal(allowed(sample, "GPTBot", "/support"), false);
  assert.equal(allowed(sample, "Googlebot", "/support"), true);
  assert.equal(allowed(sample, "Googlebot", "/private/x"), false);
});

test("scenario: training and retrieval crawlers are allowed on every path", () => {
  const paths = ["/", "/robots.txt", "/sitemap.xml", "/assets/css/styles.css", ...sitemap().entries.map((e) => e.loc.slice(CANONICAL.length))];
  assert.ok(paths.length > 10);
  for (const agent of ["GPTBot", "ClaudeBot", "Google-Extended", "CCBot", "Googlebot"]) {
    for (const p of paths) assert.equal(allowed(robots, agent, p), true, `${agent} may fetch ${p}`);
  }
});

test("scenario: no path disclosure (no Disallow line)", () => {
  assert.deepEqual(directives(robots).filter(([field]) => field === "disallow"), []);
  assert.ok(!/^\s*disallow\s*:/im.test(robots));
});

test("one group for every crawler, no per-crawler groups", () => {
  assert.deepEqual(groups(robots), [{ agents: ["*"], rules: [{ allow: true, path: "/" }] }]);
});

test("the Sitemap line is canonical_url + /sitemap.xml", () => {
  assert.deepEqual(directives(robots).filter(([field]) => field === "sitemap"), [["sitemap", `${CANONICAL}/sitemap.xml`]]);
});

test("robots.txt is served exactly as committed and records the decision", () => {
  assert.equal(robots, readSource("robots.txt"));
  assert.match(robots, /^# Decision recorded 13 October 2026/m);
});
