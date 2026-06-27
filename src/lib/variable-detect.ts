export type SuggestedKind =
  | "first_name"
  | "name"
  | "email"
  | "date"
  | "custom";

export type VariableSuggestion = { kind: SuggestedKind; slug: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONTH_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
const WEEKDAY_RE =
  /\b(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i;
const NUMERIC_DATE_RE = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/;
const RELATIVE_DATE_RE = /\b(?:today|tomorrow|tonight|yesterday)\b/i;
const NAME_WORD_RE = /^[A-Z][A-Za-z'’.-]*$/;

function looksLikeDate(text: string): boolean {
  return (
    MONTH_RE.test(text) ||
    WEEKDAY_RE.test(text) ||
    NUMERIC_DATE_RE.test(text) ||
    RELATIVE_DATE_RE.test(text)
  );
}

/** Selected text → a fill-in field name (first few words, underscored). */
export function slugifyField(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean)
    .slice(0, 4)
    .join("_");
  return slug || "field";
}

/** Best-guess token for a selected run of text: email before date (so
 *  "may@x.com" isn't a date), then a one/two-word capitalized name, else a
 *  custom fill-in field. */
export function suggestVariable(raw: string): VariableSuggestion {
  const text = raw.trim();
  const slug = slugifyField(text);
  if (EMAIL_RE.test(text)) return { kind: "email", slug };
  if (looksLikeDate(text)) return { kind: "date", slug };
  const words = text.split(/\s+/);
  if (words.length === 2 && words.every((w) => NAME_WORD_RE.test(w)))
    return { kind: "name", slug };
  if (words.length === 1 && NAME_WORD_RE.test(text))
    return { kind: "first_name", slug };
  return { kind: "custom", slug };
}
