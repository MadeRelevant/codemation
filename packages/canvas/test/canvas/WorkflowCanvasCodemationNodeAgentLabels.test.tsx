// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowCanvasCodemationNodeAgentLabels } from "../../src/canvas/WorkflowCanvasCodemationNodeAgentLabels";

describe("WorkflowCanvasCodemationNodeAgentLabels", () => {
  it("renders LLM chip when hasLanguageModel is true", () => {
    render(<WorkflowCanvasCodemationNodeAgentLabels agentAttachments={{ hasLanguageModel: true, hasTools: false }} />);
    expect(screen.getByTestId("canvas-agent-chip-languageModel")).toBeInTheDocument();
    expect(screen.queryByTestId("canvas-agent-chip-tools")).toBeNull();
  });

  it("renders Tools chip when hasTools is true", () => {
    render(<WorkflowCanvasCodemationNodeAgentLabels agentAttachments={{ hasLanguageModel: false, hasTools: true }} />);
    expect(screen.getByTestId("canvas-agent-chip-tools")).toBeInTheDocument();
    expect(screen.queryByTestId("canvas-agent-chip-languageModel")).toBeNull();
  });

  it("renders both chips when both flags are true", () => {
    render(<WorkflowCanvasCodemationNodeAgentLabels agentAttachments={{ hasLanguageModel: true, hasTools: true }} />);
    expect(screen.getByTestId("canvas-agent-chip-languageModel")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-agent-chip-tools")).toBeInTheDocument();
  });

  it("renders no chips when both flags are false", () => {
    render(<WorkflowCanvasCodemationNodeAgentLabels agentAttachments={{ hasLanguageModel: false, hasTools: false }} />);
    expect(screen.queryByTestId("canvas-agent-chip-languageModel")).toBeNull();
    expect(screen.queryByTestId("canvas-agent-chip-tools")).toBeNull();
  });
});
