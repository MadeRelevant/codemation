"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardChartCard(
  props: Readonly<{
    title: string;
    description?: string;
    children: ReactNode;
    testId: string;
  }>,
) {
  return (
    <Card data-testid={props.testId} className="border-border/60 bg-card/95 shadow-sm">
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        {props.description ? <CardDescription>{props.description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{props.children}</CardContent>
    </Card>
  );
}
