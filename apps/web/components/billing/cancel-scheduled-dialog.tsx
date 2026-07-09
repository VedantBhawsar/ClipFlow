"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCancelScheduled } from "@/hooks/use-cancel-scheduled";

interface CancelScheduledDialogProps {
  planName?: string;
  periodEnd?: string | null;
}

export function CancelScheduledDialog({ planName, periodEnd }: CancelScheduledDialogProps) {
  const [open, setOpen] = useState(false);
  const cancelMutation = useCancelScheduled();

  const handleCancel = async () => {
    await cancelMutation.mutateAsync();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-red-500 hover:text-red-600">
          Cancel subscription
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {planName ?? "your"} subscription?</DialogTitle>
          <DialogDescription>
            Your subscription stays active until{" "}
            {periodEnd
              ? new Date(periodEnd).toLocaleDateString()
              : "the end of the billing period"}
            . You can re-enable anytime from this page.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Keep subscription
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending ? "Canceling…" : "Cancel subscription"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}