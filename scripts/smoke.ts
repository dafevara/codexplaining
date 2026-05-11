/**
 * Offline smoke test: stubs the LLM provider and exercises the full
 * plan → render → assemble pipeline with canned responses.
 */
import { writeFile } from "node:fs/promises";
import type { Provider } from "../src/core/llm/index.js";
import { plan } from "../src/core/planner.js";
import { renderSection } from "../src/core/artifacts/index.js";
import { assemble } from "../src/core/assemble.js";
import type { PRBundle } from "../src/types.js";

// Minimal stub: returns different canned responses based on call order.
let callCount = 0;
const stubProvider: Provider = {
  name: "anthropic",
  async complete(opts) {
    callCount++;
    if (callCount === 1) {
      // Planner call — return a minimal plan JSON.
      return JSON.stringify({
        title: "Widgets API",
        summary:
          "Adds a /widgets CRUD resource with Postgres storage, a soft-delete policy, and row-level permission checks.",
        sections: [
          {
            type: "feature_explainer",
            title: "What the Widgets API does",
            description:
              "Explain the overall feature: what /widgets is, why it exists, and the key design choices.",
            context:
              "New REST resource /widgets with 5 endpoints (list, create, get, update, soft-delete). Each widget belongs to an owner; only owners can mutate. Deleted widgets are hidden via deleted_at IS NULL filter. Backed by a new widgets table in Postgres.",
          },
          {
            type: "module_map",
            title: "Schema & service topology",
            description:
              "Draw the database ER diagram and module dependencies for the new widgets feature.",
            context: `nodes:
- users (table): id, email
- widgets (table): id, owner_id FK→users.id, name, deleted_at
- WidgetService (module): create, list, get, update, softDelete
- WidgetRouter (module): 5 HTTP handlers

edges:
- widgets.owner_id → users.id
- WidgetRouter → WidgetService
- WidgetService → widgets (table)`,
          },
          {
            type: "annotated_flowchart",
            title: "DELETE /widgets/:id lifecycle",
            description:
              "Trace what happens when a client calls DELETE /widgets/:id, including auth and soft-delete logic.",
            context: `Steps:
1. auth — validate JWT, extract user_id
2. load — SELECT * FROM widgets WHERE id=:id AND deleted_at IS NULL
3. authorize — 403 if widget.owner_id != user_id
4. soft_delete — UPDATE widgets SET deleted_at=NOW() WHERE id=:id
5. respond — 204 No Content`,
          },
        ],
      });
    }
    // Section renderer calls — return simple HTML stubs.
    const typeMatch = opts.user.match(/Artifact type: (\w+)/);
    const type = typeMatch ? typeMatch[1] : "section";
    return `<div style="padding:1rem;border:1px solid var(--heg-border);border-radius:6px;background:var(--heg-card);">
  <p style="color:var(--heg-fg-muted);font-size:0.8rem;text-transform:uppercase;letter-spacing:.05em;margin:0 0 .5rem">
    [smoke] ${type} renderer stub
  </p>
  <pre style="margin:0;font-size:.82rem;white-space:pre-wrap;color:var(--heg-fg)">${
    opts.user.slice(0, 300)
  }</pre>
</div>`;
  },
};

async function main() {
  const bundle: PRBundle = {
    ref: { owner: "acme", repo: "api", number: 42, url: "https://github.com/acme/api/pull/42" },
    title: "feat: add /widgets resource",
    body: "Adds CRUD for widgets with soft-delete and owner-level permissions.",
    author: "dafevara",
    baseBranch: "main",
    headBranch: "feat/widgets",
    files: [
      { path: "db/migrations/0042_widgets.sql", status: "added", additions: 12, deletions: 0 },
      { path: "src/services/widget_service.ts", status: "added", additions: 88, deletions: 0 },
      { path: "src/routers/widgets.ts", status: "added", additions: 64, deletions: 0 },
    ],
    diff: "--- /dev/null\n+++ b/db/migrations/0042_widgets.sql\n@@ -0,0 +1,12 @@\n+CREATE TABLE widgets (...);",
    commits: [{ sha: "abc1234", message: "feat: add widgets table + service + router", author: "dafevara" }],
    comments: [],
    linkedIssues: [],
  };

  const doc = await plan(bundle, stubProvider);
  console.log(`Plan: ${doc.artifacts.length} sections — ${doc.artifacts.map((a) => a.type).join(", ")}`);

  const renderedHtmls = await Promise.all(doc.artifacts.map((spec) => renderSection(spec, stubProvider)));
  const sections = doc.artifacts.map((spec, i) => ({ title: spec.title, html: renderedHtmls[i] ?? "" }));

  const html = assemble({ title: doc.title, summary: doc.summary, ref: doc.ref, sections });
  await writeFile("/tmp/heg-smoke.html", html);
  console.log(`OK — wrote /tmp/heg-smoke.html (${html.length} bytes)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
