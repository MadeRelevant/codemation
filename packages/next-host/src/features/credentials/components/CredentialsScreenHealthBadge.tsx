"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function CredentialsScreenHealthBadge({ status }: { status: string }) {
  const statusLower = status.toLowerCase();
  const isHealthy = statusLower === "healthy";
  const isFailing = statusLower === "failing";
  return (
    <Badge
      variant={isFailing ? "destructive" : "outline"}
      className={cn(
        isHealthy && "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
        !isHealthy && !isFailing && "text-muted-foreground",
      )}
    >
      {status}
    </Badge>
  );
}
