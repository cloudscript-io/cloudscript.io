// An in-memory stand-in for ConfluenceClient with the same methods and the same version rules.
//
// Two uses: the offline dry run (`node sync.mjs --dry-run` with no credentials, design D11) runs
// against an empty instance of this class, and the orchestration tests seed it with pages and
// read back every write it recorded. It is never used for a live run.
import { ARCHIVE_PARENT_TITLE, ConfluenceError, PROPERTY_KEY } from "./confluence.mjs";

export class MockConfluence {
  /** Every mutating call, in order: `{ op, ... }`. Empty after a dry run by definition. */
  writes = [];
  /** Every read, in order, for tests that assert reads happen (`{ op, ... }`). */
  reads = [];
  #space;
  #pages = new Map();
  #properties = new Map();
  #nextId = 1000;
  /** Set to `false` to simulate a site where the CQL property search returns nothing. */
  cqlWorks = true;
  /** `{ op, pageId, error }`: throw `error` when that operation targets that page. */
  failOn = null;

  constructor({ spaceKey = "CSHELP", spaceId = "1", homepageId = "2" } = {}) {
    this.#space = { id: String(spaceId), key: spaceKey, name: "Cloudscript Help", homepageId: String(homepageId) };
    this.#pages.set(this.#space.homepageId, {
      id: this.#space.homepageId, title: "Cloudscript Help", status: "current", parentId: null, spaceId: this.#space.id, version: { number: 1, message: "" }, body: "<p>Home</p>",
    });
  }

  redact(text) {
    return String(text);
  }

  #id() {
    this.#nextId += 1;
    return String(this.#nextId);
  }

  #maybeFail(op, pageId) {
    if (this.failOn && this.failOn.op === op && String(this.failOn.pageId) === String(pageId)) throw this.failOn.error;
  }

  #summary(page) {
    return { id: page.id, title: page.title, status: page.status, parentId: page.parentId, spaceId: page.spaceId, version: { ...page.version } };
  }

  #page(id) {
    const page = this.#pages.get(String(id));
    if (!page || page.status !== "current") {
      throw new ConfluenceError({ status: 404, method: "GET", path: `/wiki/api/v2/pages/${id}`, body: "page not found" });
    }
    return page;
  }

  // --- Test seeding (not recorded as writes) ---------------------------------------------

  /** Create a page directly, with an optional `cloudscript-kb` property. Returns the page id. */
  seedPage({ title, body = "<p/>", parentId = this.#space.homepageId, version = 1, property = null }) {
    const id = this.#id();
    this.#pages.set(id, { id, title, status: "current", parentId: parentId == null ? null : String(parentId), spaceId: this.#space.id, version: { number: version, message: "" }, body });
    if (property) this.#properties.set(id, { id: `prop-${id}`, key: PROPERTY_KEY, version: { number: 1 }, value: { ...property } });
    return id;
  }

  /** Current state of a page and its property, for assertions. */
  inspect(id) {
    const page = this.#pages.get(String(id));
    if (!page) return null;
    return { ...this.#summary(page), body: page.body, property: this.#properties.get(String(id))?.value ?? null };
  }

  pagesByTitle(title) {
    return [...this.#pages.values()].filter((p) => p.title === title && p.status === "current").map((p) => this.#summary(p));
  }

  // --- Client interface -----------------------------------------------------------------

  async getSpace(key) {
    this.reads.push({ op: "getSpace", key });
    if (key !== this.#space.key) throw new ConfluenceError({ status: 404, method: "GET", path: "/wiki/api/v2/spaces", body: `space ${key} was not found` });
    return { ...this.#space };
  }

  async listPages(spaceId) {
    this.reads.push({ op: "listPages", spaceId });
    return [...this.#pages.values()].filter((p) => p.status === "current" && p.spaceId === String(spaceId)).map((p) => this.#summary(p));
  }

  async getPage(id) {
    this.reads.push({ op: "getPage", id: String(id) });
    const page = this.#page(id);
    return { ...this.#summary(page), body: page.body };
  }

  async findPageByTitle(spaceId, title) {
    this.reads.push({ op: "findPageByTitle", title });
    const page = [...this.#pages.values()].find((p) => p.status === "current" && p.spaceId === String(spaceId) && p.title === title);
    return page ? this.#summary(page) : null;
  }

  async createPage({ spaceId, parentId, title, body }) {
    this.#maybeFail("createPage", "new");
    if ([...this.#pages.values()].some((p) => p.status === "current" && p.title === title)) {
      throw new ConfluenceError({ status: 400, method: "POST", path: "/wiki/api/v2/pages", body: `A page with this title already exists: ${title}` });
    }
    const id = this.#id();
    const page = { id, title, status: "current", parentId: parentId == null ? null : String(parentId), spaceId: String(spaceId), version: { number: 1, message: "" }, body };
    this.#pages.set(id, page);
    this.writes.push({ op: "createPage", id, title, parentId: page.parentId, body });
    return this.#summary(page);
  }

  async updatePage({ id, title, body, versionNumber, message }) {
    this.#maybeFail("updatePage", id);
    const page = this.#page(id);
    if (versionNumber !== page.version.number + 1) {
      throw new ConfluenceError({ status: 409, method: "PUT", path: `/wiki/api/v2/pages/${id}`, body: `version ${versionNumber} is not current+1 (${page.version.number + 1})` });
    }
    page.title = title;
    page.body = body;
    page.version = { number: versionNumber, message: message ?? "" };
    this.writes.push({ op: "updatePage", id: String(id), title, versionNumber, message });
    return this.#summary(page);
  }

  async movePage(pageId, position, targetId) {
    this.#maybeFail("movePage", pageId);
    const page = this.#page(pageId);
    const target = this.#page(targetId);
    page.parentId = position === "append" ? target.id : target.parentId;
    this.writes.push({ op: "movePage", id: page.id, position, targetId: target.id });
  }

  async getProperty(pageId, key = PROPERTY_KEY) {
    this.reads.push({ op: "getProperty", id: String(pageId) });
    this.#page(pageId);
    const property = this.#properties.get(String(pageId));
    return property && property.key === key ? { ...property, value: { ...property.value } } : null;
  }

  async setProperty(pageId, value, { key = PROPERTY_KEY, message } = {}) {
    this.#maybeFail("setProperty", pageId);
    this.#page(pageId);
    const existing = this.#properties.get(String(pageId));
    const property = existing
      ? { id: existing.id, key, version: { number: existing.version.number + 1 }, value: { ...value } }
      : { id: `prop-${pageId}`, key, version: { number: 1 }, value: { ...value } };
    this.#properties.set(String(pageId), property);
    this.writes.push({ op: "setProperty", id: String(pageId), value: { ...value }, message });
    return { ...property };
  }

  async searchPageIdBySlug(spaceKey, slug) {
    this.reads.push({ op: "searchPageIdBySlug", slug });
    if (!this.cqlWorks || spaceKey !== this.#space.key) return null;
    const hits = [...this.#properties.entries()].filter(([id, p]) => p.value?.slug === slug && this.#pages.get(id)?.status === "current");
    return hits.length === 1 ? hits[0][0] : null;
  }

  async indexSyncedPages(spaceId) {
    const index = new Map();
    for (const page of await this.listPages(spaceId)) {
      const property = await this.getProperty(page.id);
      const slug = property?.value?.slug;
      if (typeof slug !== "string" || slug === "") continue;
      if (index.has(slug)) throw new ConfluenceError({ status: 409, method: "GET", path: `/wiki/api/v2/pages/${page.id}/properties`, body: `two pages carry slug ${slug}` });
      index.set(slug, { page, property });
    }
    return index;
  }

  async ensureArchiveParent(spaceId, homepageId) {
    const existing = await this.findPageByTitle(spaceId, ARCHIVE_PARENT_TITLE);
    if (existing) return existing;
    return this.createPage({ spaceId, parentId: homepageId, title: ARCHIVE_PARENT_TITLE, body: "<p>Guides for apps that are no longer live on cloudscript.io.</p>" });
  }
}
