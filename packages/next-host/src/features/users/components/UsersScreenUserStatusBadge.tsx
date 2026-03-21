import type { UserAccountStatus } from "@codemation/host-src/application/contracts/userDirectoryContracts.types";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function UsersScreenUserStatusBadge(props: Readonly<{ userId: string; status: UserAccountStatus }>) {
  const { status, userId } = props;
  const className =
    status === "active"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
      : status === "invited"
        ? "border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-200"
        : "text-muted-foreground";
  return (
    <Badge variant="outline" className={cn(className)} data-testid={`user-status-badge-${userId}`}>
      {status}
    </Badge>
  );
}
