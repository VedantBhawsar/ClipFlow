import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangePasswordForm } from "./change-password-form.js";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  })),
}));

vi.mock("@/hooks/use-change-password", () => ({
  useChangePassword: vi.fn(),
}));

import { useChangePassword } from "@/hooks/use-change-password";

const mockUseChangePassword = vi.mocked(useChangePassword);

describe("ChangePasswordForm", () => {
  let mockMutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync = vi.fn().mockResolvedValue(undefined);
    mockUseChangePassword.mockReturnValue({
      mutateAsync: mockMutateAsync,
      mutate: mockMutateAsync,
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useChangePassword>);
  });

  it("renders all three password fields", () => {
    render(<ChangePasswordForm />);
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    expect(screen.getByLabelText(/^New password/)).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
  });

  it("disables submit until all rules pass", () => {
    render(<ChangePasswordForm />);
    expect(
      screen.getByRole("button", { name: /update password/i }),
    ).toBeDisabled();
  });

  it("blocks submission when passwords do not match", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await user.type(screen.getByLabelText("Current password"), "OldPass123");
    await user.type(screen.getByLabelText(/^New password/), "NewPass456");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "Different789",
    );
    expect(
      screen.getByRole("button", { name: /update password/i }),
    ).toBeDisabled();
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
  });

  it("blocks submission when the new password equals the current one", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await user.type(screen.getByLabelText("Current password"), "SamePass123");
    await user.type(screen.getByLabelText(/^New password/), "SamePass123");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "SamePass123",
    );
    expect(
      screen.getByRole("button", { name: /update password/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/must be different from your current one/i),
    ).toBeInTheDocument();
  });

  it("calls the change-password mutation on valid submit", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await user.type(screen.getByLabelText("Current password"), "OldPass123");
    await user.type(screen.getByLabelText(/^New password/), "NewPass456");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "NewPass456",
    );
    await user.click(
      screen.getByRole("button", { name: /update password/i }),
    );
    expect(mockMutateAsync).toHaveBeenCalledWith({
      currentPassword: "OldPass123",
      newPassword: "NewPass456",
    });
  });
});
