import type { JSX } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { NodeInspectorSectionNavigationModel } from "../../lib/workflowDetail/NodeInspectorTelemetryPresenter";

export class NodePropertiesSectionNavigationButtons {
  static render(
    args: Readonly<{
      sectionId: string;
      navigation: NodeInspectorSectionNavigationModel;
      onSelectInvocation?: (invocationId: string) => void;
    }>,
  ): JSX.Element {
    const { sectionId, navigation, onSelectInvocation } = args;
    return (
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid={`node-properties-section-prev-${sectionId}`}
          disabled={navigation.prev === null}
          aria-disabled={navigation.prev === null ? "true" : undefined}
          className="h-6 w-6"
          onClick={() => {
            if (navigation.prev) {
              onSelectInvocation?.(navigation.prev.invocationId);
            }
          }}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid={`node-properties-section-next-${sectionId}`}
          disabled={navigation.next === null}
          aria-disabled={navigation.next === null ? "true" : undefined}
          className="h-6 w-6"
          onClick={() => {
            if (navigation.next) {
              onSelectInvocation?.(navigation.next.invocationId);
            }
          }}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    );
  }
}
