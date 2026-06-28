import { describe, expect, test } from "bun:test";

import { sanitizePastedHtml } from "@/lib/email/sanitize-paste";

describe("sanitizePastedHtml", () => {
  test("passes clean HTML through (modulo trim)", () => {
    expect(sanitizePastedHtml("<p>hello <b>world</b></p>")).toBe(
      "<p>hello <b>world</b></p>",
    );
    expect(sanitizePastedHtml("")).toBe("");
  });

  test("removes <o:p> and other Office-namespace tags", () => {
    const out = sanitizePastedHtml("<p>hi<o:p></o:p></p><w:sdt>x</w:sdt>");
    expect(out).not.toContain("o:p");
    expect(out).not.toContain("w:sdt");
    expect(out).toContain("hi");
  });

  test("strips mso- declarations but keeps schema-meaningful styles", () => {
    const out = sanitizePastedHtml(
      '<span style="mso-fareast-font-family:Calibri;font-weight:700;color:#f00">x</span>',
    );
    expect(out).not.toContain("mso-");
    expect(out).toContain("font-weight:700");
    expect(out).toContain("color:#f00");
  });

  test("drops a style attribute that was only mso- junk", () => {
    const out = sanitizePastedHtml(
      '<p style="mso-pagination:widow-orphan">x</p>',
    );
    expect(out).toBe("<p>x</p>");
  });

  test("removes MsoNormal-style classes and lang attributes", () => {
    const out = sanitizePastedHtml(
      '<p class="MsoNormal" lang="EN-US">body</p>',
    );
    expect(out).toBe("<p>body</p>");
  });

  test("strips <style>/<script>/<xml> blocks with their content", () => {
    const out = sanitizePastedHtml(
      "<style>.MsoNormal{color:red}</style><p>keep</p><xml><o:p/></xml>",
    );
    expect(out).toBe("<p>keep</p>");
  });

  test("removes <meta>/<link> void tags", () => {
    const out = sanitizePastedHtml(
      '<meta charset="utf-8"><link rel="x"><p>keep</p>',
    );
    expect(out).toBe("<p>keep</p>");
  });

  test("removes MS conditional comments", () => {
    const out = sanitizePastedHtml(
      "<p>a</p><!--[if gte mso 9]><xml><o:OfficeDocumentSettings/></xml><![endif]--><p>b</p>",
    );
    expect(out).toContain("<p>a</p>");
    expect(out).toContain("<p>b</p>");
    expect(out).not.toContain("mso");
    expect(out).not.toContain("OfficeDocumentSettings");
  });

  test("keeps links and lists intact", () => {
    const html =
      '<ul><li>one</li><li>two</li></ul><a href="https://x.io">link</a>';
    expect(sanitizePastedHtml(html)).toBe(html);
  });

  test("cleans a realistic Word paste down to its content + bold", () => {
    const word =
      "<!--[if gte mso 9]><xml><w:WordDocument/></xml><![endif]-->" +
      '<p class="MsoNormal" style="mso-margin-top-alt:auto;margin:0">' +
      'Shipped <b style="mso-bidi-font-weight:normal">the fix</b>' +
      "<o:p></o:p></p>";
    const out = sanitizePastedHtml(word);
    expect(out).not.toContain("mso");
    expect(out).not.toContain("MsoNormal");
    expect(out).not.toContain("o:p");
    expect(out).toContain("Shipped ");
    expect(out).toContain("<b>the fix</b>");
  });
});
