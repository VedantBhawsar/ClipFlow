import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/use-sign-up", () => ({
  useSignUp: vi.fn(),
}));

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    refresh: mockRefresh,
  })),
}));

import { SignUpForm } from "./signup-form.js";
import { useSignUp } from "@/hooks/use-sign-up";

const mockUseSignUp = vi.mocked(useSignUp);

describe("SignUpForm", () => {
  const mockMutateAsync = vi.fn().mockResolvedValue({});

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSignUp.mockReturnValue({
      mutateAsync: mockMutateAsync,
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useSignUp>);
  });

  it("renders sign up form with all fields", () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText(/Name \(optional\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("shows password requirement hints", () => {
    render(<SignUpForm />);
    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    expect(screen.getByText("Contains a letter")).toBeInTheDocument();
    expect(screen.getByText("Contains a number")).toBeInTheDocument();
  });

  it("highlights met password requirements as user types", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    const passwordInput = screen.getByLabelText("Password");
    await user.type(passwordInput, "ValidPass1");

    expect(screen.getByText("At least 8 characters").closest("li")).toHaveClass("text-foreground");
    expect(screen.getByText("Contains a letter").closest("li")).toHaveClass("text-foreground");
    expect(screen.getByText("Contains a number").closest("li")).toHaveClass("text-foreground");
  });

  it("shows validation error for invalid email", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
  });

  it("shows validation error for password without letter", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Password"), "12345678");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Password must contain a letter.")).toBeInTheDocument();
  });

  it("shows validation error for password without number", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Password"), "PasswordOnly");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Password must contain a number.")).toBeInTheDocument();
  });

  it("shows validation error when passwords do not match", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Password"), "Password123");
    await user.type(screen.getByLabelText("Confirm password"), "DifferentPass123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument();
  });

  it("calls signUp mutation with correct values on submit", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText(/Name \(optional\)/i), "John Doe");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "Password123");
    await user.type(screen.getByLabelText("Confirm password"), "Password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(mockMutateAsync).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "Password123",
      name: "John Doe",
    });
  });

  it("omits name from signUp when field is empty", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "Password123");
    await user.type(screen.getByLabelText("Confirm password"), "Password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(mockMutateAsync).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "Password123",
    });
  });

  it("navigates to /onboarding/profile after successful sign-up", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "Password123");
    await user.type(screen.getByLabelText("Confirm password"), "Password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await vi.waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/onboarding/profile");
    });
  });

  it("displays server error message when signUp throws", async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockRejectedValue(new Error("Email already in use"));
    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Email"), "existing@example.com");
    await user.type(screen.getByLabelText("Password"), "Password123");
    await user.type(screen.getByLabelText("Confirm password"), "Password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email already in use");
  });

  it("has link to sign in page", () => {
    render(<SignUpForm />);
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "/signin");
  });
});