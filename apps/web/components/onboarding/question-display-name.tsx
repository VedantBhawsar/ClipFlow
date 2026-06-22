"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface QuestionDisplayNameProps {
  value: string;
  onChange: (next: string) => void;
  onSkip: () => void;
}

/**
 * Step 1 — channel / display name. Free text and explicitly optional
 * per AppFlow.md ("no free text required — this is the medium tier").
 * A skip button is provided so the user is never forced to invent a
 * value just to advance.
 */
export function QuestionDisplayName({
  value,
  onChange,
  onSkip,
}: QuestionDisplayNameProps) {
  const id = useId();
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={id}>Channel or display name</Label>
        <Input
          id={id}
          type="text"
          autoComplete="off"
          maxLength={80}
          placeholder="What should we call your channel?"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Optional. You can change this any time from Settings.
        </p>
      </div>
      <div>
        <Button type="button" variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}
