import { UsersScreen } from "@codemation/next-host/src/ui/screens/UsersScreen";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import type { UserAccountDto } from "../src/application/contracts/userDirectoryContracts.types";
import { ApiPaths } from "../src/presentation/http/ApiPaths";

describe("UsersScreen", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator.clipboard", { writeText: vi.fn().mockResolvedValue(undefined) });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderUsersScreen() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <UsersScreen />
      </QueryClientProvider>,
    );
  }

  it("renders table rows for users", async () => {
    const users: UserAccountDto[] = [
      {
        id: "u1",
        email: "one@test.com",
        status: "active",
        inviteExpiresAt: null,
        loginMethods: ["Password", "Google"],
      },
      {
        id: "u2",
        email: "two@test.com",
        status: "invited",
        inviteExpiresAt: "2026-12-31T00:00:00.000Z",
        loginMethods: [],
      },
    ];
    fetchMock.mockResolvedValue({ ok: true, json: async () => users });
    renderUsersScreen();

    await waitFor(() => {
      expect(screen.getByTestId("users-table")).toBeInTheDocument();
    });
    expect(screen.getByTestId("user-email-u1").textContent).toBe("one@test.com");
    expect(screen.getByTestId("user-login-methods-u1").textContent).toBe("Password, Google");
    expect(screen.getByTestId("user-login-methods-u2").textContent).toBe("—");
    expect(screen.getByTestId("user-status-badge-u1").textContent).toBe("active");
    const expiry = screen.getByTestId("user-invite-expires-u2");
    expect(expiry.textContent?.length).toBeGreaterThan(4);
    expect(expiry.textContent).not.toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(screen.getByTestId("user-regenerate-invite-u2")).toBeInTheDocument();
    expect(screen.getByTestId("user-account-status-u1")).toBeInTheDocument();
  });

  it("does not crash when API omits loginMethods (backward compatible)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ id: "legacy", email: "legacy@test.com", status: "active", inviteExpiresAt: null }],
    });
    renderUsersScreen();

    await waitFor(() => {
      expect(screen.getByTestId("users-table")).toBeInTheDocument();
    });
    expect(screen.getByTestId("user-login-methods-legacy").textContent).toBe("—");
  });

  it("opens invite dialog and shows link after successful invite", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: "new",
            email: "invite@example.com",
            status: "invited" as const,
            inviteExpiresAt: "2026-01-01T00:00:00.000Z",
            loginMethods: [],
          },
          inviteUrl: "http://localhost:3000/invite/raw-token-value",
        }),
      })
      .mockResolvedValue({ ok: true, json: async () => [] });
    renderUsersScreen();

    await waitFor(() => expect(screen.getByTestId("users-empty")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("users-invite-open"));
    expect(screen.getByTestId("users-invite-dialog")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("users-invite-email-input"), { target: { value: "invite@example.com" } });

    fireEvent.click(screen.getByTestId("users-invite-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("users-invite-link-field")).toBeInTheDocument();
    });
    expect(screen.getByTestId("users-invite-link-field")).toHaveValue("http://localhost:3000/invite/raw-token-value");
    expect(fetchMock).toHaveBeenCalledWith(
      ApiPaths.userInvites(),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "invite@example.com" }),
      }),
    );
  });

  it("submits invite dialog when the form is submitted (e.g. Enter in email field)", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: "new",
            email: "enter@example.com",
            status: "invited" as const,
            inviteExpiresAt: null,
            loginMethods: [],
          },
          inviteUrl: "http://localhost:3000/invite/from-enter",
        }),
      })
      .mockResolvedValue({ ok: true, json: async () => [] });
    renderUsersScreen();

    await waitFor(() => expect(screen.getByTestId("users-empty")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("users-invite-open"));
    fireEvent.change(screen.getByTestId("users-invite-email-input"), { target: { value: "enter@example.com" } });
    fireEvent.submit(screen.getByTestId("users-invite-form"));

    await waitFor(() => {
      expect(screen.getByTestId("users-invite-link-field")).toHaveValue("http://localhost:3000/invite/from-enter");
    });
  });

  it("regenerate dialog confirms and copies new link", async () => {
    const users: UserAccountDto[] = [
      {
        id: "u-inv",
        email: "inv@test.com",
        status: "invited",
        inviteExpiresAt: "2026-06-01T00:00:00.000Z",
        loginMethods: [],
      },
    ];
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => users })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: users[0],
          inviteUrl: "http://localhost:3000/invite/new-raw-token",
        }),
      })
      .mockResolvedValue({ ok: true, json: async () => users });
    renderUsersScreen();

    await waitFor(() => expect(screen.getByTestId("user-regenerate-invite-u-inv")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("user-regenerate-invite-u-inv"));

    expect(screen.getByTestId("users-regenerate-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("users-regenerate-confirm"));

    await waitFor(() => {
      expect(screen.getByTestId("users-regenerate-link-field")).toBeInTheDocument();
    });
    expect(screen.getByTestId("users-regenerate-link-field")).toHaveValue("http://localhost:3000/invite/new-raw-token");
    expect(fetchMock).toHaveBeenCalledWith(ApiPaths.userInviteRegenerate("u-inv"), expect.objectContaining({ method: "POST" }));
  });

  it("PATCH status when select changes", async () => {
    const users: UserAccountDto[] = [
      { id: "u1", email: "a@test.com", status: "active", inviteExpiresAt: null, loginMethods: ["Password"] },
    ];
    fetchMock.mockResolvedValue({ ok: true, json: async () => users });
    renderUsersScreen();

    await waitFor(() => expect(screen.getByTestId("user-account-status-u1")).toBeInTheDocument());

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...users[0], status: "inactive" as const, loginMethods: ["Password"] }),
    });

    fireEvent.change(screen.getByTestId("user-account-status-u1"), { target: { value: "inactive" } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        ApiPaths.userStatus("u1"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "inactive" }),
        }),
      );
    });
  });
});
