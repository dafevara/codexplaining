import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { ingestPR } from "./ingest/github.js";
import { makeProvider, type ProviderName } from "./llm/index.js";
import { plan } from "./planner.js";
import { renderSection } from "./artifacts/index.js";
import { assemble } from "./assemble.js";

export interface RunOptions {
  input: string;
  outputDir: string;
  name?: string;
  provider: ProviderName;
}

export async function run(opts: RunOptions): Promise<string> {
  const bundle = await ingestPR(opts.input);
  const provider = makeProvider(opts.provider);

  // Plan: decompose PR into sections (single LLM call).
  const doc = await plan(bundle, provider);

  // Render: each section generates its own HTML (parallel LLM calls).
  const renderedHtmls = await Promise.all(
    doc.artifacts.map((spec) => renderSection(spec, provider)),
  );

  const sections = doc.artifacts.map((spec, i) => ({
    title: spec.title,
    html: renderedHtmls[i] ?? "",
  }));

  const html = assemble({
    title: doc.title,
    summary: doc.summary,
    ref: doc.ref,
    sections,
  });

  await mkdir(opts.outputDir, { recursive: true });
  const filename = (opts.name ?? defaultName(bundle.ref)) + ".html";
  const outPath = path.join(opts.outputDir, filename);
  await writeFile(outPath, html, "utf8");
  return outPath;
}

function defaultName(ref: { owner: string; repo: string; number: number }): string {
  return `${ref.owner}-${ref.repo}-pr-${ref.number}`;
}
