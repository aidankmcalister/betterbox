import { useRef, useState } from "react";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Contact } from "@/lib/mail-queries";

export const shortName = (email: string) => email.split("@")[0] || email;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Shared chrome for To/Cc/Bcc rows (Cc/Bcc prepend `group` for hover-to-reveal remove).
export const RECIPIENT_ROW =
  "flex min-h-10 items-center gap-2.5 border-b px-4 py-1.5";

/** True when `value` is one or more comma-separated, well-formed addresses. */
export function isValidRecipients(value: string): boolean {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => EMAIL_RE.test(part));
}

/** Split a To: entry into display name + bare email ("Maya Chen <maya@x>" → name/email). */
export function parseToEntry(entry: string): { name: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(entry);
  if (m) {
    return {
      name: m[1].replace(/^["']|["']$/g, "").trim(),
      email: m[2].trim(),
    };
  }
  return { name: "", email: entry.trim() };
}

// Bare role addresses don't name a person — never guess "Hi Support,".
const ROLE_LOCALS = new Set([
  "support",
  "info",
  "noreply",
  "no-reply",
  "hello",
  "team",
  "contact",
  "admin",
  "sales",
  "help",
  "hi",
  "billing",
  "careers",
  "jobs",
  "press",
  "security",
  "notifications",
  "donotreply",
  "do-not-reply",
  "mailer",
]);

/** Guess a name from an email's local part (maya@x → "Maya", first.last@x → "First Last").
 *  Empty unless the address looks complete and isn't a role box. */
export function nameFromEmail(email: string): string {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "";
  const local = email.split("@")[0] ?? "";
  if (ROLE_LOCALS.has(local.toLowerCase())) return "";
  return local
    .split(/[._+-]+/)
    .map((part) => part.replace(/[^a-zA-Z].*$/, "")) // drop trailing digits/junk
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function FieldLabel({
  children,
  invalid,
}: {
  children: string;
  invalid?: boolean;
}) {
  return (
    <span
      className={cn(
        "w-11 shrink-0 text-[12.5px]",
        invalid ? "text-label-red" : "text-muted-foreground/70",
      )}
    >
      {children}
    </span>
  );
}

/** Validation pill in the footer (never shifts the body). Yellow = soft warning you can send past; red = hard blocker / send error. */
/** To field with Gmail-style chips + autocomplete. Committed recipients render as bordered pills (echoing
 *  the From box); the trailing token stays editable. Value stays a comma-separated string so send/save/validation are unchanged. */
export function RecipientField({
  value,
  onChange,
  contacts,
}: {
  value: string;
  onChange: (value: string) => void;
  contacts: Contact[];
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Everything before the last comma is committed (chips); the rest is the token being typed. A comma promotes a chip.
  const parts = value.split(",");
  const draft = (parts[parts.length - 1] ?? "").replace(/^\s+/, "");
  const chips = parts
    .slice(0, -1)
    .map((part) => part.trim())
    .filter(Boolean);

  const commit = (nextChips: string[], nextDraft: string) => {
    const head = nextChips.length ? `${nextChips.join(", ")}, ` : "";
    onChange(head + nextDraft);
  };
  const commitDraft = () => {
    const trimmed = draft.trim();
    if (trimmed) commit([...chips, trimmed], "");
  };

  const token = draft.trim().toLowerCase();
  const chosen = new Set(chips.map((c) => c.toLowerCase()));
  const matches =
    token.length === 0
      ? []
      : contacts
          .filter(
            (c) =>
              !chosen.has(c.email.toLowerCase()) &&
              (c.email.toLowerCase().includes(token) ||
                c.name.toLowerCase().includes(token)),
          )
          .slice(0, 6);
  const show = open && matches.length > 0;

  const choose = (contact: Contact) => {
    commit([...chips, contact.email], "");
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      {chips.map((chip, i) => {
        const valid = EMAIL_RE.test(chip);
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: recipients can repeat, so the index disambiguates duplicate addresses.
            key={`${chip}-${i}`}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-[7px] border bg-card py-0.5 pr-1 pl-2",
              !valid && "border-label-red/40 text-label-red",
            )}
          >
            <span className="truncate font-mono text-[12px]">{chip}</span>
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Remove ${chip}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                commit(
                  chips.filter((_, idx) => idx !== i),
                  draft,
                )
              }
              className="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        );
      })}
      <input
        ref={inputRef}
        // biome-ignore lint/a11y/noAutofocus: focus the To field when the composer opens so you can type a recipient immediately.
        autoFocus
        type="text"
        value={draft}
        onChange={(event) => {
          commit(chips, event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "Backspace" && draft === "" && chips.length) {
            event.preventDefault();
            commit(chips.slice(0, -1), "");
            return;
          }
          if (show) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((a) => Math.min(a + 1, matches.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (
              (event.key === "Enter" || event.key === "Tab") &&
              !event.metaKey &&
              !event.ctrlKey
            ) {
              event.preventDefault();
              event.stopPropagation();
              choose(matches[active]);
            } else if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
            }
          } else if (
            event.key === "Enter" &&
            draft.trim() &&
            !event.metaKey &&
            !event.ctrlKey
          ) {
            event.preventDefault();
            event.stopPropagation();
            commitDraft();
          }
        }}
        placeholder={chips.length ? "" : "name@domain.dev"}
        className={cn(
          "flex-1 bg-transparent font-mono text-[12.5px] outline-none placeholder:text-muted-foreground/60",
          // A wide chip + 120px-min input wraps to a 2nd line and grows the row; once there are chips the
          // input only needs room to keep typing, so it tucks in beside them.
          chips.length ? "min-w-12" : "min-w-[120px]",
        )}
      />
      {show && (
        <div className="absolute top-full left-0 z-50 mt-1.5 w-72 overflow-hidden rounded-lg border bg-popover p-1 shadow-xl ring-1 ring-foreground/10">
          {matches.map((contact, i) => (
            <button
              key={contact.email}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(contact)}
              className={cn(
                "flex w-full flex-col rounded-md px-2 py-1.5 text-left",
                i === active ? "bg-accent text-accent-foreground" : "",
              )}
            >
              {contact.name && (
                <span className="truncate text-[12.5px]">{contact.name}</span>
              )}
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {contact.email}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
