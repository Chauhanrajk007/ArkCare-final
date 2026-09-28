"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * A proper inline input field that replaces the native window.prompt popup.
 * Used for mission responses that need a written note (Need Help / Not done).
 */
export default function PromptDialog({
  open,
  title,
  description,
  placeholder,
  confirmLabel = "Submit",
  required = false,
  onCancel,
  onConfirm,
}) {
  const [value, setValue] = useState("");

  function close() {
    setValue("");
    onCancel?.();
  }

  function confirm() {
    if (required && !value.trim()) return;
    onConfirm(value);
    setValue("");
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <Textarea
          rows={4}
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={required && !value.trim()}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
