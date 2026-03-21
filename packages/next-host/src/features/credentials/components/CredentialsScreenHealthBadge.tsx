"use client";

export function CredentialsScreenHealthBadge({ status }: { status: string }) {
  const statusLower = status.toLowerCase();
  const variant =
    statusLower === "healthy"
      ? "healthy"
      : statusLower === "failing"
        ? "failing"
        : "unknown";
  return (
    <span className={`credentials-table__badge credentials-table__badge--${variant}`}>
      {status}
    </span>
  );
}
