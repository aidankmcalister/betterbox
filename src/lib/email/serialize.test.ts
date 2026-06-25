import { describe, expect, test } from "bun:test";

import {
  escapeHtml,
  safeHref,
  serializeEmailHtml,
  type EmailNode,
} from "@/lib/email/serialize";

/** Wrap inline/block nodes in a doc so we serialize the way the editor emits. */
const doc = (...content: EmailNode[]): EmailNode => ({ type: "doc", content });
const para = (...content: EmailNode[]): EmailNode => ({
  type: "paragraph",
  content,
});
const text = (value: string, marks?: EmailNode["marks"]): EmailNode => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

describe("safeHref", () => {
  test("keeps http(s) and mailto", () => {
    expect(safeHref("https://example.com")).toBe("https://example.com");
    expect(safeHref("http://x.io/a")).toBe("http://x.io/a");
    expect(safeHref("mailto:a@b.com")).toBe("mailto:a@b.com");
  });
  test("promotes a bare domain to https", () => {
    expect(safeHref("github.com/org/repo")).toBe("https://github.com/org/repo");
  });
  test("drops dangerous and empty schemes", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,<script>")).toBeNull();
    expect(safeHref("")).toBeNull();
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref(42)).toBeNull();
  });
});

describe("escapeHtml", () => {
  test("escapes the structural characters", () => {
    expect(escapeHtml('a < b & c > d')).toBe("a &lt; b &amp; c &gt; d");
  });
});

describe("serializeEmailHtml — structure", () => {
  test("wraps content in a base-font table cell", () => {
    const html = serializeEmailHtml(doc(para(text("hi"))));
    expect(html).toStartWith('<table role="presentation"');
    expect(html).toContain("font-family:");
    expect(html).toContain("<p style=\"margin:0 0 16px;\">hi</p>");
  });

  test("an empty paragraph keeps its line with &nbsp;", () => {
    expect(serializeEmailHtml(doc(para()))).toContain(
      '<p style="margin:0 0 16px;">&nbsp;</p>',
    );
  });

  test("escapes HTML in text content", () => {
    const html = serializeEmailHtml(doc(para(text("<script>alert(1)</script>"))));
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("serializeEmailHtml — marks", () => {
  test("bold / italic / strike / inline code", () => {
    const html = serializeEmailHtml(
      doc(
        para(
          text("b", [{ type: "bold" }]),
          text("i", [{ type: "italic" }]),
          text("s", [{ type: "strike" }]),
          text("c", [{ type: "code" }]),
        ),
      ),
    );
    expect(html).toContain('<strong style="font-weight:700;">b</strong>');
    expect(html).toContain("<em>i</em>");
    expect(html).toContain('text-decoration:line-through;">s</span>');
    expect(html).toContain("<code");
  });

  test("link mark renders a safe anchor", () => {
    const html = serializeEmailHtml(
      doc(para(text("here", [{ type: "link", attrs: { href: "example.com" } }]))),
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test("a javascript: link is neutered to a plain span", () => {
    const html = serializeEmailHtml(
      doc(
        para(
          text("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
        ),
      ),
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
    expect(html).toContain("<span>x</span>");
  });

  test("nested marks nest (link wrapping bold)", () => {
    const html = serializeEmailHtml(
      doc(
        para(
          text("x", [
            { type: "link", attrs: { href: "https://a.com" } },
            { type: "bold" },
          ]),
        ),
      ),
    );
    expect(html).toContain('<a href="https://a.com"');
    expect(html).toContain("<strong");
  });
});

describe("serializeEmailHtml — blocks", () => {
  test("headings map to sized, bold paragraphs (1/2/3 + clamp)", () => {
    const h = (level: number) =>
      serializeEmailHtml(
        doc({ type: "heading", attrs: { level }, content: [text("H")] }),
      );
    expect(h(1)).toContain("font-size:24px");
    expect(h(2)).toContain("font-size:20px");
    expect(h(3)).toContain("font-size:16px");
    // Out-of-range level falls back to h2 rather than producing junk.
    expect(h(9)).toContain("font-size:20px");
  });

  test("bullet + ordered lists with tight items (paragraph unwrapped)", () => {
    const list = (type: "bulletList" | "orderedList"): EmailNode => ({
      type,
      content: [{ type: "listItem", content: [para(text("one"))] }],
    });
    const ul = serializeEmailHtml(doc(list("bulletList")));
    expect(ul).toContain("<ul");
    expect(ul).toContain('<li style="margin:0 0 4px;">one</li>');
    // No nested <p> inside the <li> (would add stray vertical gaps in clients).
    expect(ul).not.toContain("<li style=\"margin:0 0 4px;\"><p");
    expect(serializeEmailHtml(doc(list("orderedList")))).toContain("<ol");
  });

  test("blockquote uses a table with a colored left cell, not a div border", () => {
    const html = serializeEmailHtml(
      doc({ type: "blockquote", content: [para(text("quoted"))] }),
    );
    expect(html).toContain("<table");
    expect(html).toContain('width="3"');
    expect(html).toContain("quoted");
    expect(html).not.toContain("border-left");
  });

  test("code block is a bgcolor table with pre-wrap mono text, escaped", () => {
    const html = serializeEmailHtml(
      doc({
        type: "codeBlock",
        content: [text("const x = a < b && c;")],
      }),
    );
    expect(html).toContain('bgcolor="#f6f8fa"');
    expect(html).toContain("white-space:pre-wrap");
    expect(html).toContain("font-family:ui-monospace");
    expect(html).toContain("const x = a &lt; b &amp;&amp; c;");
  });

  test("horizontal rule + hard break", () => {
    expect(serializeEmailHtml(doc({ type: "horizontalRule" }))).toContain(
      "border-top:1px solid",
    );
    expect(
      serializeEmailHtml(doc(para(text("a"), { type: "hardBreak" }, text("b")))),
    ).toContain("a<br>b");
  });

  test("unknown node type degrades to its text, never crashes", () => {
    const html = serializeEmailHtml(
      doc({ type: "callout", content: [para(text("kept"))] }),
    );
    expect(html).toContain("kept");
  });
});

describe("serializeEmailHtml — email-safety invariants", () => {
  // A representative rich document touching every supported node + mark.
  const rich = doc(
    { type: "heading", attrs: { level: 1 }, content: [text("Title")] },
    para(
      text("Hello "),
      text("world", [{ type: "bold" }]),
      text(" — see "),
      text("the PR", [{ type: "link", attrs: { href: "github.com/o/r/pull/1" } }]),
    ),
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [para(text("first"))] },
        { type: "listItem", content: [para(text("second"))] },
      ],
    },
    { type: "blockquote", content: [para(text("a quote"))] },
    { type: "codeBlock", content: [text("npm install")] },
    { type: "horizontalRule" },
  );

  test("emits none of the primitives Outlook can't render", () => {
    const html = serializeEmailHtml(rich);
    for (const banned of [
      "display:flex",
      "display:grid",
      "border-radius",
      "position:absolute",
      "<div",
      "<script",
      "class=",
    ]) {
      expect(html).not.toContain(banned);
    }
  });

  test("layout is table-based with inline styles only", () => {
    const html = serializeEmailHtml(rich);
    expect(html).toContain("<table");
    expect(html).not.toMatch(/<style[\s>]/);
    // Every element that carries styling does so inline.
    expect(html).toContain("style=");
  });
});
