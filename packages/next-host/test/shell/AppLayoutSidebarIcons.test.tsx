// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  IconChevronLeft,
  IconChevronRight,
  IconCollections,
  IconCredentials,
  IconDashboard,
  IconUsers,
  IconWorkflow,
} from "../../src/shell/appLayoutSidebarIcons";

describe("appLayoutSidebarIcons", () => {
  it("renders IconDashboard", () => {
    const { container } = render(<IconDashboard />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders IconCredentials", () => {
    const { container } = render(<IconCredentials />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders IconChevronLeft", () => {
    const { container } = render(<IconChevronLeft />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders IconChevronRight", () => {
    const { container } = render(<IconChevronRight />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders IconWorkflow", () => {
    const { container } = render(<IconWorkflow />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders IconCollections", () => {
    const { container } = render(<IconCollections />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders IconUsers", () => {
    const { container } = render(<IconUsers />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
