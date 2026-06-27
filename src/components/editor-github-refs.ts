import { Extension, InputRule, markPasteRule } from "@tiptap/core";
import type { MarkType } from "@tiptap/pm/model";

/**
 * Auto-link fully-qualified GitHub references (Composer Phase 1 — BOX-21).
 *
 * `owner/repo#123` → issue/PR, `owner/repo@<sha>` → commit. Bare `#123` and bare
 * SHAs are ambiguous without a repo context, so we only linkify the qualified
 * forms. They resolve to ordinary `<a>` tags → fully email-safe.
 *
 * Works on live typing (the rule fires on the boundary space after the ref) and
 * on paste (copying a ref out of GitHub).
 */
// Bounded segments (GitHub caps names at 39/100) so the per-keystroke input rule
// can't backtrack quadratically over a long token.
const REPO = "[A-Za-z0-9][\\w.-]{0,99}\\/[A-Za-z0-9][\\w.-]{0,99}";
const ISSUE_SRC = `(${REPO})#(\\d+)`;
const COMMIT_SRC = `(${REPO})@([0-9a-f]{7,40})`;

const issueHref = (m: RegExpMatchArray) =>
  `https://github.com/${m[1]}/issues/${m[2]}`;
const commitHref = (m: RegExpMatchArray) =>
  `https://github.com/${m[1]}/commit/${m[2]}`;

/** Link the ref in place (leaving the trailing boundary char untouched). */
function refInputRule(
  src: string,
  hrefFor: (m: RegExpMatchArray) => string,
  type: MarkType,
) {
  return new InputRule({
    find: new RegExp(`${src}(\\s)$`),
    handler: ({ state, range, match }) => {
      const boundary = match[match.length - 1]?.length ?? 0;
      state.tr.addMark(
        range.from,
        range.to - boundary,
        type.create({
          href: hrefFor(match),
          target: "_blank",
          rel: "noopener noreferrer",
        }),
      );
    },
  });
}

export const GithubRefs = Extension.create({
  name: "githubRefs",

  addInputRules() {
    const link = this.editor.schema.marks.link as MarkType | undefined;
    if (!link) return [];
    return [
      refInputRule(ISSUE_SRC, issueHref, link),
      refInputRule(COMMIT_SRC, commitHref, link),
    ];
  },

  addPasteRules() {
    const link = this.editor.schema.marks.link as MarkType | undefined;
    if (!link) return [];
    // markPasteRule's MarkType comes from @tiptap/core — the same runtime
    // object, only the cross-package TS declarations differ.
    return [
      markPasteRule({
        find: new RegExp(ISSUE_SRC, "g"),
        type: link as never,
        getAttributes: (m) => ({ href: issueHref(m) }),
      }),
      markPasteRule({
        find: new RegExp(COMMIT_SRC, "g"),
        type: link as never,
        getAttributes: (m) => ({ href: commitHref(m) }),
      }),
    ];
  },
});
