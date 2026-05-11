import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LinkedIssue, PRBundle, PRCommit, PRFile, PRRef } from "../../types.js";

const execFileP = promisify(execFile);

// Accepts either:
//   - "owner/repo#123"
//   - "owner/repo/pull/123"
//   - "https://github.com/owner/repo/pull/123"
export function parsePRRef(input: string): PRRef {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (urlMatch) {
    const [, owner, repo, num] = urlMatch as unknown as [string, string, string, string];
    return { owner, repo, number: Number(num), url: trimmed };
  }
  const hashMatch = trimmed.match(/^([^/]+)\/([^/#]+)#(\d+)$/);
  if (hashMatch) {
    const [, owner, repo, num] = hashMatch as unknown as [string, string, string, string];
    return {
      owner,
      repo,
      number: Number(num),
      url: `https://github.com/${owner}/${repo}/pull/${num}`,
    };
  }
  const slashMatch = trimmed.match(/^([^/]+)\/([^/]+)\/pull\/(\d+)$/);
  if (slashMatch) {
    const [, owner, repo, num] = slashMatch as unknown as [string, string, string, string];
    return {
      owner,
      repo,
      number: Number(num),
      url: `https://github.com/${owner}/${repo}/pull/${num}`,
    };
  }
  throw new Error(
    `unrecognized PR input: ${input}\n` +
      `expected forms: owner/repo#N, owner/repo/pull/N, or https://github.com/owner/repo/pull/N`,
  );
}

async function gh(args: string[]): Promise<string> {
  const { stdout } = await execFileP("gh", args, { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

interface GhPRView {
  title: string;
  body: string;
  author: { login: string };
  baseRefName: string;
  headRefName: string;
  commits: { oid: string; messageHeadline: string; messageBody: string; authors: { login: string }[] }[];
  files: { path: string; additions: number; deletions: number }[];
  comments: { author: { login: string }; body: string; createdAt: string }[];
}

interface GhIssueView {
  number: number;
  title: string;
  body: string;
  comments: { author: { login: string }; body: string; createdAt: string }[];
}

export async function ingestPR(input: string): Promise<PRBundle> {
  const ref = parsePRRef(input);
  const repoFlag = `${ref.owner}/${ref.repo}`;

  const viewJson = await gh([
    "pr",
    "view",
    String(ref.number),
    "--repo",
    repoFlag,
    "--json",
    "title,body,author,baseRefName,headRefName,commits,files,comments",
  ]);
  const view = JSON.parse(viewJson) as GhPRView;

  const diff = await gh(["pr", "diff", String(ref.number), "--repo", repoFlag]);

  const files: PRFile[] = view.files.map((f) => ({
    path: f.path,
    status: inferStatus(diff, f.path),
    additions: f.additions,
    deletions: f.deletions,
    patch: extractPatch(diff, f.path),
  }));

  const commits: PRCommit[] = view.commits.map((c) => ({
    sha: c.oid,
    message: [c.messageHeadline, c.messageBody].filter(Boolean).join("\n\n"),
    author: c.authors[0]?.login ?? "unknown",
  }));

  const linkedIssues = await fetchLinkedIssues(repoFlag, view.body);

  return {
    ref,
    title: view.title,
    body: view.body,
    author: view.author?.login ?? "unknown",
    baseBranch: view.baseRefName,
    headBranch: view.headRefName,
    files,
    diff,
    commits,
    comments: view.comments.map((c) => ({
      author: c.author?.login ?? "unknown",
      body: c.body,
      createdAt: c.createdAt,
    })),
    linkedIssues,
  };
}

// Closing-keyword pattern per GitHub: closes/fixes/resolves #N
const ISSUE_REF_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;

async function fetchLinkedIssues(repoFlag: string, body: string): Promise<LinkedIssue[]> {
  const seen = new Set<number>();
  const nums: number[] = [];
  for (const m of body.matchAll(ISSUE_REF_RE)) {
    const n = Number(m[1]);
    if (!seen.has(n)) {
      seen.add(n);
      nums.push(n);
    }
  }

  const issues: LinkedIssue[] = [];
  for (const n of nums) {
    try {
      const json = await gh([
        "issue",
        "view",
        String(n),
        "--repo",
        repoFlag,
        "--json",
        "number,title,body,comments",
      ]);
      const v = JSON.parse(json) as GhIssueView;
      issues.push({
        number: v.number,
        title: v.title,
        body: v.body,
        comments: v.comments.map((c) => ({
          author: c.author?.login ?? "unknown",
          body: c.body,
          createdAt: c.createdAt,
        })),
      });
    } catch {
      // Issue might not exist or be inaccessible — skip silently.
    }
  }
  return issues;
}

function extractPatch(fullDiff: string, filePath: string): string | undefined {
  // Splits the unified diff and returns the hunk for `filePath`, if present.
  const marker = `diff --git a/${filePath} b/${filePath}`;
  const idx = fullDiff.indexOf(marker);
  if (idx === -1) return undefined;
  const next = fullDiff.indexOf("\ndiff --git ", idx + 1);
  return next === -1 ? fullDiff.slice(idx) : fullDiff.slice(idx, next);
}

function inferStatus(fullDiff: string, filePath: string): PRFile["status"] {
  const patch = extractPatch(fullDiff, filePath) ?? "";
  if (/^new file mode/m.test(patch)) return "added";
  if (/^deleted file mode/m.test(patch)) return "removed";
  if (/^rename from /m.test(patch)) return "renamed";
  return "modified";
}
