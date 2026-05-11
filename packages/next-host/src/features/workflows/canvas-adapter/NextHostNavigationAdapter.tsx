"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { NavigationAdapter } from "@codemation/canvas";
import { WorkflowDetailUrlCodec, type WorkflowDetailUrlLocation } from "@codemation/canvas";

export function useNextHostNavigationAdapter(): NavigationAdapter {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlLocation = useMemo(() => WorkflowDetailUrlCodec.parseSearchParams(searchParams), [searchParams]);
  const navigateToLocation = useCallback(
    (location: WorkflowDetailUrlLocation) => {
      const href = WorkflowDetailUrlCodec.buildHref(pathname, searchParams, location);
      router.replace(href);
    },
    [pathname, router, searchParams],
  );
  return useMemo(() => ({ urlLocation, navigateToLocation }), [urlLocation, navigateToLocation]);
}
