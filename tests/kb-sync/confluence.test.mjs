// REST client tests with a mocked fetch: request shapes for every call the sync makes, and the
// credential scenario from spec kb-sync ("Credentials are least-privilege and never exposed").
import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVE_PARENT_TITLE,
  ConfluenceClient,
  ConfluenceError,
  PROPERTY_KEY,
  credentialsFromEnv,
} from "../../scripts/kb-sync/confluence.mjs";

// The production host and the service account name proposed in design D8; the token is invented.
const BASE = "https://cloudscript.atlassian.net";
const EMAIL = "support-sync@cloudscript.io";
const TOKEN = "ATATT3xFfGF0invented-token-value-9f8e7d6c";
const BASIC = `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")}`;
const BASIC_VALUE = BASIC.slice("Basic ".length);

function reply(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

/** A fetch stand-in routing on method and pathname; records every call. */
function fakeFetch(routes) {
  const calls = [];
  const fetch = async (url, init) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: u, method: init.method, headers: init.headers, body });
    const route = routes.find((r) => r.method === init.method && (r.path instanceof RegExp ? r.path.test(u.pathname) : r.path === u.pathname));
    if (!route) return reply(404, { message: `no route for ${init.method} ${u.pathname}${u.search}` });
    const out = typeof route.respond === "function" ? route.respond({ url: u, body }) : route.respond;
    return reply(out.status ?? 200, out.body);
  };
  return { fetch, calls };
}

function client(routes, log) {
  const { fetch, calls } = fakeFetch(routes);
  return { client: new ConfluenceClient({ baseUrl: BASE, email: EMAIL, token: TOKEN, fetch, log }), calls };
}

const PAGE = (id, title, extra = {}) => ({ id, title, status: "current", spaceId: "101", parentId: "202", version: { number: 3, message: "kb-sync abc1234" }, ...extra });

// --- Credentials ---------------------------------------------------------------------------

test("credentialsFromEnv: none set means offline mode; a partial set is an error naming the gaps", () => {
  assert.equal(credentialsFromEnv({}), null);
  assert.equal(credentialsFromEnv({ PATH: "/usr/bin", CONFLUENCE_BASE_URL: "  " }), null);
  assert.throws(() => credentialsFromEnv({ CONFLUENCE_BASE_URL: BASE }), /missing CONFLUENCE_USER_EMAIL, CONFLUENCE_API_TOKEN, KB_SPACE_KEY/);
  const creds = credentialsFromEnv({ CONFLUENCE_BASE_URL: `${BASE}/ `, CONFLUENCE_USER_EMAIL: ` ${EMAIL}`, CONFLUENCE_API_TOKEN: TOKEN, KB_SPACE_KEY: "CSHELP " });
  assert.deepEqual(creds, { baseUrl: BASE, email: EMAIL, token: TOKEN, spaceKey: "CSHELP" });
  assert.throws(() => credentialsFromEnv({ CONFLUENCE_BASE_URL: "http://cloudscript.atlassian.net", CONFLUENCE_USER_EMAIL: EMAIL, CONFLUENCE_API_TOKEN: TOKEN, KB_SPACE_KEY: "CSHELP" }), /https/);
  assert.throws(() => credentialsFromEnv({ CONFLUENCE_BASE_URL: "not a url", CONFLUENCE_USER_EMAIL: EMAIL, CONFLUENCE_API_TOKEN: TOKEN, KB_SPACE_KEY: "CSHELP" }), /valid URL/);
});

// --- Request shapes ------------------------------------------------------------------------

test("getSpace sends Basic auth and JSON accept, and normalises ids to strings", async () => {
  const { client: c, calls } = client([
    { method: "GET", path: "/wiki/api/v2/spaces", respond: { body: { results: [{ id: 101, key: "CSHELP", name: "Cloudscript Help", homepageId: 202 }] } } },
  ]);
  const space = await c.getSpace("CSHELP");
  assert.deepEqual(space, { id: "101", key: "CSHELP", name: "Cloudscript Help", homepageId: "202" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.search, "?keys=CSHELP&limit=1");
  assert.equal(calls[0].headers.Authorization, BASIC);
  assert.equal(calls[0].headers.Accept, "application/json");
  assert.equal(calls[0].headers["Content-Type"], undefined, "no body, no content type");
  assert.equal(calls[0].body, undefined);
  await assert.rejects(c.getSpace("OTHER"), (err) => err instanceof ConfluenceError && err.status === 404 && /OTHER/.test(err.message));
});

test("listPages follows _links.next and returns summaries", async () => {
  const { client: c, calls } = client([
    {
      method: "GET",
      path: "/wiki/api/v2/spaces/101/pages",
      respond: ({ url }) =>
        url.searchParams.get("cursor") === "c2"
          ? { body: { results: [PAGE(2, "Two")] } }
          : { body: { results: [PAGE(1, "One")], _links: { next: "/wiki/api/v2/spaces/101/pages?cursor=c2&limit=250" } } },
    },
  ]);
  const pages = await c.listPages("101");
  assert.deepEqual(pages.map((p) => [p.id, p.title, p.parentId, p.version.number]), [["1", "One", "202", 3], ["2", "Two", "202", 3]]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.search, "?limit=250&status=current");
  assert.equal(calls[1].url.search, "?cursor=c2&limit=250");
});

test("getPage asks for the storage body; createPage and updatePage send the v2 payloads", async () => {
  const { client: c, calls } = client([
    { method: "GET", path: "/wiki/api/v2/pages/7", respond: { body: PAGE(7, "Seven", { body: { storage: { value: "<p>x</p>", representation: "storage" } } }) } },
    { method: "POST", path: "/wiki/api/v2/pages", respond: ({ body }) => ({ body: PAGE(8, body.title, { version: { number: 1 } }) }) },
    { method: "PUT", path: "/wiki/api/v2/pages/7", respond: ({ body }) => ({ body: PAGE(7, body.title, { version: { number: body.version.number, message: body.version.message } }) }) },
  ]);
  const page = await c.getPage("7");
  assert.equal(page.body, "<p>x</p>");
  assert.equal(page.version.number, 3);
  assert.equal(calls[0].url.search, "?body-format=storage");

  const created = await c.createPage({ spaceId: "101", parentId: "202", title: "New", body: "<p>b</p>" });
  assert.equal(created.id, "8");
  assert.equal(calls[1].headers["Content-Type"], "application/json");
  assert.deepEqual(calls[1].body, { spaceId: "101", status: "current", title: "New", parentId: "202", body: { representation: "storage", value: "<p>b</p>" } });

  const updated = await c.updatePage({ id: "7", title: "Seven renamed", body: "<p>c</p>", versionNumber: 4, message: "kb-sync abc1234" });
  assert.equal(updated.version.number, 4);
  assert.deepEqual(calls[2].body, { id: "7", status: "current", title: "Seven renamed", body: { representation: "storage", value: "<p>c</p>" }, version: { number: 4, message: "kb-sync abc1234" } });
});

test("getProperty and setProperty: create when absent, update with version+1 when present", async () => {
  let stored = null;
  const { client: c, calls } = client([
    { method: "GET", path: "/wiki/api/v2/pages/7/properties", respond: () => ({ body: { results: stored ? [stored] : [] } }) },
    { method: "POST", path: "/wiki/api/v2/pages/7/properties", respond: ({ body }) => { stored = { id: 55, key: body.key, value: body.value, version: { number: 1 } }; return { body: stored }; } },
    { method: "PUT", path: "/wiki/api/v2/pages/7/properties/55", respond: ({ body }) => { stored = { id: 55, key: body.key, value: body.value, version: { number: body.version.number } }; return { body: stored }; } },
  ]);
  assert.equal(await c.getProperty("7"), null);
  assert.equal(calls[0].url.search, `?key=${PROPERTY_KEY}`);
  const first = await c.setProperty("7", { slug: "mermaid", contentHash: "a" });
  assert.deepEqual(calls[2].body, { key: PROPERTY_KEY, value: { slug: "mermaid", contentHash: "a" } });
  assert.equal(first.version.number, 1);
  const second = await c.setProperty("7", { slug: "mermaid", contentHash: "b" }, { message: "kb-sync abc1234" });
  assert.deepEqual(calls[4].body, { key: PROPERTY_KEY, value: { slug: "mermaid", contentHash: "b" }, version: { number: 2, message: "kb-sync abc1234" } });
  assert.equal(second.value.contentHash, "b");
  assert.deepEqual((await c.getProperty("7")).value, { slug: "mermaid", contentHash: "b" });
});

test("movePage uses the v1 move endpoint and refuses an unknown position without a request", async () => {
  const { client: c, calls } = client([{ method: "PUT", path: "/wiki/rest/api/content/7/move/append/9", respond: { body: { pageId: "7" } } }]);
  await c.movePage("7", "append", "9");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "PUT");
  await assert.rejects(c.movePage("7", "sideways", "9"), /invalid move position/);
  assert.equal(calls.length, 1);
});

test("searchPageIdBySlug: the D2 CQL, one hit returns the id, none or an unavailable search returns null", async () => {
  let status = 200;
  let results = [{ content: { id: 7 } }];
  const { client: c, calls } = client([{ method: "GET", path: "/wiki/rest/api/search", respond: () => ({ status, body: status === 200 ? { results } : { message: "bad cql" } }) }]);
  assert.equal(await c.searchPageIdBySlug("CSHELP", "typst-renderer"), "7");
  assert.equal(calls[0].url.searchParams.get("cql"), `space = "CSHELP" and type = page and content.property[${PROPERTY_KEY}].slug = "typst-renderer"`);
  assert.equal(calls[0].url.searchParams.get("limit"), "5");
  results = [];
  assert.equal(await c.searchPageIdBySlug("CSHELP", "typst-renderer"), null);
  results = [{ content: { id: 7 } }, { content: { id: 8 } }];
  assert.equal(await c.searchPageIdBySlug("CSHELP", "typst-renderer"), null, "an ambiguous result is not trusted");
  status = 400;
  assert.equal(await c.searchPageIdBySlug("CSHELP", "typst-renderer"), null, "an unavailable search falls back to the index");
  status = 403;
  assert.equal(await c.searchPageIdBySlug("CSHELP", "typst-renderer"), null, "a scope refusal on the optional v1 search falls back to the index");
  status = 401;
  assert.equal(await c.searchPageIdBySlug("CSHELP", "typst-renderer"), null, "a bad credential surfaces on the index reads that follow, not here");
  status = 503;
  await assert.rejects(c.searchPageIdBySlug("CSHELP", "typst-renderer"), (err) => err instanceof ConfluenceError && err.status === 503, "a server failure is never swallowed");
});

test("indexSyncedPages maps slug to page and property, ignores unmarked pages, refuses duplicates", async () => {
  const properties = { 1: { slug: "mermaid", contentHash: "h1" }, 3: { slug: "typst-renderer", contentHash: "h3" } };
  const { client: c } = client([
    { method: "GET", path: "/wiki/api/v2/spaces/101/pages", respond: { body: { results: [PAGE(1, "Mermaid"), PAGE(2, "Home"), PAGE(3, "Typst")] } } },
    { method: "GET", path: /^\/wiki\/api\/v2\/pages\/\d+\/properties$/, respond: ({ url }) => { const id = url.pathname.split("/")[5]; const v = properties[id]; return { body: { results: v ? [{ id: `p${id}`, key: PROPERTY_KEY, value: v, version: { number: 1 } }] : [] } }; } },
  ]);
  const index = await c.indexSyncedPages("101");
  assert.deepEqual([...index.keys()], ["mermaid", "typst-renderer"]);
  assert.equal(index.get("mermaid").page.id, "1");
  assert.equal(index.get("mermaid").property.value.contentHash, "h1");
  properties[2] = { slug: "mermaid" };
  await assert.rejects(c.indexSyncedPages("101"), /two pages carry slug mermaid/);
});

test("ensureArchiveParent finds the parent by title or creates it under the home page", async () => {
  let existing = null;
  const { client: c, calls } = client([
    { method: "GET", path: "/wiki/api/v2/spaces/101/pages", respond: () => ({ body: { results: existing ? [existing] : [] } }) },
    { method: "POST", path: "/wiki/api/v2/pages", respond: ({ body }) => { existing = PAGE(40, body.title, { parentId: body.parentId, version: { number: 1 } }); return { body: existing }; } },
  ]);
  const created = await c.ensureArchiveParent("101", "202");
  assert.equal(created.title, ARCHIVE_PARENT_TITLE);
  assert.equal(calls[0].url.searchParams.get("title"), ARCHIVE_PARENT_TITLE);
  assert.equal(calls[1].body.parentId, "202");
  assert.match(calls[1].body.body.value, /no longer live on cloudscript\.io/);
  const found = await c.ensureArchiveParent("101", "202");
  assert.equal(found.id, "40");
  assert.equal(calls.length, 3, "no second create");
});

// --- Redaction scenario --------------------------------------------------------------------

test("scenario: an API error is logged without the token (status, path and body present; no secret)", async () => {
  const echo = `Server says: header was ${BASIC} token ${TOKEN} and that is all`;
  const { client: c, calls } = client([{ method: "PUT", path: "/wiki/api/v2/pages/7", respond: { status: 400, body: { message: echo } } }]);
  let error;
  try {
    await c.updatePage({ id: "7", title: "T", body: "<p/>", versionNumber: 2, message: "m" });
  } catch (err) {
    error = err;
  }
  assert.ok(error instanceof ConfluenceError);
  assert.equal(error.status, 400);
  assert.equal(error.path, "/wiki/api/v2/pages/7");
  for (const text of [error.message, String(error), error.stack, JSON.stringify(error)]) {
    assert.ok(text.includes("400"), "status present");
    assert.ok(text.includes("/wiki/api/v2/pages/7"), "path present");
    assert.ok(text.includes("Server says"), "response body present");
  }
  for (const text of [error.message, error.body, String(error), error.stack, JSON.stringify(error)]) {
    assert.ok(!text.includes(TOKEN), "token absent");
    assert.ok(!text.includes(BASIC_VALUE), "Basic header value absent");
    assert.ok(text.includes("[REDACTED]"));
  }
  assert.equal(calls[0].headers.Authorization, BASIC, "the header itself was sent");
});

test("a transport failure and a non-JSON reply are reported as ConfluenceError, redacted", async () => {
  const boom = new ConfluenceClient({ baseUrl: BASE, email: EMAIL, token: TOKEN, fetch: async () => { throw new Error(`socket closed while sending ${TOKEN}`); } });
  await assert.rejects(boom.getSpace("CSHELP"), (err) => err instanceof ConfluenceError && err.status === 0 && !err.message.includes(TOKEN) && err.message.includes("[REDACTED]"));
  const html = new ConfluenceClient({ baseUrl: BASE, email: EMAIL, token: TOKEN, fetch: async () => reply(200, "<html>login</html>") });
  await assert.rejects(html.getSpace("CSHELP"), /not JSON/);
  const empty = new ConfluenceClient({ baseUrl: BASE, email: EMAIL, token: TOKEN, fetch: async () => reply(204, "") });
  await empty.movePage("1", "append", "2");
});

test("the log callback sees method and path only, never the header", async () => {
  const lines = [];
  const { client: c } = client([{ method: "GET", path: "/wiki/api/v2/spaces", respond: { body: { results: [{ id: 1, key: "CSHELP", homepageId: 2 }] } } }], (line) => lines.push(line));
  await c.getSpace("CSHELP");
  assert.deepEqual(lines, ["GET /wiki/api/v2/spaces?keys=CSHELP&limit=1"]);
  assert.ok(!JSON.stringify(lines).includes(TOKEN));
  assert.equal(c.redact(`x ${TOKEN} y ${BASIC}`), "x [REDACTED] y [REDACTED]");
  assert.equal(c.baseUrl, BASE);
});
