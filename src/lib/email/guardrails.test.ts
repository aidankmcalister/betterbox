import { describe, expect, test } from "bun:test";

import { checkGuardrails, isExternalRecipient } from "@/lib/email/guardrails";

const base = {
  subject: "Hello",
  bodyText: "Just saying hi.",
  to: "a@gmail.com",
  fromEmail: "me@gmail.com",
  attachmentCount: 0,
};

const ids = (input: Parameters<typeof checkGuardrails>[0]) =>
  checkGuardrails(input).map((g) => g.id);

describe("checkGuardrails", () => {
  test("a clean message trips nothing", () => {
    expect(checkGuardrails(base)).toEqual([]);
  });

  test("flags an empty subject", () => {
    expect(ids({ ...base, subject: "   " })).toContain("no-subject");
  });

  test("flags 'attached' with no attachment, clears once attached", () => {
    expect(ids({ ...base, bodyText: "See the attached file." })).toContain(
      "missing-attachment",
    );
    expect(
      ids({
        ...base,
        bodyText: "See the attached file.",
        attachmentCount: 1,
      }),
    ).not.toContain("missing-attachment");
  });

  test("external-domain only fires for a non-free sender domain", () => {
    // Free sender (gmail) → never external.
    expect(
      ids({ ...base, to: "client@acme.com", fromEmail: "me@gmail.com" }),
    ).not.toContain("external-domain");
    // Work sender → recipients outside the domain flag.
    expect(
      ids({ ...base, to: "client@acme.com", fromEmail: "me@corp.io" }),
    ).toContain("external-domain");
    // Same-domain recipient is fine.
    expect(
      ids({ ...base, to: "teammate@corp.io", fromEmail: "me@corp.io" }),
    ).not.toContain("external-domain");
  });

  test("flags a large recipient count", () => {
    const to = Array.from({ length: 9 }, (_, i) => `p${i}@gmail.com`).join(
      ", ",
    );
    expect(ids({ ...base, to })).toContain("many-recipients");
    expect(ids({ ...base, to, manyRecipientsAt: 20 })).not.toContain(
      "many-recipients",
    );
  });

  test("counts recipients across to/cc/bcc", () => {
    const got = checkGuardrails({
      ...base,
      to: "a@x.com, b@x.com",
      cc: "c@x.com",
      bcc: "d@x.com, e@x.com",
      manyRecipientsAt: 5,
    });
    expect(got.map((g) => g.id)).toContain("many-recipients");
  });
});

describe("isExternalRecipient", () => {
  test("free sender domain never flags", () => {
    expect(isExternalRecipient("x@acme.com", "me@gmail.com")).toBe(false);
  });
  test("work sender flags other domains, not its own", () => {
    expect(isExternalRecipient("x@acme.com", "me@corp.io")).toBe(true);
    expect(isExternalRecipient("y@corp.io", "me@corp.io")).toBe(false);
  });
});
