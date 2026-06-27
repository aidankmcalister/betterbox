import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Prompt for a custom fill-in field name — the shadcn replacement for the old
 *  window.prompt. Returns a slug (lowercased, spaces → underscores). */
export function FieldNameDialog({
  open,
  onOpenChange,
  defaultValue = "",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValue?: string;
  onSubmit: (slug: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  const slug = value.trim().toLowerCase().replace(/\s+/g, "_");
  const submit = () => {
    if (slug) onSubmit(slug);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border border-input">
        <DialogHeader>
          <DialogTitle>Fill-in field</DialogTitle>
          <DialogDescription>
            Name a blank you'll Tab through and fill in when sending.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="e.g. company"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!slug}>
            Add field
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
