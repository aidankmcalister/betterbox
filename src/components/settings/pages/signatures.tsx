import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  Signature as SignatureIcon,
  Trash2,
} from "lucide-react";

import type { Account } from "@/lib/account";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Hint } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  activeSignaturesQueryKey,
  saveSignature,
  removeSignature,
  assignSignature,
  useSignaturesQuery,
  type Signature,
} from "@/hooks/use-signatures";
import { EditorActions, EditorFieldLabel, Page } from "../primitives";
import { RowSkeleton } from "./snippets";

type SignatureDraft = { name: string; body: string };

function signaturePreview(body: string): string {
  return (
    body
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Empty signature"
  );
}

function SignatureEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
}: {
  draft: SignatureDraft;
  onChange: (patch: Partial<SignatureDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const canSave = draft.name.trim().length > 0 && draft.body.trim().length > 0;
  return (
    <div className="border-t bg-muted/40 px-3 py-3">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <EditorFieldLabel>Name</EditorFieldLabel>
        <Input
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Default"
          className="h-7 w-44 bg-background text-[12.5px]"
        />
      </div>
      <Textarea
        value={draft.body}
        onChange={(e) => onChange({ body: e.target.value })}
        placeholder={"Your sign-off — e.g. Best,\nAlex Rivera"}
        rows={3}
        className="bg-background text-[12.5px]"
      />
      {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
      <EditorActions
        onCancel={onCancel}
        onSave={onSave}
        saving={saving}
        canSave={canSave}
        label="Save signature"
      />
    </div>
  );
}

function SignatureRow({
  signature,
  isOpen,
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
  onDelete,
}: {
  signature: Signature;
  isOpen: boolean;
  draft: SignatureDraft;
  onChange: (patch: Partial<SignatureDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  onDelete: () => void;
}) {
  return (
    <AccordionItem
      value={signature.id}
      className="group relative overflow-hidden rounded-lg border transition-colors last:border-b data-panel-open:border-input data-panel-open:bg-muted/20"
    >
      <AccordionTrigger className="h-10 gap-3 px-3.5 py-0 font-normal hover:bg-muted/40 data-panel-open:bg-transparent">
        <span className="shrink-0 text-[13px] font-medium text-foreground">
          {signature.name}
        </span>
        <span className="mr-7 min-w-0 flex-1 truncate text-[12.5px] font-normal text-muted-foreground/70">
          {signaturePreview(signature.body)}
        </span>
      </AccordionTrigger>
      <Hint label="Delete">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${signature.name}`}
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
          <SignatureEditor
            draft={draft}
            onChange={onChange}
            onSave={onSave}
            onCancel={onCancel}
            saving={saving}
            error={error}
          />
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function SignatureEmptyState({ onNew }: { onNew: () => void }) {
  return (
    <EmptyState
      icon={SignatureIcon}
      title="No signatures yet"
      description="A sign-off appended to your messages. Create one, then assign it to any of your connected accounts below."
      action={
        <Button size="sm" className="gap-1.5" onClick={onNew}>
          <PlusIcon />
          New signature
        </Button>
      }
    />
  );
}

const NEW_SIGNATURE = "__new__";

export function SignaturesPage({ accounts }: { accounts: Account[] }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useSignaturesQuery(true);
  const signatures = data?.signatures ?? [];
  const assignments = data?.assignments ?? {};

  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SignatureDraft>({ name: "", body: "" });
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpenId(null);
    setError(null);
  };
  const openExisting = (s: Signature) => {
    setOpenId(s.id);
    setDraft({ name: s.name, body: s.body });
    setError(null);
  };
  const openNew = () => {
    setOpenId(NEW_SIGNATURE);
    setDraft({ name: "", body: "" });
    setError(null);
  };
  const patchDraft = (patch: Partial<SignatureDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const save = useMutation({
    mutationFn: () =>
      saveSignature({
        id: openId === NEW_SIGNATURE ? undefined : (openId ?? undefined),
        name: draft.name.trim(),
        body: draft.body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activeSignaturesQueryKey() });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeSignature(id),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: activeSignaturesQueryKey() });
      if (openId === id) close();
    },
  });

  const assign = useMutation({
    mutationFn: (vars: { accountId: string; signatureId: string | null }) =>
      assignSignature(vars.accountId, vars.signatureId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: activeSignaturesQueryKey() }),
  });

  return (
    <Page>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {signatures.length === 0 && openId !== NEW_SIGNATURE && !isLoading ? (
            <SignatureEmptyState onNew={openNew} />
          ) : (
            <>
              <div className="flex items-center gap-4 pb-1">
                <h3 className="font-mono text-[10.5px] font-medium tracking-[0.7px] text-muted-foreground/60 uppercase">
                  Your signatures
                </h3>
                <span className="h-px flex-1 bg-border" />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5"
                  onClick={openNew}
                >
                  <PlusIcon />
                  New signature
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {openId === NEW_SIGNATURE && (
                  <div className="overflow-hidden rounded-lg border border-input bg-muted/20">
                    <div className="flex h-10 items-center gap-3 px-3.5">
                      <span className="text-[13px] font-medium text-foreground">
                        {draft.name || "Untitled"}
                      </span>
                      <span className="text-[12.5px] text-muted-foreground/60">
                        New signature
                      </span>
                    </div>
                    <SignatureEditor
                      draft={draft}
                      onChange={patchDraft}
                      onSave={() => save.mutate()}
                      onCancel={close}
                      saving={save.isPending}
                      error={error}
                    />
                  </div>
                )}
                {signatures.length > 0 && (
                  <Accordion
                    multiple={false}
                    value={openId && openId !== NEW_SIGNATURE ? [openId] : []}
                    onValueChange={(value) => {
                      const id = (value as string[])[0];
                      if (!id) return close();
                      const s = signatures.find((x) => x.id === id);
                      if (s) openExisting(s);
                    }}
                    className="flex flex-col gap-2"
                  >
                    {signatures.map((s) => (
                      <SignatureRow
                        key={s.id}
                        signature={s}
                        isOpen={openId === s.id}
                        draft={draft}
                        onChange={patchDraft}
                        onSave={() => save.mutate()}
                        onCancel={close}
                        saving={save.isPending}
                        error={error}
                        onDelete={() => remove.mutate(s.id)}
                      />
                    ))}
                  </Accordion>
                )}
                {isLoading &&
                  signatures.length === 0 &&
                  openId !== NEW_SIGNATURE && <RowSkeleton rows={2} />}
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <div className="flex items-center gap-4 pb-1">
            <h3 className="font-mono text-[10.5px] font-medium tracking-[0.7px] text-muted-foreground/60 uppercase">
              Assigned per account
            </h3>
            <span className="h-px flex-1 bg-border" />
          </div>
          {accounts.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              No connected accounts.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {accounts.map((account) => {
                const currentId = assignments[account.accountId] ?? null;
                const current = signatures.find((s) => s.id === currentId);
                return (
                  <div
                    key={account.accountId}
                    className="flex items-center gap-3 rounded-lg border px-3 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-muted-foreground">
                      {account.email}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-40 shrink-0"
                          />
                        }
                      >
                        <span className="flex-1 truncate text-left">
                          {current ? current.name : "None"}
                        </span>
                        <ChevronDownIcon className="text-muted-foreground/60" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onClick={() =>
                            assign.mutate({
                              accountId: account.accountId,
                              signatureId: null,
                            })
                          }
                        >
                          <span className="text-[13px]">None</span>
                          {!currentId && (
                            <CheckIcon className="ml-auto size-3.5 shrink-0 text-primary" />
                          )}
                        </DropdownMenuItem>
                        {signatures.map((s) => (
                          <DropdownMenuItem
                            key={s.id}
                            onClick={() =>
                              assign.mutate({
                                accountId: account.accountId,
                                signatureId: s.id,
                              })
                            }
                          >
                            <span className="truncate text-[13px]">
                              {s.name}
                            </span>
                            {currentId === s.id && (
                              <CheckIcon className="ml-auto size-3.5 shrink-0 text-primary" />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
