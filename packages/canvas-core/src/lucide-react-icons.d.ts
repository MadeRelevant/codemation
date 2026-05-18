"use client";
/**
 * Type declarations for lucide-react deep icon imports.
 * This allows TypeScript to recognize the ESM icon module imports.
 */

declare module "lucide-react/dist/esm/icons/*" {
  import type React from "react";

  interface IconProps {
    size?: number | string;
    color?: string;
    strokeWidth?: number | string;
    absoluteStrokeWidth?: boolean;
    className?: string;
    [key: string]: any;
  }

  const icon: React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>;
  export default icon;
}
