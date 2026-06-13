import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckIcon,
  ChevronLeftIcon,
  PencilIcon,
  TagIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { useQueryClient } from "@tanstack/react-query";
import {
  createLabel,
  deleteLabel,
  labelsQueryKey,
  renameLabel,
  setEmailLabel,
  useLabelsQuery,
  type EmailsData,
  type FullEmail,
  type Label,
} from "@/lib/mail-queries";
import { setTagColor, useSettings } from "@/hooks/use-settings";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const TAG_COLORS = [
  "--color-label-blue",
  "--color-label-green",
  "--color-label-purple",
  "--color-label-red",
  "--color-label-yellow",
  "--color-label-orange",
];
const tagColorIndex = (label: Label, overrides: Record<string, number>) =>
  overrides[label.id] ??
  [...label.name].reduce((total, ch) => total + ch.charCodeAt(0), 0) %
    TAG_COLORS.length;
const tagColorVar = (index: number) =>
  `var(${TAG_COLORS[index % TAG_COLORS.length]})`;

export type TagActions = ReturnType<typeof useTagActions>;

export function useTagActions(accountId: string, email: FullEmail | undefined) {
  const queryClient = useQueryClient();
  const labels = useLabelsQuery(accountId).data ?? [];
  const appliedIds = email?.labelIds ?? [];
  const appliedTags = labels.filter((label) => appliedIds.includes(label.id));

  const patchLabels = useCallback(
    (messageId: string, labelId: string, on: boolean) => {
      const upd = (ids: string[] = []) =>
        on
          ? Array.from(new Set([...ids, labelId]))
          : ids.filter((id) => id !== labelId);
      queryClient.setQueryData<FullEmail>(
        ["email", accountId, messageId],
        (e) => (e ? { ...e, labelIds: upd(e.labelIds) } : e),
      );
      const patch = (data?: EmailsData) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            emails: page.emails.map((e) =>
              e.id === messageId ? { ...e, labelIds: upd(e.labelIds) } : e,
            ),
          })),
        };
      queryClient.setQueriesData<EmailsData>(
        { queryKey: ["emails", accountId] },
        patch,
      );
      queryClient.setQueriesData<EmailsData>(
        { queryKey: ["emails-search", accountId] },
        patch,
      );
    },
    [accountId, queryClient],
  );

  const toggleTag = useCallback(
    async (label: Label) => {
      if (!email) return;
      const on = !(email.labelIds ?? []).includes(label.id);
      patchLabels(email.id, label.id, on);
      try {
        await setEmailLabel(accountId, email.id, label.id, on);
      } catch {
        patchLabels(email.id, label.id, !on);
      }
      // The Labeled view (grouped by label) is a separate query — refresh it so
      // the message appears/disappears under the tag immediately.
      queryClient.invalidateQueries({
        queryKey: ["emails-label", accountId, label.id],
      });
    },
    [accountId, email, patchLabels, queryClient],
  );

  const createTag = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!email || !trimmed) return;
      const label = await createLabel(accountId, trimmed);
      queryClient.setQueryData<Label[]>(labelsQueryKey(accountId), (current) =>
        (current ?? []).some((l) => l.id === label.id)
          ? current
          : [...(current ?? []), label],
      );
      patchLabels(email.id, label.id, true);
      try {
        await setEmailLabel(accountId, email.id, label.id, true);
      } catch {
        patchLabels(email.id, label.id, false);
      }
      queryClient.invalidateQueries({
        queryKey: ["emails-label", accountId, label.id],
      });
    },
    [accountId, email, patchLabels, queryClient],
  );

  const renameTag = useCallback(
    async (label: Label, name: string) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed === label.name) return;
      queryClient.setQueryData<Label[]>(labelsQueryKey(accountId), (current) =>
        (current ?? []).map((l) =>
          l.id === label.id ? { ...l, name: trimmed } : l,
        ),
      );
      try {
        await renameLabel(accountId, label.id, trimmed);
      } catch {
        /* leave the optimistic name; a refetch reconciles */
      }
    },
    [accountId, queryClient],
  );

  const deleteTag = useCallback(
    async (label: Label) => {
      queryClient.setQueryData<Label[]>(labelsQueryKey(accountId), (current) =>
        (current ?? []).filter((l) => l.id !== label.id),
      );
      const strip = (data?: EmailsData) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            emails: page.emails.map((e) =>
              e.labelIds?.includes(label.id)
                ? { ...e, labelIds: e.labelIds.filter((id) => id !== label.id) }
                : e,
            ),
          })),
        };
      queryClient.setQueriesData<EmailsData>(
        { queryKey: ["emails", accountId] },
        strip,
      );
      queryClient.setQueriesData<EmailsData>(
        { queryKey: ["emails-search", accountId] },
        strip,
      );
      queryClient.setQueriesData<FullEmail>(
        { queryKey: ["email", accountId] },
        (e) =>
          e && e.labelIds?.includes(label.id)
            ? { ...e, labelIds: e.labelIds.filter((id) => id !== label.id) }
            : e,
      );
      try {
        await deleteLabel(accountId, label.id);
      } catch {
        /* optimistic removal stands */
      }
    },
    [accountId, queryClient],
  );

  return {
    labels,
    appliedIds,
    appliedTags,
    toggleTag,
    createTag,
    renameTag,
    deleteTag,
  };
}

export function LabelDot({
  label,
  className,
}: {
  label: Label;
  className?: string;
}) {
  const { tagColors } = useSettings();
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: tagColorVar(tagColorIndex(label, tagColors)) }}
    />
  );
}

function TagChip({ label, onRemove }: { label: Label; onRemove?: () => void }) {
  const { tagColors } = useSettings();
  const color = tagColorVar(tagColorIndex(label, tagColors));
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full py-0.5 pr-1.5 pl-2 text-[11px] font-medium"
      style={{
        background: `color-mix(in srgb, ${color} 16%, var(--background))`,
        color,
      }}
    >
      <span className="truncate">{label.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10"
        >
          <XIcon className="size-2.5" />
        </button>
      )}
    </span>
  );
}

export function AppliedTags({ tags }: { tags: TagActions }) {
  if (tags.appliedTags.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {tags.appliedTags.map((label) => (
        <TagChip
          key={label.id}
          label={label}
          onRemove={() => tags.toggleTag(label)}
        />
      ))}
    </div>
  );
}

/** Portalled to <body> so tile panes can't clip it. */
export function TagPicker({
  tags,
  disabled,
}: {
  tags: TagActions;
  disabled: boolean;
}) {
  const { tagColors } = useSettings();
  const { labels, appliedIds, toggleTag, createTag, renameTag, deleteTag } =
    tags;

  const [open, setOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [editing, setEditing] = useState<Label | null>(null);
  const [editName, setEditName] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number }>();

  const show = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect)
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setEditing(null);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const saveRename = () => {
    if (editing) void renameTag(editing, editName);
    setEditing(null);
  };

  return (
    <>
      <Hint label="Tags">
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          aria-pressed={open}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => (open ? close() : show())}
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent",
            tags.appliedTags.length > 0
              ? "text-accent-2-hover"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <TagIcon className="size-[15px]" />
        </button>
      </Hint>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-100 w-60 overflow-hidden rounded-lg border bg-popover shadow-2xl"
          >
            {editing ? (
              <div className="p-2">
                <div className="mb-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ChevronLeftIcon className="size-4" />
                  </button>
                  <span className="text-[12px] font-medium">Edit tag</span>
                  <button
                    type="button"
                    onClick={() => {
                      void deleteTag(editing);
                      close();
                    }}
                    className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-label-red hover:bg-label-red/10"
                  >
                    <Trash2Icon className="size-3" /> Delete
                  </button>
                </div>
                <input
                  autoFocus
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveRename();
                    }
                  }}
                  placeholder="Tag name"
                  className="w-full rounded-md bg-background/60 px-2 py-1 text-[12.5px] outline-none placeholder:text-muted-foreground/60"
                />
                <div className="mt-2 flex items-center gap-1.5">
                  {TAG_COLORS.map((_, index) => {
                    const active = tagColorIndex(editing, tagColors) === index;
                    return (
                      <button
                        key={index}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setTagColor(editing.id, index)}
                        className={cn(
                          "size-5 rounded-full transition-shadow",
                          active &&
                            "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
                        )}
                        style={{ background: tagColorVar(index) }}
                      />
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={saveRename}
                  className="mt-2.5 w-full rounded-md bg-primary py-1 text-[12px] font-medium text-on-primary hover:bg-primary-hover"
                >
                  Save
                </button>
              </div>
            ) : (
              <>
                <div className="no-scrollbar max-h-56 overflow-y-auto p-1">
                  {labels.length === 0 ? (
                    <p className="px-2 py-2 text-[12px] text-muted-foreground">
                      No tags yet — create one below.
                    </p>
                  ) : (
                    labels.map((label) => (
                      <div
                        key={label.id}
                        className="group/tag flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-muted"
                      >
                        <button
                          type="button"
                          onClick={() => toggleTag(label)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{
                              background: tagColorVar(
                                tagColorIndex(label, tagColors),
                              ),
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {label.name}
                          </span>
                        </button>
                        {appliedIds.includes(label.id) && (
                          <CheckIcon className="size-3.5 shrink-0 text-accent-2-hover" />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(label);
                            setEditName(label.name);
                          }}
                          className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 group-hover/tag:opacity-100 hover:bg-foreground/10 hover:text-foreground"
                        >
                          <PencilIcon className="size-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t p-1.5">
                  <input
                    autoFocus
                    value={newTag}
                    onChange={(event) => setNewTag(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void createTag(newTag);
                        setNewTag("");
                      }
                    }}
                    placeholder="Create tag…"
                    className="w-full rounded-md bg-background/60 px-2 py-1 text-[12.5px] outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
