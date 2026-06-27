import { describe, expect, test } from "bun:test";
import {
  tokensToFieldHtml,
  tokenNode,
} from "@/components/editor/editor-fill-fields";

describe("snippet token transforms", () => {
  test("tokensToFieldHtml: variables + custom → fill-field, date → date-field, cursor stays text", () => {
    const html = tokensToFieldHtml(
      "<p>Hi {{first_name}}, on {{date}}. {{topic}} {{cursor}}</p>",
    );
    expect(html).toContain('data-fill-field data-label="first_name"');
    expect(html).toContain('data-fill-field data-label="topic"');
    expect(html).toContain("data-date-field");
    expect(html).toContain("{{cursor}}");
  });

  test("tokenNode maps a token to its editor node (cursor stays text)", () => {
    expect(tokenNode("first_name")).toEqual({
      type: "fillField",
      attrs: { label: "first_name" },
    });
    expect(tokenNode("date")).toEqual({
      type: "dateField",
      attrs: { value: "" },
    });
    expect(tokenNode("cursor")).toBe("{{cursor}}");
  });
});
