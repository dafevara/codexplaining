#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { run } from "./core/pipeline.js";

const program = new Command();

program
  .name("heg")
  .description("HTML Explainer Generator — turn a GitHub PR into a self-contained HTML explainer.")
  .version("0.1.0")
  .requiredOption("-i, --input <id-or-url>", "PR id (owner/repo#N) or URL")
  .requiredOption("-o, --output <dir>", "output directory")
  .option("-n, --name <name>", "output filename (without .html)")
  .option("--provider <name>", "LLM provider: anthropic | openai", "anthropic")
  .action(async (opts) => {
    try {
      const outPath = await run({
        input: opts.input,
        outputDir: opts.output,
        name: opts.name,
        provider: opts.provider,
      });
      console.log(outPath);
    } catch (err) {
      console.error("heg: " + (err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
