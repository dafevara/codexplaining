// Shared types across HEG. Kept in one file at v1; split if it grows.

export interface PRRef {
  owner: string;
  repo: string;
  number: number;
  url: string;
}

export interface PRComment {
  author: string;
  body: string;
  createdAt: string;
}

export interface LinkedIssue {
  number: number;
  title: string;
  body: string;
  comments: PRComment[];
}

export interface PRCommit {
  sha: string;
  message: string;
  author: string;
}

export interface PRFile {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  patch?: string;
}

export interface PRBundle {
  ref: PRRef;
  title: string;
  body: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  files: PRFile[];
  diff: string;
  commits: PRCommit[];
  comments: PRComment[];
  linkedIssues: LinkedIssue[];
}

// --- Artifact catalog -----------------------------------------------------
// Names match the html-effectiveness reference. Extend this union + add
// type-specific rendering guidance in core/artifacts/section_renderer.ts.

export type ArtifactType =
  | "feature_explainer"
  | "concept_explainer"
  | "annotated_flowchart"
  | "module_map"
  | "annotated_diff"
  | "side_by_side"
  | "timeline"
  | "status_report";

// ArtifactSpec is now lightweight — the planner extracts the relevant
// PR content per section so the renderer doesn't need the full bundle.
export interface ArtifactSpec {
  type: ArtifactType;
  title: string;
  // What the section renderer should visualize (its goal/instruction).
  description: string;
  // Curated PR content relevant to this section — the planner's job is
  // to extract only what's needed so renderer calls stay focused.
  context: string;
}

export interface ExplainerDoc {
  ref: PRRef;
  title: string;
  summary: string;
  artifacts: ArtifactSpec[];
}
