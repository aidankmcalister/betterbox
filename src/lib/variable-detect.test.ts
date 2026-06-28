import { describe, expect, test } from "bun:test";
import { suggestVariable, slugifyField } from "@/lib/variable-detect";

describe("suggestVariable", () => {
  test("dates", () => {
    for (const t of [
      "Thursday, July 3",
      "July 3",
      "7/3",
      "7/3/2025",
      "next Tuesday",
      "tomorrow",
    ]) {
      expect(suggestVariable(t).kind).toBe("date");
    }
  });

  test("emails (email wins over a month-like local part)", () => {
    expect(suggestVariable("aidan@gmail.com").kind).toBe("email");
    expect(suggestVariable("may@example.com").kind).toBe("email");
  });

  test("names", () => {
    expect(suggestVariable("Aidan").kind).toBe("first_name");
    expect(suggestVariable("Aidan McAlister").kind).toBe("name");
    expect(suggestVariable("O’Brien").kind).toBe("first_name");
  });

  test("fallback to a custom fill-in with a slug", () => {
    const s = suggestVariable("the new dashboard");
    expect(s.kind).toBe("custom");
    expect(s.slug).toBe("the_new_dashboard");
  });

  test("slugifyField trims, lowercases, caps to a few words", () => {
    expect(slugifyField("  The New Dashboard!  ")).toBe("the_new_dashboard");
    expect(slugifyField("...")).toBe("field");
  });
});
