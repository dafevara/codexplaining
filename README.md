# codexplaining

Turn a GitHub pull request into a **self-contained HTML explainer** — a single shareable file with real diagrams, flowcharts, comparison tables, and annotated diffs instead of flat markdown.

## Why

Markdown is flat. A service topology is spatial. A request lifecycle is a flowchart. A tradeoff is a side-by-side. `codexplaining` reads a PR and picks the right visualization for each part of it, then assembles everything into one `.html` file you can open in any browser or drop on S3 to share.

## How it works

```
PR (id or URL)
    │
    ▼
┌──────────────────┐
│  Ingest          │  PR body + diff + files + commits + comments + linked issues
└──────────────────┘  (via the gh CLI)
    │
    ▼
┌──────────────────┐
│  Plan            │  LLM decomposes the PR into sections;
└──────────────────┘  picks the best artifact type for each
    │
    ▼  (parallel)
┌──────────────────┐
│  Render          │  One LLM call per section → rich HTML fragment
└──────────────────┘  (SVG diagrams, tables, collapsible steps, etc.)
    │
    ▼
┌──────────────────┐
│  Assemble        │  Stitches fragments into one self-contained .html
└──────────────────┘  (all CSS and JS inlined — no external dependencies)
```

Sections the planner can pick from:

| Type | Renders as | Best for |
|---|---|---|
| `feature_explainer` | TL;DR + collapsible steps + tabbed code | Overview, feature walkthroughs |
| `module_map` | SVG box-and-arrow diagram | Service topology, ER diagrams, module deps |
| `annotated_flowchart` | SVG top-down flowchart | Request lifecycle, business logic, workflows |
| `concept_explainer` | Definition cards + comparison table | New domain terms, endpoint comparisons |
| `annotated_diff` | File cards with severity badges | Risky or pivotal code hunks |
| `side_by_side` | Two-column pros/cons cards | Architectural tradeoffs |
| `timeline` | Vertical event timeline | Phased rollouts, migration plans |
| `status_report` | Stat boxes + status badge | PRs with metrics or health summaries |

## Prerequisites

- **Node.js** ≥ 20
- **[gh CLI](https://cli.github.com)** — authenticated (`gh auth login`). Required for ingestion; handles both private (authed) and public repos.
- An **Anthropic** or **OpenAI** API key.

## Installation

```bash
git clone <this-repo>
cd codexplaining
npm install
```

For development (runs directly via `tsx`):

```bash
npm run dev -- -i <pr> -o <output-dir>
```

To install globally after building:

```bash
npm run build
npm install -g .
```

## Setup

Copy the example env file and fill in your API key:

```bash
cp .env.example .env
```

```env
# .env
ANTHROPIC_API_KEY=your-key-here
# or
OPENAI_API_KEY=your-key-here
```

## Usage

```
codexplaining -i <id-or-url> -o <output-dir> [options]
```

### Options

| Flag | Description |
|---|---|
| `-i, --input <id-or-url>` | PR id (`owner/repo#N`) or full GitHub URL |
| `-o, --output <dir>` | Directory to write the `.html` file into |
| `-n, --name <name>` | Output filename without `.html` (default: `owner-repo-pr-N`) |
| `--provider <name>` | LLM provider: `anthropic` (default) or `openai` |

### Examples

```bash
# Public PR by URL
codexplaining -i https://github.com/vercel/next.js/pull/12345 -o ./out

# Private PR by id (uses gh CLI auth)
codexplaining -i myorg/myrepo#42 -o ./out

# Custom filename and OpenAI provider
codexplaining -i myorg/myrepo#42 -o ./out -n widgets-api --provider openai
```

The command prints the output path on success:

```
./out/myorg-myrepo-pr-42.html
```

Open it in any browser. Upload it to S3 for a shareable link.

## Configuration

All secrets and optional overrides live in `.env`:

```env
ANTHROPIC_API_KEY=        # required for --provider anthropic
OPENAI_API_KEY=           # required for --provider openai

HEG_ANTHROPIC_MODEL=      # optional, default: claude-opus-4-7
HEG_OPENAI_MODEL=         # optional, default: gpt-4o
```

## Project structure

```
src/
├── cli.ts                     # Arg parsing only — no business logic
├── types.ts                   # Shared types (PRBundle, ArtifactSpec, …)
└── core/
    ├── pipeline.ts            # Orchestrates ingest → plan → render → assemble
    ├── ingest/
    │   └── github.ts          # gh CLI wrapper → PRBundle
    ├── llm/
    │   ├── index.ts           # Provider interface + factory
    │   ├── anthropic.ts       # Anthropic implementation
    │   └── openai.ts          # OpenAI implementation
    ├── planner.ts             # PRBundle → ArtifactSpec[] (one LLM call)
    ├── artifacts/
    │   ├── index.ts           # Exports renderSection + artifact catalog
    │   └── section_renderer.ts # Per-section LLM call → HTML fragment
    └── assemble.ts            # Fragments → single self-contained HTML
```

The CLI is a thin wrapper. Adding an HTTP/REST interface means importing `core/pipeline.ts` — the business logic doesn't move.

## Adding a new artifact type

1. Add the type name to `ArtifactType` in `src/types.ts`.
2. Add it to `ARTIFACT_TYPES` in `src/core/artifacts/index.ts`.
3. Add rendering guidance to `TYPE_GUIDANCE` in `src/core/artifacts/section_renderer.ts` — describe what to draw, what HTML/SVG patterns to use, and what makes a good output.
4. Add selection guidance to the planner's system prompt in `src/core/planner.ts`.

No deterministic code to write — the LLM renders each section from your guidance.
