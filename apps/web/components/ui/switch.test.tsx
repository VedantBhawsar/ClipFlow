import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "./switch.js";

describe("Switch", () => {
  it("renders with role=switch and the right aria-checked state", () => {
    render(<Switch checked={true} onCheckedChange={() => {}} label="Notify me" />);
    const el = screen.getByRole("switch", { name: "Notify me" });
    expect(el).toHaveAttribute("aria-checked", "true");
  });

  it("calls onCheckedChange with the flipped value on click", async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onChange} label="Toggle" />);
    const el = screen.getByRole("switch", { name: "Toggle" });
    await userEvent.setup().click(el);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("respects the disabled prop", async () => {
    const onChange = vi.fn();
    render(
      <Switch
        checked={false}
        onCheckedChange={onChange}
        label="Disabled"
        disabled
      />,
    );
    const el = screen.getByRole("switch", { name: "Disabled" });
    expect(el).toBeDisabled();
    await userEvent.setup().click(el);
    expect(onChange).not.toHaveBeenCalled();
  });
});
