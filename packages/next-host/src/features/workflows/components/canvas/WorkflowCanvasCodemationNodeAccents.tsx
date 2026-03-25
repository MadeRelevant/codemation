import type { CSSProperties } from "react";

export function WorkflowCanvasCodemationNodeAccents(props: Readonly<{
  isActive: boolean;
  isRunning: boolean;
  activityColor: string;
  activityRingStyle: CSSProperties;
  isPropertiesTarget: boolean;
  isActiveForProperties: boolean;
  isSelected: boolean;
  isActiveForSelected: boolean;
}>) {
  const { activityColor, activityRingStyle, isActive, isActiveForProperties, isActiveForSelected, isPropertiesTarget, isRunning, isSelected } = props;
  return (
    <>
      {isActive ? (
        <>
          <div
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: 12,
              pointerEvents: "none",
              boxShadow: `0 0 14px ${activityColor}33, 0 0 28px ${activityColor}22`,
              opacity: isRunning ? 0.85 : 0.48,
              animation: isRunning ? "codemationNodeBreath 2.2s ease-in-out infinite" : "none",
            }}
          />
          <div
            aria-hidden
            style={activityRingStyle}
          />
        </>
      ) : null}
      {isPropertiesTarget ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 2,
            borderRadius: 6,
            pointerEvents: "none",
            border: "2px solid #7c3aed",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.78)",
            opacity: isActiveForProperties ? 0.92 : 1,
          }}
        />
      ) : null}
      {isSelected ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 4,
            borderRadius: 5,
            pointerEvents: "none",
            border: "2px dashed #f59e0b",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.85)",
            opacity: isActiveForSelected ? 0.95 : 1,
          }}
        />
      ) : null}
    </>
  );
}
