import { auth } from "../auth";

/** Fresh GitHub access token for the signed-in user, or null if no GitHub
 *  account is linked yet. Auto-refreshes when the provider supports it. */
export async function getGithubToken(
  headers: Headers,
  userId: string,
): Promise<string | null> {
  try {
    const { accessToken } = await auth.api.getAccessToken({
      body: { providerId: "github", userId },
      headers,
    });
    return accessToken ?? null;
  } catch {
    // No linked GitHub account (or token unavailable).
    return null;
  }
}

export type PullRequestState = "open" | "draft" | "merged" | "closed";
export type ReviewState = "required" | "approved" | "changes" | "commented";
export type CiState = "passing" | "failing" | "pending" | "none";

export type PullRequest = {
  id: string;
  repo: string;
  num: number;
  title: string;
  branch: string;
  base: string;
  state: PullRequestState;
  review: ReviewState;
  awaitsYou: boolean;
  labels: { name: string; color: string }[];
  comments: number;
  additions: number;
  deletions: number;
  ci: CiState;
  updated: string;
  url: string;
  author: string;
};

const PR_FRAGMENT = `
  fragment pr on PullRequest {
    id
    number
    title
    url
    isDraft
    merged
    state
    updatedAt
    repository { nameWithOwner }
    headRefName
    baseRefName
    additions
    deletions
    comments { totalCount }
    reviewDecision
    author { login }
    labels(first: 6) { nodes { name color } }
    commits(last: 1) {
      nodes { commit { statusCheckRollup { state } } }
    }
  }`;

const QUERY = `
  ${PR_FRAGMENT}
  query {
    viewer { login }
    authored: search(query: "is:pr author:@me sort:updated-desc", type: ISSUE, first: 40) {
      nodes { ...pr }
    }
    reviewing: search(query: "is:pr review-requested:@me is:open sort:updated-desc", type: ISSUE, first: 40) {
      nodes { ...pr }
    }
  }`;

type GqlPr = {
  id: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  merged: boolean;
  state: "OPEN" | "CLOSED" | "MERGED";
  updatedAt: string;
  repository: { nameWithOwner: string };
  headRefName: string;
  baseRefName: string;
  additions: number;
  deletions: number;
  comments: { totalCount: number };
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  author: { login: string } | null;
  labels: { nodes: { name: string; color: string }[] };
  commits: {
    nodes: { commit: { statusCheckRollup: { state: string } | null } }[];
  };
};

function mapState(pr: GqlPr): PullRequestState {
  if (pr.merged) return "merged";
  if (pr.state === "CLOSED") return "closed";
  if (pr.isDraft) return "draft";
  return "open";
}

function mapReview(pr: GqlPr): ReviewState {
  switch (pr.reviewDecision) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes";
    case "REVIEW_REQUIRED":
      return "required";
    default:
      return "commented";
  }
}

function mapCi(pr: GqlPr): CiState {
  const state = pr.commits.nodes[0]?.commit.statusCheckRollup?.state;
  switch (state) {
    case "SUCCESS":
      return "passing";
    case "FAILURE":
    case "ERROR":
      return "failing";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return "none";
  }
}

function toPullRequest(pr: GqlPr, awaitsYou: boolean): PullRequest {
  return {
    id: pr.id,
    repo: pr.repository.nameWithOwner,
    num: pr.number,
    title: pr.title,
    branch: pr.headRefName,
    base: pr.baseRefName,
    state: mapState(pr),
    review: mapReview(pr),
    awaitsYou,
    labels: pr.labels.nodes.map((l) => ({
      name: l.name,
      color: `#${l.color}`,
    })),
    comments: pr.comments.totalCount,
    additions: pr.additions,
    deletions: pr.deletions,
    ci: mapCi(pr),
    updated: pr.updatedAt,
    url: pr.url,
    author: pr.author?.login ?? "unknown",
  };
}

/** Pull requests authored by, or awaiting review from, the linked GitHub user.
 *  Merged/deduped, newest first; `awaitsYou` flags review-requested ones. */
export async function fetchPullRequests(
  accessToken: string,
): Promise<{ login: string; prs: PullRequest[] }> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: QUERY }),
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    data?: {
      viewer: { login: string };
      authored: { nodes: GqlPr[] };
      reviewing: { nodes: GqlPr[] };
    };
    errors?: { message: string }[];
  };
  if (body.errors?.length) throw new Error(body.errors[0].message);
  if (!body.data) throw new Error("GitHub API returned no data");

  const reviewingIds = new Set(body.data.reviewing.nodes.map((p) => p.id));
  const byId = new Map<string, PullRequest>();
  for (const node of [
    ...body.data.authored.nodes,
    ...body.data.reviewing.nodes,
  ]) {
    if (!node?.id || byId.has(node.id)) continue;
    byId.set(node.id, toPullRequest(node, reviewingIds.has(node.id)));
  }
  const prs = [...byId.values()].sort((a, b) =>
    a.updated < b.updated ? 1 : -1,
  );
  return { login: body.data.viewer.login, prs };
}

export type GithubIssue = {
  id: string;
  repo: string;
  num: number;
  title: string;
  state: "open" | "closed";
  /** True when the issue is assigned to you; false when you only opened it. */
  assignedToYou: boolean;
  labels: { name: string; color: string }[];
  comments: number;
  updated: string;
  url: string;
  author: string;
};

const ISSUE_FRAGMENT = `
  fragment issue on Issue {
    id
    number
    title
    url
    state
    updatedAt
    repository { nameWithOwner }
    comments { totalCount }
    author { login }
    labels(first: 6) { nodes { name color } }
  }`;

const ISSUES_QUERY = `
  ${ISSUE_FRAGMENT}
  query {
    viewer { login }
    assigned: search(query: "is:issue is:open assignee:@me sort:updated-desc", type: ISSUE, first: 40) {
      nodes { ...issue }
    }
    created: search(query: "is:issue is:open author:@me sort:updated-desc", type: ISSUE, first: 40) {
      nodes { ...issue }
    }
  }`;

type GqlIssue = {
  id: string;
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED";
  updatedAt: string;
  repository: { nameWithOwner: string };
  comments: { totalCount: number };
  author: { login: string } | null;
  labels: { nodes: { name: string; color: string }[] };
};

function toIssue(issue: GqlIssue, assignedToYou: boolean): GithubIssue {
  return {
    id: issue.id,
    repo: issue.repository.nameWithOwner,
    num: issue.number,
    title: issue.title,
    state: issue.state === "CLOSED" ? "closed" : "open",
    assignedToYou,
    labels: issue.labels.nodes.map((l) => ({
      name: l.name,
      color: `#${l.color}`,
    })),
    comments: issue.comments.totalCount,
    updated: issue.updatedAt,
    url: issue.url,
    author: issue.author?.login ?? "unknown",
  };
}

/** Open issues assigned to, or opened by, the linked GitHub user. Deduped,
 *  newest first; `assignedToYou` flags the assigned ones. */
export async function fetchGithubIssues(
  accessToken: string,
): Promise<{ login: string; issues: GithubIssue[] }> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: ISSUES_QUERY }),
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    data?: {
      viewer: { login: string };
      assigned: { nodes: GqlIssue[] };
      created: { nodes: GqlIssue[] };
    };
    errors?: { message: string }[];
  };
  if (body.errors?.length) throw new Error(body.errors[0].message);
  if (!body.data) throw new Error("GitHub API returned no data");

  const assignedIds = new Set(body.data.assigned.nodes.map((i) => i.id));
  const byId = new Map<string, GithubIssue>();
  for (const node of [
    ...body.data.assigned.nodes,
    ...body.data.created.nodes,
  ]) {
    if (!node?.id || byId.has(node.id)) continue;
    byId.set(node.id, toIssue(node, assignedIds.has(node.id)));
  }
  const issues = [...byId.values()].sort((a, b) =>
    a.updated < b.updated ? 1 : -1,
  );
  return { login: body.data.viewer.login, issues };
}
