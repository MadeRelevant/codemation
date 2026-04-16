"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardMetricCard(
  props: Readonly<{
    title: string;
    value: string;
    description?: string;
    badge?: ReactNode;
    testId: string;
  }>,
) {
  return (
    <Card size="sm" data-testid={props.testId} className="border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardDescription>{props.title}</CardDescription>
            <CardTitle className="mt-1 text-2xl font-semibold tracking-tight">{props.value}</CardTitle>
          </div>
          {props.badge}
        </div>
      </CardHeader>
      {props.description ? (
        <CardContent className="pt-0 text-xs text-muted-foreground">{props.description}</CardContent>
      ) : null}
    </Card>
  );
}
