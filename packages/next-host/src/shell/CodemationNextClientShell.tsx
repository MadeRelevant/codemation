import type { ReactNode } from "react";
import { Providers } from "../providers/Providers";

export interface CodemationNextClientShellProps {
  readonly children: ReactNode;
}

export function CodemationNextClientShell(args: CodemationNextClientShellProps): ReactNode {
  return (
    <Providers websocketPort={process.env.CODEMATION_PUBLIC_WS_PORT ?? process.env.NEXT_PUBLIC_CODEMATION_WS_PORT}>
      {args.children}
    </Providers>
  );
}
