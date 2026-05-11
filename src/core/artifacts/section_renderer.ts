import type { ArtifactSpec, ArtifactType } from "../../types.js";
import type { Provider } from "../llm/index.js";

export async function renderSection(spec: ArtifactSpec, provider: Provider): Promise<string> {
  const raw = await provider.complete({
    system: buildSystemPrompt(spec.type),
    user: buildUserPrompt(spec),
    json: false,
  });
  // Strip accidental outer wrapper tags the model might add.
  return cleanOutput(raw);
}

function buildUserPrompt(spec: ArtifactSpec): string {
  return `Section title: ${spec.title}
Artifact type: ${spec.type}
Rendering goal: ${spec.description}

Content to visualize:
${spec.context}`;
}

function cleanOutput(html: string): string {
  // Strip ```html / ``` fences if the model wrapped its output.
  let s = html.replace(/^```html\s*/i, "").replace(/```\s*$/i, "").trim();
  // Strip a bare <!doctype or <html> wrapper if present — we only want the fragment.
  if (/^<!doctype/i.test(s)) {
    const bodyStart = s.search(/<body[^>]*>/i);
    const bodyEnd = s.search(/<\/body>/i);
    if (bodyStart !== -1 && bodyEnd !== -1) {
      s = s.slice(s.indexOf(">", bodyStart) + 1, bodyEnd).trim();
    }
  }
  return s;
}

const DESIGN_SYSTEM = `
## Design system (CSS variables available in the page)
:root {
  --heg-bg: #fafaf8;          /* page background */
  --heg-fg: #1c1c1e;          /* primary text */
  --heg-fg-muted: #5b5b62;    /* secondary text */
  --heg-card: #fff;           /* card/panel background */
  --heg-border: #e5e5e0;      /* border color */
  --heg-accent: #4338ca;      /* indigo accent (links, highlights) */
  --heg-accent-bg: #eef2ff;   /* light accent background */
  --heg-code-bg: #1f2937;     /* dark code block bg */
  --heg-code-fg: #e5e7eb;     /* code text */
}
(In dark mode these shift automatically — do not hardcode light colors.)

## Typography & spacing
- Font: system-ui / -apple-system (already set on body)
- Base font size: 15px
- Use rem units for font sizes, rem/px for spacing
- Line height: 1.55

## Styling rules
- No external stylesheets or CDN links — everything must be inline <style> tags.
- No external JS libraries (no D3, no Chart.js, no Mermaid, no React).
- Use the CSS variables above for all colors so dark mode works automatically.
- Prefer SVG for diagrams; inline CSS for layout; vanilla JS for interactivity.
- Border radius: 6px for cards/panels; 4px for small elements.
- Shadows: box-shadow: 0 1px 3px rgba(0,0,0,0.08)
`;

const TYPE_GUIDANCE: Record<ArtifactType, string> = {
  feature_explainer: `
## Rendering guidance for: feature_explainer
Goal: make the feature immediately understandable without prior context.

Structure:
1. TL;DR block — accent-colored left-border callout with a 1-2 sentence plain-English summary.
2. How-it-works steps — use <details>/<summary> collapsible cards. Each step has a title and body.
3. (Optional) Tabbed code snippets — tab bar with buttons + panels. Show the most relevant code.

HTML patterns:
- TL;DR: <div class="tldr"> with border-left: 3px solid var(--heg-accent)
- Steps: <details> elements stacked vertically with chevron animation on open
- Tabs: role="tablist" / role="tab" / role="tabpanel", toggle via data-active attribute
- Make step bodies readable prose, not just raw code
`,

  module_map: `
## Rendering guidance for: module_map
Goal: show the structural relationships between components, services, or tables at a glance.

Draw an SVG box-and-arrow diagram:
- Nodes: rounded rectangles, colored by kind:
  - external (callers, external services): fill var(--heg-border), stroke #9ca3af
  - service (main services): fill var(--heg-accent-bg), stroke var(--heg-accent)
  - module (internal code modules): fill var(--heg-card), stroke var(--heg-border)
  - table (database tables): fill #f0fdf4, stroke #16a34a
- Edges: SVG <line> or <path> with an arrowhead marker; edge labels in small text
- Layout: arrange nodes to minimize crossing edges. A left-to-right or top-to-bottom
  layered layout usually works. Use absolute x/y coordinates in the SVG.
- Make the SVG wide enough (min 600px) and set viewBox for responsiveness.
- Add a hover tooltip (<title> tag inside each node) with the full label.
- Below the diagram, add a small legend showing the color codes.

For database ER diagrams:
- Show table names in bold, list key fields inside the box (PK, FKs, important columns).
- Draw FK edges with a label showing the column name.
`,

  annotated_flowchart: `
## Rendering guidance for: annotated_flowchart
Goal: show a step-by-step process so a reader can trace the path from start to finish.

Draw an SVG top-to-bottom flowchart:
- Each step: a rounded rectangle with the step label inside
- Decision points (if any): diamond shape
- Arrows: with arrowhead markers, labeled on branches (success/error/timeout)
- Error/failure paths: use a red/orange stroke to visually distinguish from happy path
- Below each step box, optionally show a small description (use <foreignObject> for HTML text
  or keep it as SVG <text> with tspan for wrapping)
- Space steps generously (80-100px vertical gap)
- Make the diagram at least 500px wide, set viewBox for responsiveness

Below the SVG, add a numbered list of steps with their full descriptions for readers
who prefer text over the diagram.
`,

  concept_explainer: `
## Rendering guidance for: concept_explainer
Goal: define new terms and make comparisons scannable.

Structure:
1. TL;DR — one-sentence framing of the concept space
2. Term cards — a grid of definition cards (2 columns on wide screens, 1 on narrow)
   Each card: term in bold, definition as readable prose, optional example in monospace
3. Comparison table (if relevant) — a proper <table> with sticky first column
   Use alternating row colors for readability

Styling:
- Term cards: card background, border, 6px radius, 1rem padding
- Term label: font-weight: 600, color: var(--heg-accent)
- Table: border-collapse: collapse, cell padding 0.5rem 0.75rem, border: 1px solid var(--heg-border)
- Alternate rows: nth-child(even) gets var(--heg-accent-bg) background
`,

  annotated_diff: `
## Rendering guidance for: annotated_diff
Goal: guide the reviewer to the most important hunks and flag risks.

Structure: one card per file, stacked vertically.

Each card:
- Header: filename in monospace + badge showing +additions/-deletions
- Summary: 1-2 sentence description of what changed in this file
- Annotation list: each note has a severity badge + text
  - risk: red badge (#dc2626), prepend ⚠ Risk
  - warn: amber badge (#d97706), prepend ⚡ Watch
  - info: slate badge (#6b7280), prepend ℹ Note

Styling:
- Card: border, card background, 6px radius, 0.85rem 1rem padding, margin-bottom 0.75rem
- Filename: font-family monospace, font-weight 600
- Severity badge: display: inline-block, border-radius: 4px, padding: 2px 6px,
  font-size: 0.7rem, font-weight: 600, text-transform: uppercase,
  color: white, background: <color per severity>
- Annotation text: margin-left 0.5rem, display: inline
`,

  side_by_side: `
## Rendering guidance for: side_by_side
Goal: make the tradeoff between two or more options immediately clear.

Structure:
1. Question header — bold question framing the choice
2. Option cards in a flex row (wraps on narrow screens)
   Each card: option label (bold), summary paragraph, pros list (✓ in green), cons list (✗ in red)
3. (Optional) Recommendation callout if one option is preferred

Styling:
- Cards: equal-width flex children, border, card background, 6px radius
- Recommended card: accent border-color, accent-bg background
- Pro items: color: #16a34a (green), list-style: none, ::before content "✓ "
- Con items: color: #dc2626 (red), list-style: none, ::before content "✗ "
`,

  timeline: `
## Rendering guidance for: timeline
Goal: show how something unfolds over time or across phases.

Draw a vertical timeline:
- Left side: a vertical line (2px, var(--heg-border))
- Each event: a dot on the line + a card to the right with the event title, date/phase, and description
- Use color to distinguish event types (milestone, risk, decision, etc.)
- If there are phases, use a wider background band to group events in each phase

Alternatively for a phased roadmap: horizontal swimlane grid with phases as columns
and workstreams as rows.
`,

  status_report: `
## Rendering guidance for: status_report
Goal: give a quick at-a-glance health check.

Structure:
1. Top-level status badge (green/yellow/red) with a one-line summary
2. Key metrics row — 3-4 stat boxes showing numbers with labels
3. Details section — bullet lists or small tables for each area

Styling:
- Stat boxes: card background, centered text, large number (1.8rem, font-weight 700),
  small label beneath
- Status badge: colored chip with icon (✓ / ⚠ / ✗)
`,
};

function buildSystemPrompt(type: ArtifactType): string {
  const typeGuide = TYPE_GUIDANCE[type] ?? TYPE_GUIDANCE.feature_explainer;

  return `You are the HTML renderer for HEG (HTML Explainer Generator).
Your job is to render a single section of a PR explainer document as rich, beautiful HTML.

## Your output
- Return ONLY the inner HTML for this section — a fragment, not a full page.
- Do NOT include <!doctype>, <html>, <head>, or <body> tags.
- You MAY include <style> tags for section-specific CSS.
- You MAY include <script> tags for section-specific interactivity.
- All CSS must be inline or in a <style> block. No external stylesheets.
- All JS must be inline in a <script> block. No external libraries.

## Core principles (from the HTML Effectiveness guide)
- HTML can convey what markdown cannot: spatial relationships, color, diagrams, interaction.
- Use the medium fully. A flowchart should be a real flowchart. A topology should be a real diagram.
- Optimize for a developer reading this section exactly once — make it immediately clear.
- Information density matters: prefer compact visual layouts over long prose.
- Make it beautiful but functional — clean typography, good spacing, meaningful color.

${DESIGN_SYSTEM}

${typeGuide}

## Common mistakes to avoid
- Don't return markdown or prose — return HTML.
- Don't use placeholder text like "insert diagram here" — generate the actual content.
- Don't use external CDN links — everything must be self-contained.
- Don't hardcode hex colors — use the CSS variables so dark mode works.
- Don't make SVGs too small — use viewBox and width: 100% for responsiveness.`;
}
