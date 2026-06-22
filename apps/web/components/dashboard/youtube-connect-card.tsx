"use client";

import Link from "next/link";
import { Youtube } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface YouTubeConnectCardProps {
  /**
   * "unconnected" shows the prominent CTA (default — what new users
   * see before OAuth).
   * "connected" collapses to a quiet status line (used in the sidebar
   * footer or as a secondary header element once connected).
   */
  state?: "unconnected" | "connected";
  className?: string;
}

/**
 * Persistent channel-connection card. Per Design.md, channel-connection
 * health is "a persistent element, not buried in settings" — this card
 * sits at the top of the dashboard content area until the user connects,
 * then collapses to a quiet "Connected" line in the sidebar footer.
 *
 * The "Connect your YouTube channel" CTA goes to /youtube-connect (the
 * pre-OAuth explanation page), which is the real page that will
 * eventually launch the OAuth popup.
 */
export function YouTubeConnectCard({
  state = "unconnected",
  className,
}: YouTubeConnectCardProps) {
  if (state === "connected") {
    return (
      <Card className={cn("border-status-ready/30 bg-status-ready/5", className)}>
        <CardContent className="flex items-center gap-3 p-4">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full bg-status-ready"
          />
          <p className="text-sm text-foreground">
            YouTube channel connected. You&apos;re ready to publish.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("border-amber-500/30 bg-amber-500/5", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500"
          />
          <div className="flex-1">
            <CardTitle className="text-base">
              Connect your YouTube channel
            </CardTitle>
            <CardDescription className="mt-1">
              ClipFlow can&apos;t publish until your channel is connected.
              It takes about a minute.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Button asChild>
          <Link href="/youtube-connect">
            <Youtube aria-hidden="true" />
            Connect your channel
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
