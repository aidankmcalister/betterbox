import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BracesIcon,
  CalendarIcon,
  ChevronDownIcon,
  MailIcon,
  Pencil,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  SquareSlashIcon,
  TextCursorIcon,
  Trash2,
  TriangleAlertIcon,
  UserRound,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Hint } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import type { Editor } from "@tiptap/react";
import DOMPurify from "dompurify";
import { escapeHtml } from "@/lib/email/serialize";
import { VARIABLE_KEYS, PREVIEW_CONTACT } from "@/lib/snippet-tokens";
import { SnippetTokenBubble } from "@/components/editor/snippet-token-bubble";
import { FieldNameDialog } from "@/components/editor/field-name-dialog";
import { snippetRowPreview } from "@/lib/snippet-preview";
import {
  tokensToFieldHtml,
  fieldHtmlToTokens,
  tokenNode,
} from "@/components/editor/editor-fill-fields";
import {
  activeSnippetsQueryKey,
  saveSnippet,
  deleteSnippet,
  useSnippetsQuery,
  type Snippet,
} from "@/hooks/use-snippets";
import {
  EditorActions,
  EditorFieldLabel,
  Mono,
  Page,
  PageSection,
} from "../primitives";

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function snippetPreviewHtml(html: string): string {
  return html.replace(TOKEN_RE, (_m, raw: string) => {
    const k = raw.toLowerCase();
    if (k === "cursor")
      return '<span class="ml-px inline-block h-[1.05em] w-px translate-y-[2px] rounded-sm bg-primary align-baseline"></span>';
    if (VARIABLE_KEYS.has(k)) return escapeHtml(PREVIEW_CONTACT[k] ?? k);
    return `<span class="inline-block rounded border border-primary/35 bg-primary/[0.13] px-1 font-mono text-[0.85em] leading-[1.45] text-primary align-middle">${escapeHtml(k)}</span>`;
  });
}

function validateTrigger(value: string, taken: string[]): string | null {
  const v = value.trim();
  if (v === "" || v === "/") return null; // pristine — don't nag yet
  if (!v.startsWith("/")) return "must start with /";
  if (!/^\/[a-z0-9_-]+$/i.test(v)) return "letters, numbers, - or _";
  if (taken.some((t) => t.toLowerCase() === v.toLowerCase()))
    return "trigger already in use";
  return null;
}

/** Lists only the {{tokens}} the composer actually resolves. */
const VAR_CHIP = {
  blue: "border-label-blue/35 bg-label-blue/[0.13] text-label-blue",
  primary: "border-primary/35 bg-primary/[0.13] text-primary",
  muted: "border-border bg-muted text-muted-foreground/80",
} as const;

function VarRow({
  token,
  tone,
  children,
}: {
  token: string;
  tone: keyof typeof VAR_CHIP;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className={cn(
          "shrink-0 rounded border px-1 py-px font-mono text-[11px]",
          VAR_CHIP[tone],
        )}
      >
        {token}
      </span>
      <span className="text-[12.5px] text-muted-foreground">{children}</span>
    </div>
  );
}

function SnippetVariables() {
  return (
    <PageSection title="Variables">
      <div className="flex flex-col">
        <VarRow token="first_name" tone="blue">
          Auto-fills from the recipient — also <Mono>last_name</Mono>,{" "}
          <Mono>name</Mono>, <Mono>email</Mono>.
        </VarRow>
        <VarRow token="date" tone="primary">
          Inserts a date you pick from a calendar.
        </VarRow>
        <VarRow token="cursor" tone="muted">
          Marks where your cursor lands after inserting.
        </VarRow>
        <VarRow token="topic" tone="primary">
          Any custom name becomes a fill-in field you Tab through.
        </VarRow>
      </div>
    </PageSection>
  );
}

function InsertFieldMenu({
  onInsert,
  hasCursor,
}: {
  onInsert: (token: string) => void;
  hasCursor: boolean;
}) {
  const [fieldOpen, setFieldOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <Hint label="Insert variable">
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                aria-label="Insert variable"
                className="h-7 gap-0.5 px-1.5 text-muted-foreground hover:text-foreground"
              />
            }
          >
            <BracesIcon />
            <ChevronDownIcon className="text-muted-foreground/60" />
          </DropdownMenuTrigger>
        </Hint>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Auto-fill from recipient</DropdownMenuLabel>
            <p className="px-1.5 pb-1 text-[11px] leading-snug text-muted-foreground/70">
              Filled from the recipient, if known.
            </p>
            <DropdownMenuItem onClick={() => onInsert("{{first_name}}")}>
              <UserRound />
              First name
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onInsert("{{last_name}}")}>
              <UserRound />
              Last name
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onInsert("{{name}}")}>
              <UserRound />
              Full name
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onInsert("{{email}}")}>
              <MailIcon />
              Email
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setFieldOpen(true)}>
            <Pencil />
            Fill-in field…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsert("{{date}}")}>
            <CalendarIcon />
            Date picker
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={hasCursor}
            onClick={() => onInsert("{{cursor}}")}
          >
            <TextCursorIcon />
            Cursor position
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FieldNameDialog
        open={fieldOpen}
        onOpenChange={setFieldOpen}
        onSubmit={(slug) => onInsert(`{{${slug}}}`)}
      />
    </>
  );
}

function SnippetPreview({ html }: { html: string }) {
  const clean =
    typeof window === "undefined"
      ? ""
      : DOMPurify.sanitize(snippetPreviewHtml(html));
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <EditorFieldLabel>Preview</EditorFieldLabel>
        <span className="font-mono text-[10px] text-muted-foreground/50">
          to: maya@acme.com
        </span>
      </div>
      <div
        className="border-l-2 border-input py-0.5 pl-3.5 text-[13px] leading-relaxed text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.88em] [&_p]:m-0 [&_p]:mb-1 [&_strong]:text-foreground"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: a sanitized preview of the user's own snippet.
        dangerouslySetInnerHTML={{
          __html:
            clean ||
            '<span class="text-muted-foreground/50">Nothing yet.</span>',
        }}
      />
    </div>
  );
}

type SnippetDraft = { trigger: string; text: string };

function SnippetEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
  taken,
}: {
  draft: SnippetDraft;
  onChange: (patch: Partial<SnippetDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  taken: string[];
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  // Editor works in chip nodes; the snippet stays stored as {{token}} text.
  const [chipHtml, setChipHtml] = useState(() => tokensToFieldHtml(draft.text));
  const triggerError = validateTrigger(draft.trigger, taken);
  const bodyEmpty =
    draft.text
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() === "";
  const canSave =
    draft.trigger.trim().length > 1 && !triggerError && !bodyEmpty;
  const extraCursors = (draft.text.match(/\{\{cursor\}\}/g) ?? []).length > 1;

  return (
    <div className="border-t bg-muted/40 px-3 py-3">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <EditorFieldLabel>Trigger</EditorFieldLabel>
        <input
          value={draft.trigger}
          onChange={(e) =>
            onChange({
              trigger: e.target.value.replace(/[^a-zA-Z0-9_/-]/g, ""),
            })
          }
          placeholder="/ty"
          spellCheck={false}
          autoComplete="off"
          className={cn(
            "h-7 w-32 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-[12.5px] outline-none focus:border-ring/60 sm:w-40 sm:flex-none",
            triggerError && "border-label-red/55",
          )}
        />
        {triggerError && (
          <span className="font-mono text-[10px] text-label-red">
            {triggerError}
          </span>
        )}
      </div>
      <RichTextEditor
        value={chipHtml}
        onChange={(html) => {
          setChipHtml(html);
          onChange({ text: fieldHtmlToTokens(html) });
        }}
        onEditorReady={setEditor}
        placeholder="Write the reply — insert a field for fill-ins…"
        minHeight={84}
        compact
        tokenChips
        toolbarEnd={
          <InsertFieldMenu
            hasCursor={draft.text.includes("{{cursor}}")}
            onInsert={(t) => {
              const m = t.match(/\{\{([a-zA-Z0-9_]+)\}\}/);
              editor
                ?.chain()
                .focus()
                .insertContent(m ? tokenNode(m[1]) : t)
                .run();
            }}
          />
        }
      />
      {extraCursors && (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-label-orange">
          <TriangleAlertIcon className="size-3.5 shrink-0" />
          Only the first cursor position is used — remove the extra one.
        </p>
      )}
      <div className="mt-2.5">
        <SnippetPreview html={draft.text} />
      </div>
      {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
      <EditorActions
        onCancel={onCancel}
        onSave={onSave}
        saving={saving}
        canSave={canSave}
        label="Save snippet"
      />
      {editor && <SnippetTokenBubble editor={editor} />}
    </div>
  );
}

/** Trigger is a button, so Delete is overlaid as a sibling, not nested. */
function SnippetRow({
  snippet,
  isOpen,
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
  onDelete,
  taken,
}: {
  snippet: Snippet;
  isOpen: boolean;
  draft: SnippetDraft;
  onChange: (patch: Partial<SnippetDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  onDelete: () => void;
  taken: string[];
}) {
  return (
    <AccordionItem
      value={snippet.id}
      className="group relative overflow-hidden rounded-lg border transition-colors last:border-b data-[panel-open]:border-input data-[panel-open]:bg-muted/20"
    >
      <AccordionTrigger className="h-10 gap-3 px-3.5 py-0 font-normal hover:bg-muted/40 data-[panel-open]:bg-transparent">
        <span className="shrink-0 font-mono text-[13px] font-medium text-foreground">
          {snippet.trigger}
        </span>
        <span
          className="mr-7 min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground/70"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a sanitized preview of the user's own snippet.
          dangerouslySetInnerHTML={{
            __html:
              typeof window === "undefined"
                ? ""
                : DOMPurify.sanitize(snippetRowPreview(snippet.text)),
          }}
        />
      </AccordionTrigger>
      <Hint label="Delete">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${snippet.trigger}`}
          className={cn(
            "absolute top-1 right-9 transition-opacity hover:text-label-red",
            isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </Hint>
      <AccordionContent className="p-0">
        {isOpen && (
          <SnippetEditor
            draft={draft}
            onChange={onChange}
            onSave={onSave}
            onCancel={onCancel}
            saving={saving}
            error={error}
            taken={taken}
          />
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function SnippetEmptyState({
  onSeed,
  seeding,
}: {
  onSeed: () => void;
  seeding: boolean;
}) {
  return (
    <EmptyState
      icon={SquareSlashIcon}
      title="No snippets yet"
      description={
        <>
          Save a reply once, expand it forever. Type a{" "}
          <span className="font-mono text-primary">/trigger</span> in the
          composer and it fills in — recipient names auto-resolve, the rest
          become Tab-through blanks.
        </>
      }
      action={
        <Button size="sm" disabled={seeding} onClick={onSeed}>
          <SparklesIcon />
          {seeding ? "Adding…" : "Add starter snippets"}
        </Button>
      }
    />
  );
}

export function RowSkeleton({ rows = 3 }: { rows?: number }) {
  const widths = ["w-44", "w-32", "w-52", "w-36", "w-40"];
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows.
          key={i}
          className="flex h-10 items-center gap-3 rounded-lg border px-3.5"
        >
          <Skeleton className="h-3.5 w-12 shrink-0 rounded" />
          <Skeleton
            className={cn("h-3 rounded opacity-70", widths[i % widths.length])}
          />
        </div>
      ))}
    </div>
  );
}

const NEW_SNIPPET = "__new__";

export function SnippetsPage({
  prefill,
  onPrefillConsumed,
}: {
  /** Composer "Save as snippet" body — opens a new snippet pre-filled. */
  prefill?: string | null;
  onPrefillConsumed?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: snippets = [], isLoading } = useSnippetsQuery(true);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SnippetDraft>({ trigger: "", text: "" });
  const [error, setError] = useState<string | null>(null);

  // A captured selection from the composer → open the new-snippet editor with it.
  useEffect(() => {
    if (!prefill) return;
    setOpenId(NEW_SNIPPET);
    setDraft({ trigger: "/", text: prefill });
    setError(null);
    onPrefillConsumed?.();
  }, [prefill, onPrefillConsumed]);

  const close = () => {
    setOpenId(null);
    setError(null);
  };
  const openExisting = (s: Snippet) => {
    setOpenId(s.id);
    setDraft({ trigger: s.trigger, text: s.text });
    setError(null);
  };
  const openNew = () => {
    setOpenId(NEW_SNIPPET);
    setDraft({ trigger: "/", text: "" });
    setError(null);
  };
  const patchDraft = (patch: Partial<SnippetDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const save = useMutation({
    mutationFn: () =>
      saveSnippet({
        id: openId === NEW_SNIPPET ? undefined : (openId ?? undefined),
        trigger: draft.trigger.trim(),
        text: draft.text,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activeSnippetsQueryKey() });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSnippet(id),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: activeSnippetsQueryKey() });
      if (openId === id) close();
    },
  });

  const seed = useMutation({
    mutationFn: async () => {
      const defaults = [
        {
          trigger: "/intro",
          text: "<p>Hi {{first_name}},</p><p>Thanks for the note about {{topic}}. {{cursor}}</p>",
        },
        { trigger: "/ty", text: "<p>Thanks so much, {{first_name}}!</p>" },
      ];
      for (const d of defaults) await saveSnippet(d);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: activeSnippetsQueryKey() }),
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return snippets;
    return snippets.filter(
      (s) =>
        s.trigger.toLowerCase().includes(t) || s.text.toLowerCase().includes(t),
    );
  }, [snippets, q]);

  const taken = snippets.filter((s) => s.id !== openId).map((s) => s.trigger);

  return (
    <Page>
      <PageSection
        title="Your snippets"
        action={
          !isLoading && snippets.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5"
              onClick={openNew}
            >
              <PlusIcon />
              New snippet
            </Button>
          ) : undefined
        }
      >
        <div className="mt-2.5 flex flex-col gap-2.5">
          {isLoading ? (
            <RowSkeleton rows={3} />
          ) : snippets.length === 0 ? (
            <SnippetEmptyState
              onSeed={() => seed.mutate()}
              seeding={seed.isPending}
            />
          ) : (
            <>
              <div className="flex h-8 items-center gap-2 rounded-lg border bg-muted/40 px-2.5">
                <SearchIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search triggers and text…"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/50"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ("")}
                    className="shrink-0 text-muted-foreground/60 hover:text-foreground"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {openId === NEW_SNIPPET && (
                  <div className="overflow-hidden rounded-lg border border-input bg-muted/20">
                    <div className="flex h-10 items-center gap-3 px-3.5">
                      <span className="font-mono text-[13px] font-medium text-foreground">
                        {draft.trigger || "/…"}
                      </span>
                      <span className="text-[12.5px] text-muted-foreground/60">
                        New snippet
                      </span>
                    </div>
                    <SnippetEditor
                      draft={draft}
                      onChange={patchDraft}
                      onSave={() => save.mutate()}
                      onCancel={close}
                      saving={save.isPending}
                      error={error}
                      taken={taken}
                    />
                  </div>
                )}
                {filtered.length > 0 && (
                  <Accordion
                    multiple={false}
                    value={openId && openId !== NEW_SNIPPET ? [openId] : []}
                    onValueChange={(value) => {
                      const id = (value as string[])[0];
                      if (!id) return close();
                      const s = snippets.find((x) => x.id === id);
                      if (s) openExisting(s);
                    }}
                    className="flex flex-col gap-2"
                  >
                    {filtered.map((s) => (
                      <SnippetRow
                        key={s.id}
                        snippet={s}
                        isOpen={openId === s.id}
                        draft={draft}
                        onChange={patchDraft}
                        onSave={() => save.mutate()}
                        onCancel={close}
                        saving={save.isPending}
                        error={error}
                        onDelete={() => remove.mutate(s.id)}
                        taken={taken}
                      />
                    ))}
                  </Accordion>
                )}
                {filtered.length === 0 && openId !== NEW_SNIPPET && (
                  <div className="px-1 py-5 font-mono text-[11.5px] text-muted-foreground/60">
                    no snippets match “{q}”.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </PageSection>
      <SnippetVariables />
    </Page>
  );
}
