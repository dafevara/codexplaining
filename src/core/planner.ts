import { z } from "zod";
import type { ArtifactType, ExplainerDoc, PRBundle } from "../types.js";
import type { Provider } from "./llm/index.js";

const ARTIFACT_TYPES: [ArtifactType, ...ArtifactType[]] = [
  "feature_explainer",
  "concept_explainer",
  "annotated_flowchart",
  "module_map",
  "annotated_diff",
  "side_by_side",
  "timeline",
  "status_report",
];

const SectionSchema = z.object({
  type: z.enum(ARTIFACT_TYPES),
  title: z.string(),
  description: z.string(),
  context: z.string(),
});

const PlanSchema = z.object({
  title: z.string(),
  summary: z.string(),
  sections: z.array(SectionSchema).min(1),
});

export async function plan(bundle: PRBundle, provider: Provider): Promise<ExplainerDoc> {
  const raw = await provider.complete({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(bundle),
    json: true,
  });
  const parsed = parseJsonLoosely(raw);
  const doc = PlanSchema.parse(parsed);
  return {
    ref: bundle.ref,
    title: doc.title,
    summary: doc.summary,
    artifacts: doc.sections.map((s) => ({
      type: s.type,
      title: s.title,
      description: s.description,
      context: s.context,
    })),
  };
}

function parseJsonLoosely(s: string): unknown {
  const cleaned = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned);
}

const SYSTEM_PROMPT = `You are the planning stage of HEG (HTML Explainer Generator).
Your job is to read a GitHub pull request and decompose it into 2–7 sections,
each of which will be rendered into a beautiful, self-contained HTML visualization by another LLM.

Your output is a JSON plan — you are NOT rendering HTML. You are deciding:
1. What sections best explain this PR to a developer reading it fresh
2. Which visualization type fits each section
3. What content to hand off to the renderer for each section

## Artifact types and when to use them

- **feature_explainer** — General overview with TL;DR, how-it-works steps, and code snippets.
  Use for the opening overview (always include one as the first section) and for any
  feature-level explanation that doesn't fit a more specific type.

- **module_map** — Box-and-arrow diagram of modules, services, or database tables.
  Use for service topology, ER diagrams, component dependencies, or layered architecture.
  The renderer will draw this as an SVG graph.

- **annotated_flowchart** — Top-down flowchart of a process, request lifecycle, or workflow.
  Use when there's a clear sequence of steps with branching (errors, retries, decisions).
  The renderer will draw this as an SVG flowchart with step descriptions.

- **concept_explainer** — Definition cards for new domain terms + optional comparison table.
  Use when the PR introduces new concepts, terminology, or when endpoints/options need comparing.

- **annotated_diff** — File-level review cards with severity-tagged annotations (risk/warn/info).
  Use to highlight the most important or risky hunks for a reviewer to read carefully.

- **side_by_side** — Two-column comparison of approaches, options, or tradeoffs.
  Use when the PR chose between alternatives and the tradeoff is worth explaining.

- **timeline** — Chronological sequence of events, milestones, or migration steps.
  Use for phased rollouts, migration plans, or incident timelines.

- **status_report** — At-a-glance status, metrics, and health summary.
  Use for PRs that include reporting, dashboards, or summary statistics.

## Your output format

Return a single JSON object:
{
  "title": "<short explainer title, 5–10 words>",
  "summary": "<2-3 sentence elevator pitch of what the PR does and why>",
  "sections": [
    {
      "type": "<artifact type from the list above>",
      "title": "<section heading, 3–8 words>",
      "description": "<1-3 sentence instruction to the renderer: what to draw, what to emphasize, what makes this section valuable>",
      "context": "<the curated PR content the renderer needs — extract and organize the relevant text, data, endpoints, fields, steps, filenames, etc. Be specific and complete; the renderer only sees this context, not the full PR.>"
    }
  ]
}

## Rules
- First section MUST be feature_explainer (the overview).
- 2–7 sections total. Pick only the sections that meaningfully add understanding.
- The "context" field is critical — extract the specific data the renderer needs.
  For module_map: list nodes (id, label, kind) and edges (from, to, label).
  For annotated_flowchart: list steps with id, label, description, and which steps follow.
  For concept_explainer: list terms and definitions, plus any comparison rows.
  For annotated_diff: list files with summaries and notes (severity + text).
  For side_by_side: frame the question and list options with pros/cons.
  For feature_explainer: write the TL;DR, list the how-it-works steps, and include key code snippets.
- Do not include content that belongs in another section — keep sections focused.`;

function buildUserPrompt(bundle: PRBundle): string {
  const parts: string[] = [];
  parts.push(`# PR ${bundle.ref.owner}/${bundle.ref.repo}#${bundle.ref.number}`);
  parts.push(`Title: ${bundle.title}`);
  parts.push(`Author: ${bundle.author}`);
  parts.push(`Branches: ${bundle.headBranch} → ${bundle.baseBranch}`);
  parts.push("");
  parts.push("## Body");
  parts.push(bundle.body || "(empty)");

  if (bundle.linkedIssues.length) {
    parts.push("");
    parts.push("## Linked issues");
    for (const issue of bundle.linkedIssues) {
      parts.push(`### #${issue.number}: ${issue.title}`);
      parts.push(issue.body || "(empty)");
      if (issue.comments.length) {
        parts.push("Issue comments:");
        for (const c of issue.comments) {
          parts.push(`- @${c.author}: ${truncate(c.body, 500)}`);
        }
      }
    }
  }

  if (bundle.commits.length) {
    parts.push("");
    parts.push("## Commits");
    for (const c of bundle.commits) {
      parts.push(`- ${c.sha.slice(0, 7)} ${firstLine(c.message)}`);
    }
  }

  if (bundle.comments.length) {
    parts.push("");
    parts.push("## PR comments");
    for (const c of bundle.comments) {
      parts.push(`- @${c.author}: ${truncate(c.body, 500)}`);
    }
  }

  parts.push("");
  parts.push("## Changed files");
  for (const f of bundle.files) {
    parts.push(`- ${f.status.padEnd(8)} ${f.path}  (+${f.additions}/-${f.deletions})`);
  }

  parts.push("");
  parts.push("## Diff");
  parts.push("```diff");
  parts.push(truncate(bundle.diff, 60_000));
  parts.push("```");

  return parts.join("\n");
}

function firstLine(s: string): string {
  const i = s.indexOf("\n");
  return i === -1 ? s : s.slice(0, i);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + `\n…[truncated ${s.length - max} chars]`;
}
