import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  GripVerticalIcon,
  History,
  PaperclipIcon,
  PencilIcon,
  PenLineIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import DOMPurify from "dompurify";
import { toast } from "sonner";

import { useQueryClient } from "@tanstack/react-query";

import { useSession } from "@/lib/auth-client";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import type { Account } from "@/lib/account";
import {
  deleteDraft,
  saveDraft,
  sendNewEmail,
  useContactsQuery,
  type Contact,
} from "@/lib/mail-queries";
import { isTestAccount } from "@/lib/test-account";
import {
  clearDraftBuffer,
  loadDraftBuffer,
  saveDraftBuffer,
  type BufferedDraft,
} from "@/lib/draft-buffer";
import { AccountDot } from "@/components/account-dot";
import { RichTextEditor } from "@/components/rich-text-editor";
import { serializeEmailHtml, type EmailNode } from "@/lib/email/serialize";
import { checkGuardrails } from "@/lib/email/guardrails";
import { countFillFields } from "@/components/editor-fill-fields";
import { useSnippetMap, openSnippetDraft } from "@/hooks/use-snippets";
import { DOMSerializer } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { BookmarkPlusIcon } from "lucide-react";
import {
  appendSignature,
  appendSignatureHtml,
  resolveAccountSignature,
  useGmailSignatureQuery,
  useSignaturesQuery,
} from "@/hooks/use-signatures";
import { HtmlBody } from "@/components/html-body";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Hint } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const shortName = (email: string) => email.split("@")[0] || email;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Feathers all four edges of the blur halo by 30px (intersected) so it fades out
// instead of ending on a hard rectangle.
const HALO_FEATHER =
  "linear-gradient(to right, transparent, #000 30px, #000 calc(100% - 30px), transparent), linear-gradient(to bottom, transparent, #000 30px, #000 calc(100% - 30px), transparent)";

/** Threading headers that nest a sent message under an existing conversation
 *  (set by reply / reply-all; null for a fresh compose). */
export type ReplyContext = {
  inReplyTo?: string;
  references?: string;
  threadId?: string;
};

/** The composer's editable fields. Lifted to the parent (AppShell) so they
 *  persist when the composer remounts — switching pane↔popout, or navigating to
 *  a page where the board (and its compose pane) isn't mounted. */
export type ComposerContent = {
  fromId: string | null;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  /** Present when the composer was opened as a reply-all (threads the send). */
  reply: ReplyContext | null;
};

/** True when `value` is one or more comma-separated, well-formed addresses. */
function isValidRecipients(value: string): boolean {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => EMAIL_RE.test(part));
}

/** Split a To: entry into its display name + bare email
 *  ("Maya Chen <maya@x>" → { name: "Maya Chen", email: "maya@x" }). */
function parseToEntry(entry: string): { name: string; email: string } {
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
  "support", "info", "noreply", "no-reply", "hello", "team", "contact",
  "admin", "sales", "help", "hi", "billing", "careers", "jobs", "press",
  "security", "notifications", "donotreply", "do-not-reply", "mailer",
]);

/** Guess a name from an email's local part (maya@x → "Maya", first.last@x →
 *  "First Last"). Empty unless the address looks complete and isn't a role box. */
function nameFromEmail(email: string): string {
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

/**
 * Docked composer for a new message (design: fixed bottom-right panel, not a
 * Dialog). Field rows are borderless — plain inputs, label column 44px,
 * mono To / sans Subject (font spec), ⌘↵ sends. Replies happen inline in the
 * reader, not here.
 */
export function Composer({
  open,
  onOpenChange,
  accounts,
  content,
  onContentChange,
  draft,
  inPane = false,
  onHeaderPointerDown,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  /** Editable fields, owned by the parent so they survive the composer
   *  remounting (e.g. swapping between the board pane and the popout). */
  content: ComposerContent;
  onContentChange: (patch: Partial<ComposerContent>) => void;
  /** Open an existing draft for editing — the parent seeds `content`. */
  draft?: { accountId: string; emailId: string } | null;
  /** Render to fill a tile (pane mode) instead of the floating popout. */
  inPane?: boolean;
  /** In pane mode, makes the header a drag handle for the tile board. */
  onHeaderPointerDown?: (event: React.PointerEvent) => void;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { defaultSendFrom } = useSettings();
  // Any inbox with an address can be the From. Test/demo accounts are included
  // so the picker shows them — sending from one is a sealed no-op (see `send`).
  const sendable = useMemo(() => accounts.filter((a) => a.email), [accounts]);

  const { fromId, to, cc, bcc, subject, body, reply } = content;
  // Cc/Bcc start hidden for a fresh compose; reply-all seeds cc, so reveal it then.
  const [ccShown, setCcShown] = useState(false);
  const [bccShown, setBccShown] = useState(false);
  const showCc = ccShown || cc.trim().length > 0;
  const showBcc = bccShown || bcc.trim().length > 0;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Preview renders the body as the recipient sees it (rich text → HTML).
  const [preview, setPreview] = useState(false);
  // Files staged for this message, read to base64 in the browser.
  const [files, setFiles] = useState<StagedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The editor's live document model (TipTap JSON), serialized to email-safe
  // HTML on send/preview. Re-emitted by the editor on mount, so it survives the
  // composer remounting between the board pane and the popout.
  const [bodyDoc, setBodyDoc] = useState<EmailNode | null>(null);
  // The editor instance + the screen rect of the current text selection — drives
  // the "save as snippet" bubble that floats over a highlighted passage.
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [snipRect, setSnipRect] = useState<{ left: number; top: number } | null>(
    null,
  );
  // The popout's measured rect → drives a feathered blur halo behind it.
  const sectionRef = useRef<HTMLElement>(null);
  const [haloRect, setHaloRect] = useState<DOMRect | null>(null);
  // Undo-send: the dispatch is delayed by a cancel window; this holds the timer.
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guardrails gate the first Send click; a second click ("Send anyway") sends.
  const [confirmSend, setConfirmSend] = useState(false);
  // Autosave: the Gmail draft created/updated this session (fresh composes), and
  // a status for the footer indicator.
  const autosaveRef = useRef<{ draftId: string; messageId: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  // From: an explicit pick (fromId) wins; otherwise the configured default
  // send-from account, then the primary inbox, then the first sendable one.
  const from =
    sendable.find((a) => a.accountId === fromId) ??
    sendable.find((a) => a.accountId === defaultSendFrom) ??
    sendable.find((a) => a.email === session?.user.email) ??
    sendable[0] ??
    null;

  // People you've emailed before — feeds the To autocomplete.
  const contacts = useContactsQuery(from?.accountId, open).data ?? [];
  // Snippets expand inline in the editor (e.g. "/ty "). Fetched only while open.
  const snippets = useSnippetMap(open);

  // Variables for snippet `{{tokens}}`, resolved from the first To: recipient.
  // Name priority: a saved contact → a display name typed in To: → a name
  // guessed from the email's local part (maya@… → "Maya"), so {{first_name}}
  // resolves for fresh addresses, not just known contacts. Still empty (→ a
  // fill field) when there's no usable name (e.g. a bare role address).
  const variables = useMemo<Record<string, string>>(() => {
    const firstEntry = to.split(",")[0]?.trim() ?? "";
    const { name: displayName, email } = parseToEntry(firstEntry);
    const contact = contacts.find(
      (c) => c.email.toLowerCase() === email.toLowerCase(),
    );
    const name = (
      contact?.name?.trim() ||
      displayName ||
      nameFromEmail(email)
    ).trim();
    const [first, ...rest] = name.split(/\s+/).filter(Boolean);
    return {
      name,
      first_name: first ?? "",
      last_name: rest.join(" "),
      email: contact?.email ?? email,
    };
  }, [to, contacts]);

  // Unfilled snippet tab-stops HARD-BLOCK send — you must fill them first.
  const unfilledFields = countFillFields(bodyDoc);
  // Soft last-second checks (no subject, "see attached" with nothing attached,
  // mail leaving a work domain, a big blast) — these warn + gate, not block.
  const guardrails = useMemo(() => {
    if (!from) return [];
    return checkGuardrails({
      subject,
      bodyText: body.replace(/<[^>]+>/g, " "),
      to,
      cc,
      bcc,
      fromEmail: from.email,
      attachmentCount: files.length,
    });
  }, [from, subject, body, to, cc, bcc, files.length]);
  // Any edit that changes the warnings clears the "Send anyway" arming.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-arm only when the warning set changes identity.
  useEffect(() => setConfirmSend(false), [guardrails]);

  // Signature: shown as a read-only block below the editor (not inside it, so it
  // can't be edited) and appended to the outgoing HTML at send/draft — unless the
  // user removes it for this message. The skip resets when the From account
  // changes, since that changes the signature.
  // The account's native Gmail signature (rich + images) is the source of truth
  // when set; a BetterBox DB signature is only a fallback for accounts without
  // one. The Gmail HTML is Gmail-authored, so it's email-safe as-is.
  const sigData = useSignaturesQuery(open).data;
  const dbSig = open ? resolveAccountSignature(sigData, from?.accountId) : null;
  const gmailSig =
    useGmailSignatureQuery(from?.accountId, from?.email, open).data ?? "";
  const useGmailSig = gmailSig.length > 0;

  const [signatureSkipped, setSignatureSkipped] = useState(false);
  useEffect(() => setSignatureSkipped(false), [from?.accountId]);
  const showSignature = (useGmailSig || dbSig !== null) && !signatureSkipped;

  const appendSig = (html: string) =>
    useGmailSig
      ? appendSignatureHtml(html, gmailSig)
      : dbSig
        ? appendSignature(html, dbSig.body)
        : html;

  const outgoingHtml = showSignature ? appendSig(body) : body;
  // Send + preview go through the email-safe serializer (TipTap doc → table-based,
  // inlined, send-safe HTML). Drafts keep the raw editor HTML above, since the
  // editor has no table nodes to parse the serialized form back into. Falls back
  // to the raw body only if the editor hasn't emitted a doc yet (never on a
  // user-initiated send — the editor emits on mount).
  const emailSafeBody = bodyDoc ? serializeEmailHtml(bodyDoc) : body;
  const emailSafeHtml = showSignature ? appendSig(emailSafeBody) : emailSafeBody;

  // Debounced autosave to Gmail Drafts. Fresh composes only — editing an
  // existing draft is skipped (we don't resolve its Gmail draft id, so a save
  // would create a duplicate). draftId tracks the created draft so later saves
  // UPDATE it instead of piling up.
  // biome-ignore lint/correctness/useExhaustiveDependencies: from is captured via accountId; queryClient/saveDraft are stable.
  useEffect(() => {
    const has =
      to.trim().length > 0 || subject.trim().length > 0 || body.length > 0;
    if (!open || !from || draft || !has) return;
    const accountId = from.accountId;
    const timer = setTimeout(() => {
      setSaveStatus("saving");
      void saveDraft({
        accountId,
        draftId: autosaveRef.current?.draftId,
        to: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject,
        html: outgoingHtml,
      }).then((res) => {
        if (res) {
          autosaveRef.current = res;
          setSaveStatus("saved");
          // Gmail holds the draft now — drop the local backstop.
          void clearDraftBuffer();
          queryClient.invalidateQueries({ queryKey: ["emails", accountId] });
        } else {
          setSaveStatus("idle");
        }
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [
    open,
    from?.accountId,
    draft?.emailId,
    to,
    cc,
    bcc,
    subject,
    body,
    outgoingHtml,
  ]);

  // Offline backstop: mirror in-progress content to a local IndexedDB buffer,
  // faster than the 2s Gmail autosave so the freshest content survives a crash
  // or an offline tab. Fresh composes only; skipped for demo accounts.
  // biome-ignore lint/correctness/useExhaustiveDependencies: from is captured via accountId; the buffer fns are stable.
  useEffect(() => {
    const has =
      to.trim().length > 0 || subject.trim().length > 0 || body.length > 0;
    if (!open || !from || draft || isTestAccount(from.accountId) || !has) return;
    const t = setTimeout(() => {
      void saveDraftBuffer({ fromId, to, cc, bcc, subject, body });
    }, 700);
    return () => clearTimeout(t);
  }, [open, from?.accountId, draft, fromId, to, cc, bcc, subject, body]);

  // On a fresh, empty compose, offer back any buffer the last session left
  // behind (i.e. it never committed to Gmail). Checked once per open.
  const [recovered, setRecovered] = useState<BufferedDraft | null>(null);
  const recoveryCheckedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the field deps seed the one-shot empty check; the ref makes it run once per open.
  useEffect(() => {
    if (!open) {
      recoveryCheckedRef.current = false;
      setRecovered(null);
      return;
    }
    if (recoveryCheckedRef.current) return;
    recoveryCheckedRef.current = true;
    const empty =
      !draft &&
      to.trim() === "" &&
      cc.trim() === "" &&
      bcc.trim() === "" &&
      subject.trim() === "" &&
      body.trim() === "";
    if (!empty) return;
    void loadDraftBuffer().then((b) => {
      if (b && (b.to || b.subject || b.body)) setRecovered(b);
    });
  }, [open, draft, to, cc, bcc, subject, body]);

  // Show the "save as snippet" bubble while a non-empty passage is selected in
  // the editor. Positioned from the live DOM selection rect; cleared on collapse
  // or blur (the bubble itself preventDefaults mousedown so clicking it keeps the
  // selection alive).
  useEffect(() => {
    const ed = editorInstance;
    if (!ed) return;
    const sync = () => {
      if (ed.state.selection.empty || !ed.isFocused) return setSnipRect(null);
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return setSnipRect(null);
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.width < 1 && r.height < 1) return setSnipRect(null);
      setSnipRect({ left: r.left + r.width / 2, top: r.top });
    };
    const clear = () => setSnipRect(null);
    ed.on("selectionUpdate", sync);
    ed.on("blur", clear);
    return () => {
      ed.off("selectionUpdate", sync);
      ed.off("blur", clear);
    };
  }, [editorInstance]);

  // Measure the popout so a feathered blur halo can sit just behind its edges.
  // Skipped in pane mode and for the full-screen mobile composer (no halo there).
  useEffect(() => {
    const el = sectionRef.current;
    if (inPane || !el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setHaloRect(r.width >= window.innerWidth - 8 ? null : r);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [inPane, open]);

  if (!open) return null;

  const restoreBuffer = () => {
    if (!recovered) return;
    onContentChange({
      fromId: recovered.fromId,
      to: recovered.to,
      cc: recovered.cc,
      bcc: recovered.bcc,
      subject: recovered.subject,
      body: recovered.body,
    });
    if (recovered.cc.trim()) setCcShown(true);
    if (recovered.bcc.trim()) setBccShown(true);
    setRecovered(null);
  };

  const dismissRecovery = () => {
    setRecovered(null);
    void clearDraftBuffer();
  };

  // Save the highlighted passage as a reusable snippet: capture the selection's
  // HTML (formatting preserved) and hand it to Settings → Snippets, which opens
  // a new snippet pre-filled with it — the trigger gets set in the real editor.
  const saveAsSnippet = () => {
    const ed = editorInstance;
    if (!ed) return;
    const { from: selFrom, to: selTo } = ed.state.selection;
    if (selFrom === selTo) return;
    const tmp = document.createElement("div");
    tmp.appendChild(
      DOMSerializer.fromSchema(ed.schema).serializeFragment(
        ed.state.selection.content().content,
      ),
    );
    setSnipRect(null);
    openSnippetDraft(tmp.innerHTML);
  };

  // Require at least one well-formed address (comma-separated allowed) before
  // Send is enabled — so "d" can't be sent. Cc is optional but, when present,
  // must be valid too.
  const recipientsValid = isValidRecipients(to);
  const ccValid = cc.trim().length === 0 || isValidRecipients(cc);
  const bccValid = bcc.trim().length === 0 || isValidRecipients(bcc);
  const canSend =
    !sending &&
    from !== null &&
    recipientsValid &&
    ccValid &&
    bccValid &&
    unfilledFields === 0;

  const hasContent =
    to.trim().length > 0 || subject.trim().length > 0 || body.length > 0;

  const refreshDrafts = (accountId: string) => {
    queryClient.invalidateQueries({ queryKey: ["emails", accountId] });
    // Drop the cached full-email so re-opening an edited draft shows new content.
    queryClient.invalidateQueries({ queryKey: ["email", accountId] });
  };

  const reset = () => {
    onContentChange({
      fromId: null,
      to: "",
      cc: "",
      bcc: "",
      subject: "",
      body: "",
      reply: null,
    });
    setBccShown(false);
    setCcShown(false);
    setError(null);
    setSending(false);
    setPreview(false);
    setFiles([]);
    setBodyDoc(null);
    setConfirmSend(false);
    if (sendTimerRef.current) {
      clearTimeout(sendTimerRef.current);
      sendTimerRef.current = null;
    }
    autosaveRef.current = null;
    setSaveStatus("idle");
    setSignatureSkipped(false);
    onOpenChange(false);
  };

  // Closing tries to save the current content as a draft (or update the one
  // being edited). Real Gmail draft persistence isn't wired yet, so saveDraft
  // is a no-op for real accounts — only test accounts actually save here.
  const close = () => {
    // Editing an existing real draft is skipped (no Gmail draft id → would
    // duplicate); fresh composes + test accounts persist.
    const skipExisting =
      draft != null && from != null && !isTestAccount(from.accountId);
    if (from && hasContent && !skipExisting) {
      void saveDraft({
        accountId: from.accountId,
        id: draft?.emailId,
        draftId: autosaveRef.current?.draftId,
        to: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject,
        html: outgoingHtml,
      }).then(() => refreshDrafts(from.accountId));
      if (isTestAccount(from.accountId)) toast("Saved to drafts");
    }
    reset();
  };

  // Discard throws the message away — and removes the draft if we were editing
  // one (so it doesn't linger in the Drafts folder).
  const discard = () => {
    if (from) {
      // Remove the draft being edited and/or the one autosave created this session.
      if (draft) {
        void deleteDraft(from.accountId, draft.emailId).then(() =>
          refreshDrafts(from.accountId),
        );
      }
      if (autosaveRef.current) {
        void deleteDraft(from.accountId, autosaveRef.current.messageId).then(
          () => refreshDrafts(from.accountId),
        );
      }
      if ((draft || autosaveRef.current) && isTestAccount(from.accountId))
        toast("Draft discarded");
    }
    void clearDraftBuffer();
    reset();
  };

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // let the same file be picked again later
    if (picked.length === 0) return;
    const blocked = picked.filter((f) => BLOCKED_EXT.test(f.name));
    const allowed = picked.filter((f) => !BLOCKED_EXT.test(f.name));
    if (blocked.length > 0) {
      toast.error("Some files can’t be sent", {
        description: `Gmail blocks ${blocked.map((f) => f.name).join(", ")}.`,
      });
    }
    if (allowed.length === 0) return;
    try {
      const staged = await Promise.all(allowed.map(readFileAsBase64));
      setFiles((prev) => {
        const next = [...prev, ...staged];
        // ~25 MB decoded ≈ 34 MB of base64 — Gmail's send ceiling.
        if (next.reduce((s, f) => s + f.base64.length, 0) > 34_000_000) {
          toast.error("Attachments too large", { description: "25 MB max." });
          return prev;
        }
        return next;
      });
    } catch {
      toast.error("Couldn’t read that file");
    }
  };
  const removeFile = (id: string) =>
    setFiles((prev) => prev.filter((f) => f.id !== id));

  // The actual dispatch, fired after the undo window elapses.
  const doSend = async () => {
    if (!from) return;
    setSending(true);
    setError(null);
    const sandbox = isTestAccount(from.accountId);
    try {
      await sendNewEmail({
        accountId: from.accountId,
        to: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject,
        body: "",
        html: emailSafeHtml,
        inReplyTo: reply?.inReplyTo,
        references: reply?.references,
        threadId: reply?.threadId,
        attachments: files.map((f) => ({
          filename: f.name,
          mimeType: f.type,
          contentBase64: f.base64,
        })),
      });
      // A sent draft leaves the Drafts folder.
      if (draft) {
        await deleteDraft(from.accountId, draft.emailId);
        refreshDrafts(from.accountId);
      }
      // The draft autosave created is a copy of this now-sent message — trash it.
      if (autosaveRef.current) {
        await deleteDraft(from.accountId, autosaveRef.current.messageId).catch(
          () => {},
        );
        autosaveRef.current = null;
        refreshDrafts(from.accountId);
      }
      if (sandbox) {
        toast("Demo: message not sent", {
          description: "This is a sandbox. Nothing actually left BetterBox.",
        });
      } else {
        toast.success("Message sent", { description: `To ${to.trim()}` });
      }
      // Sent — drop the local backstop.
      void clearDraftBuffer();
      setSending(false);
      reset();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error("Couldn’t send message", { description: message });
      setSending(false);
    }
  };

  // Undo-send: hold the message for a few seconds with a cancel toast before it
  // actually goes out.
  const UNDO_MS = 5000;
  const scheduleSend = () => {
    setSending(true);
    const timer = setTimeout(() => {
      sendTimerRef.current = null;
      void doSend();
    }, UNDO_MS);
    sendTimerRef.current = timer;
    toast("Sending…", {
      description: `To ${to.trim()}`,
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timer);
          sendTimerRef.current = null;
          setSending(false);
        },
      },
    });
  };

  // Send click: gate on guardrails (first click arms "Send anyway"), then start
  // the undo window.
  const send = () => {
    if (!canSend || !from || sending) return;
    if (guardrails.length > 0 && !confirmSend) {
      setConfirmSend(true);
      return;
    }
    scheduleSend();
  };

  // One consolidated notices line above the footer: a send error wins, then hard
  // blockers (must fix to send), then the soft guardrails (warn only).
  const recipientError =
    (to.trim().length > 0 && !recipientsValid) || !ccValid || !bccValid;
  const blockers: string[] = [];
  if (unfilledFields > 0)
    blockers.push(
      `Fill in ${unfilledFields} snippet field${unfilledFields > 1 ? "s" : ""}`,
    );
  if (recipientError) blockers.push("Enter a valid email address");
  // warn = soft (you can still Send anyway) → yellow + triangle. block/error =
  // can't send → red + a stop (octagon) icon.
  const notices: { text: string; tone: "error" | "block" | "warn" }[] = error
    ? [{ text: error, tone: "error" }]
    : blockers.length > 0
      ? blockers.map((text) => ({ text, tone: "block" as const }))
      : guardrails.map((g) => ({ text: g.message, tone: "warn" as const }));

  // Passive surfacing: soft warnings stay hidden on a fresh, empty open — they
  // appear once you're actually writing (or after a send attempt). Hard blockers
  // and send errors always show. Either way the footer reserves the space, so a
  // notice never shifts the body up.
  const engaged =
    body.length > 0 ||
    to.trim().length > 0 ||
    subject.trim().length > 0 ||
    cc.trim().length > 0 ||
    bcc.trim().length > 0;
  const visibleNotices = notices.filter(
    (n) => n.tone !== "warn" || engaged || confirmSend,
  );

  return (
    <>
      {haloRect && (
        // A feathered backdrop-blur halo hugging the popout's edges and fading
        // out — softens the hard edge so the card lifts off the inbox. A sibling
        // (not a child) so it isn't clipped by the section's overflow + rounding.
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-30 hidden sm:block"
          style={{
            left: haloRect.left - 26,
            top: haloRect.top - 26,
            width: haloRect.width + 52,
            height: haloRect.height + 52,
            borderRadius: 28,
            backdropFilter: "blur(14px) saturate(1.2)",
            WebkitBackdropFilter: "blur(14px) saturate(1.2)",
            maskImage: HALO_FEATHER,
            WebkitMaskImage: HALO_FEATHER,
            maskComposite: "intersect",
            WebkitMaskComposite: "source-in",
          }}
        />
      )}
      <section
        ref={sectionRef}
        aria-label="New message"
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void send();
          }
          if (event.key === "Escape" && !sending) close();
        }}
      className={cn(
        "flex flex-col overflow-hidden bg-secondary",
        inPane
          ? "h-full w-full"
          : // Full-screen on phones; the floating bottom-right popout on sm+. The
            // soft-edged blur halo behind it (see above) does the lifting.
            "fixed inset-0 z-50 w-full rounded-none border-0 sm:inset-auto sm:right-5 sm:bottom-5 sm:z-40 sm:w-[520px] sm:max-w-[calc(100vw-2.5rem)] sm:rounded-xl sm:border sm:border-input sm:shadow-[0_32px_90px_-20px_rgba(0,0,0,0.7)]",
      )}
    >
      <header
        onPointerDown={onHeaderPointerDown}
        className={cn(
          "flex items-center gap-2 border-b bg-popover",
          // Match the account/reader pane header height (h-9) in pane mode.
          inPane ? "h-9 px-2.5" : "px-3.5 py-[11px]",
          onHeaderPointerDown &&
            "cursor-grab touch-none select-none active:cursor-grabbing",
        )}
      >
        {onHeaderPointerDown && (
          <GripVerticalIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
        )}
        <PencilIcon className="size-3.5 text-muted-foreground" />
        <span className="text-[14.5px] font-semibold tracking-[-0.2px]">
          {draft ? "Edit draft" : "New message"}
        </span>
        <Hint
          label={
            from && isTestAccount(from.accountId)
              ? "Close, saves to drafts"
              : "Close"
          }
        >
          <button
            type="button"
            onClick={close}
            className="ml-auto inline-flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-[15px]" />
          </button>
        </Hint>
      </header>

      <div className="flex h-[42px] items-center gap-2.5 border-b px-4">
        <FieldLabel>From</FieldLabel>
        {from ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-[7px] border bg-card px-2.5 py-1 hover:bg-muted">
              <AccountDot
                colorIndex={accounts.findIndex(
                  (a) => a.accountId === from.accountId,
                )}
                accountId={from.accountId}
              />
              <span className="shrink-0 text-[13px]">
                {shortName(from.email)}
              </span>
              <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                {from.email}
              </span>
              <ChevronDownIcon className="size-[13px] shrink-0 text-muted-foreground/70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {sendable.map((account) => (
                <DropdownMenuItem
                  key={account.accountId}
                  onClick={() => onContentChange({ fromId: account.accountId })}
                >
                  <AccountDot
                    colorIndex={accounts.findIndex(
                      (a) => a.accountId === account.accountId,
                    )}
                    accountId={account.accountId}
                  />
                  <span className="shrink-0 text-[13px]">
                    {shortName(account.email)}
                  </span>
                  <span className="ml-auto truncate font-mono text-[11.5px] text-muted-foreground">
                    {account.email}
                  </span>
                  {account.accountId === from.accountId && (
                    <CheckIcon className="size-3.5 shrink-0 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="text-xs text-muted-foreground">
            No sendable account linked
          </span>
        )}
      </div>

      <div className="flex min-h-10 items-center gap-2.5 border-b px-4 py-1.5">
        <FieldLabel>To</FieldLabel>
        <RecipientField
          value={to}
          onChange={(next) => onContentChange({ to: next })}
          contacts={contacts}
        />
        {(!showCc || !showBcc) && (
          <span className="flex shrink-0 items-center gap-0.5">
            {!showCc && (
              <button
                type="button"
                onClick={() => setCcShown(true)}
                className="cursor-pointer rounded px-1 text-[12px] text-muted-foreground/70 hover:text-foreground"
              >
                Cc
              </button>
            )}
            {!showBcc && (
              <button
                type="button"
                onClick={() => setBccShown(true)}
                className="cursor-pointer rounded px-1 text-[12px] text-muted-foreground/70 hover:text-foreground"
              >
                Bcc
              </button>
            )}
          </span>
        )}
      </div>

      {showCc && (
        <div className="group flex min-h-10 items-center gap-2.5 border-b px-4 py-1.5">
          <FieldLabel>Cc</FieldLabel>
          <RecipientField
            value={cc}
            onChange={(next) => onContentChange({ cc: next })}
            contacts={contacts}
          />
          <button
            type="button"
            aria-label="Remove Cc"
            onClick={() => {
              setCcShown(false);
              onContentChange({ cc: "" });
            }}
            className="shrink-0 rounded p-1 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}

      {showBcc && (
        <div className="group flex min-h-10 items-center gap-2.5 border-b px-4 py-1.5">
          <FieldLabel>Bcc</FieldLabel>
          <RecipientField
            value={bcc}
            onChange={(next) => onContentChange({ bcc: next })}
            contacts={contacts}
          />
          <button
            type="button"
            aria-label="Remove Bcc"
            onClick={() => {
              setBccShown(false);
              onContentChange({ bcc: "" });
            }}
            className="shrink-0 rounded p-1 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}

      <div className="flex h-10 items-center gap-2.5 border-b px-4">
        <FieldLabel>Subject</FieldLabel>
        <input
          value={subject}
          onChange={(event) => onContentChange({ subject: event.target.value })}
          placeholder="Add a subject line"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      {recovered && (
        <div className="flex items-center gap-2.5 border-b bg-label-yellow/[0.07] px-3.5 py-2 text-[12.5px]">
          <History className="size-3.5 shrink-0 text-label-yellow" />
          <span className="min-w-0 flex-1 text-foreground">
            Unsaved draft recovered from a previous session.
          </span>
          <button
            type="button"
            onClick={restoreBuffer}
            className="shrink-0 font-medium text-primary hover:underline"
          >
            Restore
          </button>
          <button
            type="button"
            onClick={dismissRecovery}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}

      <div
        className={cn(
          // Pane + full-screen mobile: editor grows to fill. Desktop popout
          // (sm+): content-sized, as before.
          inPane
            ? "flex min-h-0 flex-1 flex-col"
            : "flex min-h-0 flex-1 flex-col sm:block sm:flex-none",
          preview && "overflow-y-auto",
        )}
      >
        {preview ? (
          <PreviewBody html={emailSafeHtml} minHeight={inPane ? 320 : 200} />
        ) : (
          <RichTextEditor
            value={body}
            onChange={(next) => onContentChange({ body: next })}
            onDocChange={setBodyDoc}
            onEditorReady={setEditorInstance}
            snippets={snippets}
            variables={variables}
            placeholder="Write your message…"
            minHeight={inPane ? 320 : 200}
            // The editor fills edge-to-edge in both modes — drop the rounded
            // border, and go transparent so the body shares the composer's
            // surface instead of being a darker inset "void" (the cleaned-up
            // design is one unified surface). The field rows divide it.
            className={cn(
              "rounded-none border-0 bg-transparent",
              inPane ? "h-full" : "h-full sm:h-auto",
            )}
          />
        )}
      </div>

      {!preview && showSignature && (
        <div className="border-t px-3.5 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[0.5px] text-muted-foreground/60 uppercase">
              Signature
            </span>
            <button
              type="button"
              onClick={() => setSignatureSkipped(true)}
              aria-label="Remove signature"
              className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
          {useGmailSig ? (
            // Render the Gmail signature as it'll actually send — on a white
            // canvas, images proxied — via the shared email renderer.
            <div className="overflow-hidden rounded-md border">
              <HtmlBody html={gmailSig} accountId={from?.accountId} />
            </div>
          ) : (
            <div className="whitespace-pre-line text-[13px] leading-[1.6] text-muted-foreground">
              {dbSig?.body}
            </div>
          )}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t px-3.5 py-2.5">
          {files.map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center gap-2 rounded-lg border bg-secondary px-2.5 py-1.5 text-[12px]"
            >
              <PaperclipIcon className="size-3.5 flex-none text-muted-foreground" />
              <span className="max-w-[180px] truncate font-medium text-foreground">
                {f.name}
              </span>
              <button
                type="button"
                onClick={() => removeFile(f.id)}
                aria-label={`Remove ${f.name}`}
                className="flex-none text-muted-foreground transition-colors hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_FILES}
        onChange={onPickFiles}
        className="hidden"
      />

      {/* Fixed-height footer. Validation lives HERE — as chips in the middle —
          so surfacing a notice never shifts the body. */}
      <footer className="flex min-h-[58px] items-center gap-3 border-t px-3.5 pt-[11px] pb-[max(11px,env(safe-area-inset-bottom))] sm:pb-[11px]">
        <Button
          size="sm"
          className="shrink-0"
          disabled={!canSend || sending}
          onClick={() => send()}
        >
          <SendIcon data-icon="inline-start" />
          {sending
            ? "Sending…"
            : confirmSend && guardrails.length > 0
              ? "Send anyway"
              : "Send"}
        </Button>
        <KbdGroup className="hidden shrink-0 text-muted-foreground/45 sm:inline-flex">
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd>
        </KbdGroup>

        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {!preview && visibleNotices.length > 0 ? (
            visibleNotices.map((n) => (
              <NoticeChip key={n.text} tone={n.tone}>
                {n.text}
              </NoticeChip>
            ))
          ) : saveStatus !== "idle" ? (
            <span className="hidden items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground/45 sm:inline-flex">
              {saveStatus === "saving" ? (
                "Saving…"
              ) : (
                <>
                  <span className="size-1.5 rounded-full bg-success" />
                  Saved
                </>
              )}
            </span>
          ) : null}
        </div>

        <span className="inline-flex shrink-0 gap-0.5">
          <FooterIcon
            icon={preview ? PenLineIcon : EyeIcon}
            title={preview ? "Back to editing" : "Preview"}
            active={preview}
            onClick={() => setPreview((p) => !p)}
          />
          <FooterIcon
            icon={PaperclipIcon}
            title="Attach files"
            onClick={() => fileInputRef.current?.click()}
          />
          <FooterIcon
            icon={Trash2Icon}
            title={draft ? "Delete draft" : "Discard"}
            onClick={discard}
          />
        </span>
      </footer>

      {snipRect && !preview && (
        // Floating over a text selection. preventDefault on mousedown keeps the
        // selection from collapsing before the click lands.
        <div
          className="fixed z-[60] -translate-x-1/2 -translate-y-full"
          style={{ left: snipRect.left, top: snipRect.top - 10 }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            type="button"
            onClick={saveAsSnippet}
            className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-popover px-2.5 py-1.5 text-[12px] text-foreground shadow-xl ring-1 ring-foreground/10 transition-colors hover:bg-muted"
          >
            <BookmarkPlusIcon className="size-3.5 text-muted-foreground" />
            Save as snippet
          </button>
        </div>
      )}
      </section>
    </>
  );
}

type StagedFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  base64: string;
};

/** Read a picked file to a base64 string (no data: prefix) for the send payload. */
function readFileAsBase64(file: File): Promise<StagedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const result = String(reader.result);
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        base64: result.slice(result.indexOf(",") + 1),
      });
    };
    reader.readAsDataURL(file);
  });
}

// Common, sendable attachment types — narrows the file picker so you can't pick
// something Gmail will reject. (Gmail refuses executables outright.)
const ACCEPT_FILES =
  "image/*,video/*,audio/*,.pdf,.txt,.csv,.md,.rtf,.json,.xml,.log,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pages,.numbers,.key,.zip";

// Extensions Gmail won't send — re-checked after selection (the accept filter is
// only a hint) so a blocked file fails clearly instead of as an opaque send error.
const BLOCKED_EXT =
  /\.(ade|adp|apk|appx|bat|cab|chm|cmd|com|cpl|dll|dmg|exe|hta|ins|isp|iso|jar|jse?|lib|lnk|mde|msc|msix?|msp|mst|nsh|pif|ps1|scr|sct|shb|sys|vbe?|vxd|wsc|wsf|wsh)$/i;

/** Escape a plain-text draft and preserve its line breaks so it seeds the rich
 *  editor (which treats its content as HTML) without dropping `<addr>` or runs. */
export function plainToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n")
    .join("<br>");
}

function FieldLabel({ children }: { children: string }) {
  return (
    <span className="w-11 shrink-0 text-[12.5px] text-muted-foreground/70">
      {children}
    </span>
  );
}

/** Validation pill shown in the footer (never shifts the body). Yellow = a soft
 *  warning you can still send past; red = a hard blocker / send error. */
function NoticeChip({
  tone,
  children,
}: {
  tone: "error" | "block" | "warn";
  children: React.ReactNode;
}) {
  const warn = tone === "warn";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap",
        warn
          ? "border-label-yellow/35 bg-label-yellow/[0.1] text-label-yellow"
          : "border-label-red/40 bg-label-red/[0.1] text-label-red",
      )}
    >
      <span
        className={cn(
          "size-[5px] shrink-0 rounded-full",
          warn ? "bg-label-yellow" : "bg-label-red",
        )}
      />
      {children}
    </span>
  );
}

/** To field with Gmail-style chips + autocomplete. Committed recipients render
 *  as bordered pills (echoing the From box); the trailing token stays editable.
 *  The value stays a comma-separated string so send/save/validation are unchanged. */
function RecipientField({
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

  // Everything before the last comma is committed (chips); the rest is the
  // token still being typed. A comma in the input naturally promotes a chip.
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
          // A wide chip + a 120px-min input wraps the input to a 2nd line and
          // makes the row grow tall; once there are chips the input only needs
          // room to keep typing, so it tucks in beside them.
          chips.length ? "min-w-[3rem]" : "min-w-[120px]",
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

function FooterIcon({
  icon: Icon,
  title,
  onClick,
  disabled = false,
  active = false,
  className,
}: {
  icon: typeof PaperclipIcon;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <Hint label={title}>
      {/* aria-disabled (not `disabled`) so the button still receives hover and
          the tooltip fires; the click is guarded instead. */}
      <button
        type="button"
        aria-disabled={disabled}
        aria-pressed={active}
        onClick={disabled ? undefined : onClick}
        className={cn(
          "inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground",
          disabled
            ? "cursor-default opacity-40"
            : "cursor-pointer hover:bg-popover hover:text-foreground",
          active && "bg-popover text-foreground",
          className,
        )}
      >
        <Icon className="size-[15px]" />
      </button>
    </Hint>
  );
}

/** Read-only render of the message body — how the recipient will see it. Uses
 *  the same prose styles as the editor, sanitized (the HTML is our own TipTap
 *  output, but a pasted/typed link could carry a javascript: href). */
function PreviewBody({ html, minHeight }: { html: string; minHeight: number }) {
  if (!html) {
    return (
      <div
        className="px-3.5 py-3 text-[13px] text-muted-foreground/60"
        style={{ minHeight }}
      >
        Nothing to preview yet. Write a message first.
      </div>
    );
  }
  const clean = typeof window === "undefined" ? "" : DOMPurify.sanitize(html);
  // The serialized email carries email-oriented colors (dark text for a white
  // background). Render it on a light "paper" canvas — exactly as the recipient
  // sees it — so its text reads right instead of dim against the dark composer.
  return (
    <div className="p-3" style={{ minHeight }}>
      <div
        className="tiptap prose-email max-w-none rounded-lg border border-black/10 bg-white px-4 py-3.5 text-[13px] leading-[1.6] text-[#1a1a1a] [color-scheme:light]"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: `clean` is DOMPurify-sanitized one line above; this renders the composer's own preview.
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    </div>
  );
}
