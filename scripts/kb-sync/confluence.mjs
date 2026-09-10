// A minimal Confluence Cloud REST client (fetch only) for the knowledge base sync.
//
// Reads and writes exactly what design D2, D6 and D7 need: the space, its pages, one page with
// its body and version, the `cloudscript-kb` content property, page creation and update, the
// v1 move endpoint (v2 has no move), a CQL lookup by property, and the `Archived guides` parent
// created on demand. Credentials come from the environment only (`credentialsFromEnv`), the
// Basic header is built once and never returned, and every error path passes through
// `redact()` so neither the token nor the header value can reach a log (design D8).
//
// Two things here are deliberately defensive, because nothing can be tried live before task 5:
// the CQL property lookup is the design's letter, but Confluence indexes content properties for
// CQL only when an app declares them, so the sync also builds a slug index by reading each
// page's property directly (`indexSyncedPages`) and treats CQL as an optimisation; and every
// write is followed by a read-back in sync.mjs, never trusted from a 2xx alone.

export const PROPERTY_KEY = "cloudscript-kb";
export const ARCHIVE_PARENT_TITLE = "Archived guides";
const REQUIRED_ENV = ["CONFLUENCE_BASE_URL", "CONFLUENCE_USER_EMAIL", "CONFLUENCE_API_TOKEN", "KB_SPACE_KEY"];
const PAGE_LIMIT = 250;

export class ConfluenceError extends Error {
  constructor({ status, method, path, body }) {
    const detail = body == null || body === "" ? "" : `: ${String(body).slice(0, 2000)}`;
    super(`Confluence ${method} ${path} failed with ${status || "no response"}${detail}`);
    this.name = "ConfluenceError";
    this.status = status;
    this.method = method;
    this.path = path;
    this.body = body;
  }
}

/**
 * Read the four settings from the environment. Returns null when none of them is set (the
 * offline dry-run mode), throws when only some are, so a half-configured workflow fails loudly.
 */
export function credentialsFromEnv(env = process.env) {
  const present = REQUIRED_ENV.filter((name) => typeof env[name] === "string" && env[name].trim() !== "");
  if (present.length === 0) return null;
  const missing = REQUIRED_ENV.filter((name) => !present.includes(name));
  if (missing.length > 0) {
    throw new Error(`Confluence credentials are incomplete: missing ${missing.join(", ")}`);
  }
  let baseUrl;
  try {
    baseUrl = new URL(env.CONFLUENCE_BASE_URL.trim());
  } catch {
    throw new Error("CONFLUENCE_BASE_URL is not a valid URL");
  }
  if (baseUrl.protocol !== "https:") throw new Error("CONFLUENCE_BASE_URL must use https");
  return {
    baseUrl: baseUrl.origin,
    email: env.CONFLUENCE_USER_EMAIL.trim(),
    token: env.CONFLUENCE_API_TOKEN.trim(),
    spaceKey: env.KB_SPACE_KEY.trim(),
  };
}

const quoteCql = (value) => `"${String(value).replace(/["\\]/g, "\\$&")}"`;

function pageSummary(page) {
  return {
    id: String(page.id),
    title: page.title,
    status: page.status,
    parentId: page.parentId == null ? null : String(page.parentId),
    spaceId: page.spaceId == null ? null : String(page.spaceId),
    version: { number: page.version?.number, message: page.version?.message ?? "" },
  };
}

export class ConfluenceClient {
  #baseUrl;
  #token;
  #auth;
  #fetch;
  #log;

  constructor({ baseUrl, email, token, fetch = globalThis.fetch, log = () => {} }) {
    if (!baseUrl || !email || !token) throw new Error("ConfluenceClient needs baseUrl, email and token");
    this.#baseUrl = String(baseUrl).replace(/\/+$/, "");
    this.#token = token;
    this.#auth = `Basic ${Buffer.from(`${email}:${token}`, "utf8").toString("base64")}`;
    this.#fetch = fetch;
    this.#log = log;
  }

  get baseUrl() {
    return this.#baseUrl;
  }

  /** Replace the token and the Basic header value wherever they appear in a string. */
  redact(text) {
    let out = String(text);
    for (const secret of [this.#auth, this.#auth.slice("Basic ".length), this.#token]) {
      if (secret) out = out.split(secret).join("[REDACTED]");
    }
    return out;
  }

  async #request(method, path, { query, body } = {}) {
    const url = new URL(/^https?:\/\//.test(path) ? path : `${this.#baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value != null) url.searchParams.set(key, String(value));
      }
    }
    const headers = { Accept: "application/json", Authorization: this.#auth };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const where = `${url.pathname}${url.search}`;
    this.#log(`${method} ${where}`);
    let response;
    try {
      response = await this.#fetch(url.href, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new ConfluenceError({ status: 0, method, path: where, body: this.redact(err?.message ?? String(err)) });
    }
    const text = await response.text();
    if (!response.ok) {
      throw new ConfluenceError({ status: response.status, method, path: where, body: this.redact(text) });
    }
    if (text.trim() === "") return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new ConfluenceError({ status: response.status, method, path: where, body: `response is not JSON: ${this.redact(text).slice(0, 200)}` });
    }
  }

  async #paginate(path, query) {
    const results = [];
    let next = path;
    let nextQuery = query;
    for (let guard = 0; next && guard < 100; guard += 1) {
      const data = await this.#request("GET", next, { query: nextQuery });
      results.push(...(data?.results ?? []));
      next = data?._links?.next ?? null;
      nextQuery = undefined;
    }
    return results;
  }

  // --- Space and pages ------------------------------------------------------------------------

  async getSpace(key) {
    const data = await this.#request("GET", "/wiki/api/v2/spaces", { query: { keys: key, limit: 1 } });
    const space = data?.results?.find((s) => s.key === key);
    if (!space) {
      throw new ConfluenceError({ status: 404, method: "GET", path: "/wiki/api/v2/spaces", body: `space ${key} was not found, or the service account cannot see it` });
    }
    return {
      id: String(space.id),
      key: space.key,
      name: space.name,
      homepageId: space.homepageId == null ? null : String(space.homepageId),
    };
  }

  /** Every current page in the space (id, title, parent, version), following pagination. */
  async listPages(spaceId) {
    const pages = await this.#paginate(`/wiki/api/v2/spaces/${encodeURIComponent(spaceId)}/pages`, { limit: PAGE_LIMIT, status: "current" });
    return pages.map(pageSummary);
  }

  async getPage(id) {
    const page = await this.#request("GET", `/wiki/api/v2/pages/${encodeURIComponent(id)}`, { query: { "body-format": "storage" } });
    return { ...pageSummary(page), body: page.body?.storage?.value ?? "" };
  }

  async findPageByTitle(spaceId, title) {
    const data = await this.#request("GET", `/wiki/api/v2/spaces/${encodeURIComponent(spaceId)}/pages`, { query: { title, status: "current", limit: 1 } });
    const page = data?.results?.find((p) => p.title === title);
    return page ? pageSummary(page) : null;
  }

  async createPage({ spaceId, parentId, title, body }) {
    const payload = {
      spaceId: String(spaceId),
      status: "current",
      title,
      body: { representation: "storage", value: body },
    };
    if (parentId != null) payload.parentId = String(parentId);
    const page = await this.#request("POST", "/wiki/api/v2/pages", { body: payload });
    return pageSummary(page);
  }

  async updatePage({ id, title, body, versionNumber, message }) {
    const payload = {
      id: String(id),
      status: "current",
      title,
      body: { representation: "storage", value: body },
      version: { number: versionNumber, message },
    };
    const page = await this.#request("PUT", `/wiki/api/v2/pages/${encodeURIComponent(id)}`, { body: payload });
    return pageSummary(page);
  }

  /** v1 move: `position` is `append` (last child of target), `before` or `after` (sibling). */
  async movePage(pageId, position, targetId) {
    if (!["append", "before", "after"].includes(position)) throw new Error(`invalid move position ${position}`);
    await this.#request("PUT", `/wiki/rest/api/content/${encodeURIComponent(pageId)}/move/${position}/${encodeURIComponent(targetId)}`);
  }

  // --- Content property --------------------------------------------------------------------

  async getProperty(pageId, key = PROPERTY_KEY) {
    const data = await this.#request("GET", `/wiki/api/v2/pages/${encodeURIComponent(pageId)}/properties`, { query: { key } });
    const property = data?.results?.find((p) => p.key === key);
    if (!property) return null;
    return { id: String(property.id), key: property.key, version: { number: property.version?.number }, value: property.value };
  }

  /** Create or update the property; returns the stored property. */
  async setProperty(pageId, value, { key = PROPERTY_KEY, message } = {}) {
    const existing = await this.getProperty(pageId, key);
    if (existing) {
      const payload = { key, value, version: { number: (existing.version.number ?? 0) + 1, message } };
      const updated = await this.#request("PUT", `/wiki/api/v2/pages/${encodeURIComponent(pageId)}/properties/${encodeURIComponent(existing.id)}`, { body: payload });
      return { id: String(updated.id), key: updated.key, version: { number: updated.version?.number }, value: updated.value };
    }
    const created = await this.#request("POST", `/wiki/api/v2/pages/${encodeURIComponent(pageId)}/properties`, { body: { key, value } });
    return { id: String(created.id), key: created.key, version: { number: created.version?.number }, value: created.value };
  }

  // --- Lookup ------------------------------------------------------------------------------

  /**
   * Design D2's CQL lookup. Returns the page id when the search returns exactly what the slug
   * asks for, and null when it returns nothing or fails: the caller falls back to the index.
   */
  async searchPageIdBySlug(spaceKey, slug) {
    const cql = `space = ${quoteCql(spaceKey)} and type = page and content.property[${PROPERTY_KEY}].slug = ${quoteCql(slug)}`;
    let data;
    try {
      data = await this.#request("GET", "/wiki/rest/api/search", { query: { cql, limit: 5 } });
    } catch (err) {
      if (err instanceof ConfluenceError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 403) {
        this.#log(`CQL lookup unavailable (${err.status}); using the property index`);
        return null;
      }
      throw err;
    }
    const ids = (data?.results ?? []).map((r) => r.content?.id).filter((id) => id != null).map(String);
    return ids.length === 1 ? ids[0] : null;
  }

  /**
   * Read every page in the space with the `cloudscript-kb` property: a map of slug to
   * `{ page, property }`. One request per page; the space holds a handful of pages.
   */
  async indexSyncedPages(spaceId) {
    const index = new Map();
    for (const page of await this.listPages(spaceId)) {
      const property = await this.getProperty(page.id);
      const slug = property?.value?.slug;
      if (typeof slug !== "string" || slug === "") continue;
      if (index.has(slug)) {
        throw new ConfluenceError({ status: 409, method: "GET", path: `/wiki/api/v2/pages/${page.id}/properties`, body: `two pages carry slug ${slug}: ${index.get(slug).page.id} and ${page.id}; resolve by hand` });
      }
      index.set(slug, { page, property });
    }
    return index;
  }

  // --- Archive parent -----------------------------------------------------------------------

  /** Find the `Archived guides` page, creating it under the space home page if it is missing. */
  async ensureArchiveParent(spaceId, homepageId) {
    const existing = await this.findPageByTitle(spaceId, ARCHIVE_PARENT_TITLE);
    if (existing) return existing;
    const body = "<p>Guides for apps that are no longer live on cloudscript.io. They are kept for reference and are not updated.</p>";
    return this.createPage({ spaceId, parentId: homepageId, title: ARCHIVE_PARENT_TITLE, body });
  }
}
