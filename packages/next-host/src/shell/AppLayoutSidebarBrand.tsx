"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useWhitelabel } from "../providers/WhitelabelProvider";

export function AppLayoutSidebarBrand(args: Readonly<{ collapsed: boolean }>): ReactNode {
  const { productName, logoUrl } = useWhitelabel();
  return (
    <Link
      href="/"
      className="flex min-w-0 max-w-full items-center gap-2 text-lg font-semibold text-sidebar-foreground no-underline hover:text-primary"
      data-testid="sidebar-brand"
    >
      {logoUrl !== null ? (
        <img
          src={logoUrl}
          alt=""
          width={32}
          height={32}
          className={args.collapsed ? "size-8 shrink-0 object-contain" : "size-8 shrink-0 object-contain"}
          data-testid="sidebar-whitelabel-logo"
        />
      ) : null}
      {!args.collapsed ? (
        <span className="min-w-0 truncate" data-testid="sidebar-whitelabel-product-name">
          {productName}
        </span>
      ) : null}
    </Link>
  );
}
