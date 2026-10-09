// A minimal Jira Cloud REST client (fetch only) for the app-options sync.
//
// It calls exactly five operations, all on one custom field: list the field's context to
// project mappings, list a context's options, create options, update options (value and
// disabled flag) and reorder options. With a scoped service-account token these need only the
// granular scopes read:field:jira, read:field.option:jira and write:field.option:jira
// (design D3); nothing here reads or writes issues, projects, users or any other field.
//
// Auth follows kb-sync (design D8 of sync-guides-to-confluence-kb): a scoped token is accepted
// only at the platform gateway, `https://api.atlassian.com/ex/jira/{cloudId}`, as Bearer; a
// classic token goes to the site URL as Basic `email:token`. The presence of JIRA_USER_EMAIL
// selects Basic. The Authorization header is built once, never returned, and every error path
// passes through `redact()`. Pagination uses startAt offsets on the base URL and never follows
// a server-supplied link, so the header cannot be carried to another host.

const REQUIRED_ENV = ["JIRA_BASE_URL", "JIRA_API_TOKEN", "JIRA_APP_FIELD_ID", "JIRA_PROJECT_ID"];
const OPTIONAL_ENV = ["JIRA_USER_EMAIL"];

export class JiraError extends Error {
  constructor({ status, method, path, body }) {
    const detail = body == null || body === "" ? "" : `: ${String(body).slice(0, 2000)}`;
    super(`Jira ${method} ${path} failed with ${status || "no response"}${detail}`);
    this.name = "JiraError";
    this.status = status;
    this.method = method;
    this.path = path;
  }
}

/**
 * Read the settings from the environment. Returns null when none is set (offline dry run),
 * throws when only some of the required ones are, so a half-configured workflow fails loudly.
 */
export function credentialsFromEnv(env = process.env) {
  const isSet = (name) => typeof env[name] === "string" && env[name].trim() !== "";
  if (![...REQUIRED_ENV, ...OPTIONAL_ENV].some(isSet)) return null;
  const missing = REQUIRED_ENV.filter((name) => !isSet(name));
  if (missing.length > 0) throw new Error(`Jira settings are incomplete: missing ${missing.join(", ")}`);
  let baseUrl;
  try {
    baseUrl = new URL(env.JIRA_BASE_URL.trim());
  } catch {
    throw new Error("JIRA_BASE_URL is not a valid URL");
  }
  if (baseUrl.protocol !== "https:") throw new Error("JIRA_BASE_URL must use https");
  const fieldId = env.JIRA_APP_FIELD_ID.trim();
  if (!/^customfield_\d+$/.test(fieldId)) throw new Error("JIRA_APP_FIELD_ID must look like customfield_12345");
  const projectId = env.JIRA_PROJECT_ID.trim();
  if (!/^\d+$/.test(projectId)) throw new Error("JIRA_PROJECT_ID must be the numeric project id, not the key");
  return {
    baseUrl: `${baseUrl.origin}${baseUrl.pathname.replace(/\/+$/, "")}`,
    email: isSet("JIRA_USER_EMAIL") ? env.JIRA_USER_EMAIL.trim() : null,
    token: env.JIRA_API_TOKEN.trim(),
    fieldId,
    projectId,
  };
}

export class JiraClient {
  #baseUrl;
  #token;
  #auth;
  #fetch;
  #log;

  constructor({ baseUrl, email, token, fetch = globalThis.fetch, log = () => {} }) {
    if (!baseUrl || !token) throw new Error("JiraClient needs baseUrl and token");
    this.#baseUrl = String(baseUrl).replace(/\/+$/, "");
    this.#token = token;
    const basic = typeof email === "string" && email.trim() !== "";
    this.#auth = basic ? `Basic ${Buffer.from(`${email.trim()}:${token}`, "utf8").toString("base64")}` : `Bearer ${token}`;
    this.#fetch = fetch;
    this.#log = log;
  }

  get baseUrl() {
    return this.#baseUrl;
  }

  /** `Basic` or `Bearer`; the scheme name only, safe to log. */
  get authMode() {
    return this.#auth.slice(0, this.#auth.indexOf(" "));
  }

  redact(text) {
    let out = String(text);
    for (const secret of [this.#auth, this.#auth.slice(this.#auth.indexOf(" ") + 1), this.#token]) {
      if (secret) out = out.split(secret).join("[REDACTED]");
    }
    return out;
  }

  async #request(method, path, { query, body } = {}) {
    const url = new URL(`${this.#baseUrl}${path}`);
    if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
    const headers = { Accept: "application/json", Authorization: this.#auth };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const where = `${path}${url.search}`;
    this.#log(`${method} ${where}`);
    let response;
    try {
      response = await this.#fetch(url.href, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (err) {
      throw new JiraError({ status: 0, method, path: where, body: this.redact(err?.message ?? String(err)) });
    }
    const text = await response.text();
    if (!response.ok) throw new JiraError({ status: response.status, method, path: where, body: this.redact(text) });
    if (text.trim() === "") return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new JiraError({ status: response.status, method, path: where, body: `response is not JSON: ${this.redact(text).slice(0, 200)}` });
    }
  }

  async #pages(path, query = {}) {
    const values = [];
    let startAt = 0;
    for (let guard = 0; guard < 100; guard += 1) {
      const data = await this.#request("GET", path, { query: { ...query, startAt, maxResults: 100 } });
      const page = data?.values ?? [];
      values.push(...page);
      if (data?.isLast !== false || page.length === 0) return values;
      startAt += page.length;
    }
    throw new JiraError({ status: 0, method: "GET", path, body: "more than 100 pages; refusing to continue" });
  }

  /** [{ contextId, projectId?, isGlobalContext? }] */
  listProjectMappings(fieldId) {
    return this.#pages(`/rest/api/3/field/${encodeURIComponent(fieldId)}/context/projectmapping`);
  }

  /** [{ id, value, disabled }] in the context's display order. */
  async listOptions(fieldId, contextId) {
    const values = await this.#pages(`/rest/api/3/field/${encodeURIComponent(fieldId)}/context/${encodeURIComponent(contextId)}/option`);
    return values.map((o) => ({ id: String(o.id), value: o.value, disabled: Boolean(o.disabled) }));
  }

  async createOptions(fieldId, contextId, values) {
    const data = await this.#request("POST", `/rest/api/3/field/${encodeURIComponent(fieldId)}/context/${encodeURIComponent(contextId)}/option`, {
      body: { options: values.map((value) => ({ value, disabled: false })) },
    });
    return (data?.options ?? []).map((o) => ({ id: String(o.id), value: o.value, disabled: Boolean(o.disabled) }));
  }

  /** updates: [{ id, value, disabled }] */
  async updateOptions(fieldId, contextId, updates) {
    await this.#request("PUT", `/rest/api/3/field/${encodeURIComponent(fieldId)}/context/${encodeURIComponent(contextId)}/option`, {
      body: { options: updates.map(({ id, value, disabled }) => ({ id, value, disabled })) },
    });
  }

  async reorderOptions(fieldId, contextId, ids) {
    await this.#request("PUT", `/rest/api/3/field/${encodeURIComponent(fieldId)}/context/${encodeURIComponent(contextId)}/option/move`, {
      body: { customFieldOptionIds: ids, position: "First" },
    });
  }
}
