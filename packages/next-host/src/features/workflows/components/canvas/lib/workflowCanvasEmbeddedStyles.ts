export const WORKFLOW_CANVAS_EMBEDDED_STYLES = `
        @property --codemation-node-ring-angle {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }

        @keyframes codemationNodeSpin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes codemationNodeBreath {
          0%,
          100% {
            opacity: 0.45;
            transform: scale(0.992);
          }
          45% {
            opacity: 0.92;
            transform: scale(1.018);
          }
          70% {
            opacity: 0.72;
            transform: scale(1.003);
          }
        }

        @keyframes codemationNodeRingRotate {
          from {
            --codemation-node-ring-angle: 0deg;
          }
          to {
            --codemation-node-ring-angle: 360deg;
          }
        }

        @keyframes codemationCanvasLoaderPulse {
          0%,
          100% {
            opacity: 0.45;
            transform: scale(0.9);
          }
          50% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes codemationCanvasLoaderShimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `;
