import { InviteLinkCopyRow } from "@codemation/next-host/src/features/users/components/InviteLinkCopyRow";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("InviteLinkCopyRow", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the full URL in a single-line scroll container with a continuity hint", () => {
    const url = "http://localhost:3000/invite/-tzymRmUMJncBfdAfj6k9NifcX_Yp2_2zj5nVzC9vDU";
    render(
      <InviteLinkCopyRow
        url={url}
        copyFeedback={false}
        onCopy={() => {}}
        linkTestId="invite-link-field"
        copyTestId="invite-copy"
      />,
    );

    const field = screen.getByTestId("invite-link-field");
    expect(field).toHaveAttribute("data-invite-link-layout", "single-line-scroll");
    expect(field.textContent).toBe(url);
    expect(field.getAttribute("title")).toMatch(/continuous string/i);
    expect(field.getAttribute("title")).toMatch(/scroll/i);
  });

  it("disables the copy control while showing Copied", () => {
    render(
      <InviteLinkCopyRow
        url="http://localhost/invite/token"
        copyFeedback={true}
        onCopy={() => {}}
        linkTestId="invite-link-field"
        copyTestId="invite-copy"
      />,
    );

    const copyBtn = screen.getByTestId("invite-copy");
    expect(copyBtn).toBeDisabled();
    expect(copyBtn.textContent).toContain("Copied");
  });

  it("invokes onCopy when Copy is clicked while enabled", () => {
    const onCopy = vi.fn();
    render(
      <InviteLinkCopyRow
        url="http://localhost/invite/x"
        copyFeedback={false}
        onCopy={onCopy}
        linkTestId="invite-link-field"
        copyTestId="invite-copy"
      />,
    );

    screen.getByTestId("invite-copy").click();
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});
