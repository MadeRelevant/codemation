import { type MouseEvent, type ReactNode, useState } from "react";

export function WorkflowCanvasToolbarIconButton(
  args: Readonly<{
    testId: string;
    ariaLabel: string;
    tooltip: string;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
    onAfterClick?: () => void;
    disabled?: boolean;
    children: ReactNode;
    accentColor?: string;
  }>,
) {
  const {
    accentColor = "#111827",
    ariaLabel,
    children,
    disabled = false,
    onAfterClick,
    onClick,
    testId,
    tooltip,
  } = args;
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick(event);
    event.currentTarget.blur();
    onAfterClick?.();
  };
  return (
    <div
      style={{ position: "relative", display: "grid", placeItems: "center" }}
      onPointerEnter={() => setIsTooltipVisible(true)}
      onPointerLeave={() => setIsTooltipVisible(false)}
      onFocusCapture={() => setIsTooltipVisible(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsTooltipVisible(false);
        }
      }}
    >
      <button
        type="button"
        data-testid={testId}
        aria-label={ariaLabel}
        onMouseDown={(event) => {
          if (!disabled) {
            event.preventDefault();
          }
        }}
        onClick={handleClick}
        disabled={disabled}
        style={{
          width: 24,
          height: 24,
          border: "1px solid #d1d5db",
          background: "white",
          color: accentColor,
          display: "grid",
          placeItems: "center",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.45 : 1,
          padding: 0,
          boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
        }}
      >
        {children}
      </button>
      <div
        role="tooltip"
        aria-hidden={!isTooltipVisible}
        style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          left: "50%",
          transform: isTooltipVisible ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(3px)",
          opacity: isTooltipVisible ? 1 : 0,
          transition: "opacity 110ms ease-out, transform 110ms ease-out",
          pointerEvents: "none",
          padding: "6px 8px",
          background: "rgba(15,23,42,0.94)",
          color: "white",
          fontSize: 11,
          fontWeight: 700,
          whiteSpace: "nowrap",
          boxShadow: "0 10px 24px rgba(15,23,42,0.2)",
          zIndex: 40,
        }}
      >
        {tooltip}
      </div>
    </div>
  );
}
