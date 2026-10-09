// An in-memory stand-in for the five Jira operations JiraClient uses. The offline dry run and
// the tests run against it. It records every write in `writes` and enforces the two Jira rules
// the sync depends on: option values are unique within a context (case-insensitive), and a
// reorder must name existing options of that context.
export class MockJira {
  constructor({ fieldId = "customfield_10458", mappings = [{ contextId: "10632", projectId: "10134" }], options = [] } = {}) {
    this.fieldId = fieldId;
    this.mappings = mappings.map((m) => ({ ...m }));
    this.options = new Map(); // contextId -> [{id, value, disabled}]
    for (const m of this.mappings) this.options.set(String(m.contextId), []);
    const first = String(this.mappings.find((m) => !m.isGlobalContext)?.contextId ?? this.mappings[0]?.contextId ?? "10632");
    this.options.set(first, options.map((o) => ({ id: String(o.id), value: o.value, disabled: Boolean(o.disabled) })));
    this.nextId = 20000;
    this.writes = [];
    this.failNext = null; // set to a method name to make its next call throw
  }

  get authMode() {
    return "Mock";
  }

  #ctx(fieldId, contextId) {
    if (fieldId !== this.fieldId) throw new Error(`unknown field ${fieldId}`);
    const list = this.options.get(String(contextId));
    if (!list) throw new Error(`unknown context ${contextId}`);
    return list;
  }

  #maybeFail(name) {
    if (this.failNext === name) {
      this.failNext = null;
      throw new Error(`mock failure in ${name}`);
    }
  }

  async listProjectMappings(fieldId) {
    if (fieldId !== this.fieldId) throw new Error(`unknown field ${fieldId}`);
    return this.mappings.map((m) => ({ ...m }));
  }

  async listOptions(fieldId, contextId) {
    return this.#ctx(fieldId, contextId).map((o) => ({ ...o }));
  }

  async createOptions(fieldId, contextId, values) {
    this.#maybeFail("createOptions");
    const list = this.#ctx(fieldId, contextId);
    const created = [];
    for (const value of values) {
      if (list.some((o) => o.value.toLowerCase() === value.toLowerCase())) throw new Error(`duplicate option ${value}`);
      const option = { id: String(this.nextId++), value, disabled: false };
      list.push(option);
      created.push({ ...option });
    }
    this.writes.push({ op: "create", values: [...values] });
    return created;
  }

  async updateOptions(fieldId, contextId, updates) {
    this.#maybeFail("updateOptions");
    const list = this.#ctx(fieldId, contextId);
    for (const u of updates) {
      const option = list.find((o) => o.id === u.id);
      if (!option) throw new Error(`unknown option ${u.id}`);
      if (list.some((o) => o.id !== u.id && o.value.toLowerCase() === u.value.toLowerCase())) throw new Error(`duplicate option ${u.value}`);
      option.value = u.value;
      option.disabled = Boolean(u.disabled);
    }
    this.writes.push({ op: "update", updates: updates.map((u) => ({ ...u })) });
  }

  async reorderOptions(fieldId, contextId, ids) {
    this.#maybeFail("reorderOptions");
    const list = this.#ctx(fieldId, contextId);
    for (const id of ids) if (!list.some((o) => o.id === id)) throw new Error(`unknown option ${id}`);
    const moved = ids.map((id) => list.find((o) => o.id === id));
    const rest = list.filter((o) => !ids.includes(o.id));
    list.splice(0, list.length, ...moved, ...rest);
    this.writes.push({ op: "reorder", ids: [...ids] });
  }
}
