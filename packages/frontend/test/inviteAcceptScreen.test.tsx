import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiPaths } from "../src/presentation/http/ApiPaths";
import { InviteAcceptScreen } from "../src/ui/screens/InviteAcceptScreen";

describe("InviteAcceptScreen", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows invalid state when verify returns not valid", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ valid: false }),
    });
    render(<InviteAcceptScreen inviteToken="t1" />);

    await waitFor(() => {
      expect(screen.getByTestId("invite-accept-invalid")).toBeInTheDocument();
    });
    expect(screen.getByTestId("invite-accept-invalid-title").textContent).toContain("invalid");
    expect(screen.getByTestId("invite-accept-back-to-login").getAttribute("href")).toBe("/login");
    expect(fetchMock).toHaveBeenCalledWith(
      `${ApiPaths.userInviteVerify()}?token=${encodeURIComponent("t1")}`,
      expect.anything(),
    );
  });

  it("submits accept and shows success", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true, email: "join@example.com" }),
      })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    render(<InviteAcceptScreen inviteToken="secret-token" />);

    await waitFor(() => {
      expect(screen.getByTestId("invite-accept-form")).toBeInTheDocument();
    });
    expect(screen.getByTestId("invite-accept-email").textContent).toBe("join@example.com");

    fireEvent.change(screen.getByTestId("invite-accept-password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByTestId("invite-accept-confirm-password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByTestId("invite-accept-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("invite-accept-done")).toBeInTheDocument();
    });

    const login = screen.getByTestId("invite-accept-login");
    expect(login.getAttribute("href")).toBe("/login");
    expect(login.textContent).toContain("Log in");

    expect(fetchMock).toHaveBeenLastCalledWith(
      ApiPaths.userInviteAccept(),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "secret-token", password: "password123" }),
      }),
    );
  });

  it("clears validation error when password field meets rules after a failed submit", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true, email: "join@example.com" }),
    });
    render(<InviteAcceptScreen inviteToken="t" />);

    await waitFor(() => expect(screen.getByTestId("invite-accept-form")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("invite-accept-password"), { target: { value: "short" } });
    fireEvent.change(screen.getByTestId("invite-accept-confirm-password"), { target: { value: "short" } });
    fireEvent.click(screen.getByTestId("invite-accept-submit"));

    expect(screen.getByTestId("invite-accept-error").textContent).toMatch(/at least 8/i);

    fireEvent.change(screen.getByTestId("invite-accept-password"), { target: { value: "longenough" } });

    expect(screen.queryByTestId("invite-accept-error")).not.toBeInTheDocument();
  });

  it("clears mismatch error when confirm field is corrected", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true, email: "join@example.com" }),
    });
    render(<InviteAcceptScreen inviteToken="t" />);

    await waitFor(() => expect(screen.getByTestId("invite-accept-form")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("invite-accept-password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByTestId("invite-accept-confirm-password"), { target: { value: "other" } });
    fireEvent.click(screen.getByTestId("invite-accept-submit"));

    expect(screen.getByTestId("invite-accept-error").textContent).toMatch(/not match/i);

    fireEvent.change(screen.getByTestId("invite-accept-confirm-password"), { target: { value: "password123" } });

    expect(screen.queryByTestId("invite-accept-error")).not.toBeInTheDocument();
  });

  it("shows validation error when passwords differ", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true, email: "join@example.com" }),
    });
    render(<InviteAcceptScreen inviteToken="t" />);

    await waitFor(() => expect(screen.getByTestId("invite-accept-form")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("invite-accept-password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByTestId("invite-accept-confirm-password"), { target: { value: "other" } });
    fireEvent.click(screen.getByTestId("invite-accept-submit"));

    expect(screen.getByTestId("invite-accept-error").textContent).toMatch(/not match/i);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("accept")).length).toBe(0);
  });

  it("submits on Enter from the form", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true, email: "join@example.com" }),
      })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    render(<InviteAcceptScreen inviteToken="tok" loginHref="/login" />);

    await waitFor(() => expect(screen.getByTestId("invite-accept-password-form")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("invite-accept-password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByTestId("invite-accept-confirm-password"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByTestId("invite-accept-password-form"));

    await waitFor(() => {
      expect(screen.getByTestId("invite-accept-done")).toBeInTheDocument();
    });
  });

  it("shows zxcvbn strength meter when password is non-empty", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true, email: "join@example.com" }),
    });
    render(<InviteAcceptScreen inviteToken="t" />);

    await waitFor(() => expect(screen.getByTestId("invite-accept-form")).toBeInTheDocument());
    expect(screen.queryByTestId("invite-accept-password-strength")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("invite-accept-password"), { target: { value: "longer-unique-phrase-2026" } });

    await waitFor(() => {
      expect(screen.getByTestId("invite-accept-password-strength-label").textContent?.length).toBeGreaterThan(0);
    });
  });
});
