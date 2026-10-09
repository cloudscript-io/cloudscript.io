// REST client tests with a mocked fetch: request shapes, auth selection, pagination that never
// leaves the base URL, and credentials that never reach an error message.
import test from "node:test";
import assert from "node:assert/strict";
import { JiraClient, JiraError, credentialsFromEnv } from "../../scripts/jira-options-sync/jira.mjs";

// Invented values throughout.
const SITE = "https://cloudscript.atlassian.net";
const GATEWAY = "https://api.atlassian.com/ex/jira/00000000-0000-4000-8000-000000000000";
const EMAIL = "jira-sync@example.com";
const TOKEN = "ATATT3xFfGF0invented-jira-token-1a2b3c";
const FIELD = "customfield_10458";

function reply(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

function fakeFetch(handler) {
  const calls = [];
  const fetch = async (url, init) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: u, method: init.method, headers: init.headers, body });
    return handler({ url: u, method: init.method, body });
  };
  return { fetch, calls };
}

test("credentialsFromEnv: none set means offline; partial or malformed settings fail loudly", () => {
  assert.equal(credentialsFromEnv({}), null);
  assert.throws(() => credentialsFromEnv({ JIRA_API_TOKEN: TOKEN }), /missing JIRA_BASE_URL, JIRA_APP_FIELD_ID, JIRA_PROJECT_ID/);
  const ok = { JIRA_BASE_URL: `${GATEWAY}/`, JIRA_API_TOKEN: TOKEN, JIRA_APP_FIELD_ID: FIELD, JIRA_PROJECT_ID: "10134", JIRA_USER_EMAIL: "" };
  const c = credentialsFromEnv(ok);
  assert.equal(c.baseUrl, GATEWAY);
  assert.equal(c.email, null, "a blank email (an unset GitHub secret) selects Bearer");
  assert.throws(() => credentialsFromEnv({ ...ok, JIRA_BASE_URL: "http://cloudscript.atlassian.net" }), /https/);
  assert.throws(() => credentialsFromEnv({ ...ok, JIRA_APP_FIELD_ID: "Cloudscript app" }), /customfield_/);
  assert.throws(() => credentialsFromEnv({ ...ok, JIRA_PROJECT_ID: "CUS" }), /numeric/);
});

test("auth: Bearer without an email, Basic with one", async () => {
  const { fetch, calls } = fakeFetch(() => reply(200, { isLast: true, values: [] }));
  await new JiraClient({ baseUrl: GATEWAY, token: TOKEN, fetch }).listProjectMappings(FIELD);
  await new JiraClient({ baseUrl: SITE, email: EMAIL, token: TOKEN, fetch }).listProjectMappings(FIELD);
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[0].url.href.startsWith(`${GATEWAY}/rest/api/3/field/${FIELD}/context/projectmapping`), true);
  assert.equal(calls[1].headers.Authorization, `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")}`);
});

test("pagination advances by startAt on the base URL and ignores any nextPage link", async () => {
  const { fetch, calls } = fakeFetch(({ url }) => {
    const startAt = Number(url.searchParams.get("startAt"));
    if (startAt === 0) return reply(200, { isLast: false, nextPage: "https://evil.example/steal", values: [{ id: "1", value: "A", disabled: false }] });
    return reply(200, { isLast: true, values: [{ id: "2", value: "B", disabled: true }] });
  });
  const client = new JiraClient({ baseUrl: GATEWAY, token: TOKEN, fetch });
  const options = await client.listOptions(FIELD, "10632");
  assert.deepEqual(options, [{ id: "1", value: "A", disabled: false }, { id: "2", value: "B", disabled: true }]);
  assert.ok(calls.every((c) => c.url.origin === new URL(GATEWAY).origin), "no request left the base origin");
  assert.equal(calls[1].url.searchParams.get("startAt"), "1");
});

test("write shapes: create, update and reorder send exactly what the API expects", async () => {
  const { fetch, calls } = fakeFetch(({ method }) => (method === "POST" ? reply(200, { options: [{ id: "30", value: "New", disabled: false }] }) : reply(204, "")));
  const client = new JiraClient({ baseUrl: GATEWAY, token: TOKEN, fetch });
  const created = await client.createOptions(FIELD, "10632", ["New"]);
  await client.updateOptions(FIELD, "10632", [{ id: "2", value: "Old", disabled: true, extra: "dropped" }]);
  await client.reorderOptions(FIELD, "10632", ["30", "2"]);
  assert.deepEqual(created, [{ id: "30", value: "New", disabled: false }]);
  assert.deepEqual(calls[0].body, { options: [{ value: "New", disabled: false }] });
  assert.deepEqual(calls[1].body, { options: [{ id: "2", value: "Old", disabled: true }] });
  assert.equal(calls[2].url.pathname.endsWith("/rest/api/3/field/customfield_10458/context/10632/option/move"), true);
  assert.deepEqual(calls[2].body, { customFieldOptionIds: ["30", "2"], position: "First" });
  assert.ok(calls.every((c) => c.method !== "DELETE"), "never deletes");
});

test("scenario: an error response that echoes the credentials is redacted", async () => {
  const basic = Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
  const { fetch } = fakeFetch(() => reply(403, `denied for ${TOKEN} / Basic ${basic}`));
  const client = new JiraClient({ baseUrl: SITE, email: EMAIL, token: TOKEN, fetch });
  const err = await client.listOptions(FIELD, "1").catch((e) => e);
  assert.ok(err instanceof JiraError);
  assert.equal(err.status, 403);
  assert.ok(!err.message.includes(TOKEN) && !err.message.includes(basic), err.message);
  assert.match(err.message, /\[REDACTED\]/);
});

test("a network failure is redacted too", async () => {
  const client = new JiraClient({ baseUrl: GATEWAY, token: TOKEN, fetch: async () => { throw new Error(`socket closed ${TOKEN}`); } });
  const err = await client.listProjectMappings(FIELD).catch((e) => e);
  assert.ok(!err.message.includes(TOKEN));
});
