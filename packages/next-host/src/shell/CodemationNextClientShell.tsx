import type { ReactNode } from "react";
import { Providers } from "../providers/Providers";

import { CodemationWebsocketPublicPortReader } from "./CodemationWebsocketPublicPortReader";
import type { DehydratedState } from "@tanstack/react-query";

const codemationWebsocketPublicPortReader = new CodemationWebsocketPublicPortReader();

export interface CodemationNextClientShellProps {
  readonly children: ReactNode;
  readonly dehydratedState?: DehydratedState;
}

export function CodemationNextClientShell(args: CodemationNextClientShellProps): ReactNode {
  return (
    <Providers websocketPort={codemationWebsocketPublicPortReader.read()} dehydratedState={args.dehydratedState}>
      {args.children}
    </Providers>
  );
}
