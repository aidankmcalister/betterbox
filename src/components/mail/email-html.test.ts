import { describe, expect, test } from "bun:test";
import {
  formatBytes,
  htmlToPlainText,
  parseAddress,
  splitAddresses,
} from "@/components/mail/email-html";

describe("parseAddress", () => {
  test("name and address from a display-name header", () => {
    expect(parseAddress("Alice <a@x.com>")).toEqual({
      name: "Alice",
      address: "a@x.com",
    });
  });

  test("quoted display name", () => {
    expect(parseAddress('"Bob Smith" <bob@x.com>')).toEqual({
      name: "Bob Smith",
      address: "bob@x.com",
    });
  });

  test("bare address falls back to address for both", () => {
    expect(parseAddress("a@x.com")).toEqual({
      name: "a@x.com",
      address: "a@x.com",
    });
  });
});

describe("splitAddresses", () => {
  test("empty list", () => {
    expect(splitAddresses("")).toEqual([]);
  });

  test("comma-separated list (display name segments resolve to the address)", () => {
    expect(splitAddresses("a@x.com,Bob <b@x.com>")).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  test("comma inside a quoted display name is not a separator", () => {
    expect(splitAddresses('"Smith, Bob" <b@x.com>,c@x.com')).toEqual([
      "b@x.com",
      "c@x.com",
    ]);
  });
});

describe("htmlToPlainText", () => {
  test("strips tags", () => {
    expect(htmlToPlainText("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  test("br and block tags become newlines", () => {
    expect(htmlToPlainText("a<br>b")).toBe("a\nb");
  });

  test("decodes basic entities", () => {
    expect(htmlToPlainText("a &amp; b &lt;c&gt;")).toBe("a & b <c>");
  });
});

describe("formatBytes", () => {
  test("zero is empty", () => {
    expect(formatBytes(0)).toBe("");
  });

  test("bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  test("kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
  });

  test("megabytes", () => {
    expect(formatBytes(1024 * 1024 * 2)).toBe("2.0 MB");
  });
});
