/**
 * Module declarations for lucide-react sub-path icon imports.
 *
 * lucide-react@0.577 doesn't ship per-icon `.d.ts` files for the ESM
 * dist paths, so TypeScript can't find declarations for deep imports
 * like `lucide-react/dist/esm/icons/check`. Declaring them `any` here
 * lets the build pass until lucide adds proper sub-path exports or
 * we switch to named imports from the package root.
 */

declare module "lucide-react/dist/esm/icons/check" {
  const Check: React.FC<React.SVGProps<SVGSVGElement>>;
  export default Check;
}
declare module "lucide-react/dist/esm/icons/chevron-down" {
  const ChevronDown: React.FC<React.SVGProps<SVGSVGElement>>;
  export default ChevronDown;
}
declare module "lucide-react/dist/esm/icons/chevron-right" {
  const ChevronRight: React.FC<React.SVGProps<SVGSVGElement>>;
  export default ChevronRight;
}
declare module "lucide-react/dist/esm/icons/chevron-up" {
  const ChevronUp: React.FC<React.SVGProps<SVGSVGElement>>;
  export default ChevronUp;
}
declare module "lucide-react/dist/esm/icons/circle-check-big" {
  const CircleCheckBig: React.FC<React.SVGProps<SVGSVGElement>>;
  export default CircleCheckBig;
}
declare module "lucide-react/dist/esm/icons/grip-vertical" {
  const GripVertical: React.FC<React.SVGProps<SVGSVGElement>>;
  export default GripVertical;
}
declare module "lucide-react/dist/esm/icons/minus" {
  const Minus: React.FC<React.SVGProps<SVGSVGElement>>;
  export default Minus;
}
declare module "lucide-react/dist/esm/icons/plus" {
  const Plus: React.FC<React.SVGProps<SVGSVGElement>>;
  export default Plus;
}
declare module "lucide-react/dist/esm/icons/x" {
  const X: React.FC<React.SVGProps<SVGSVGElement>>;
  export default X;
}
