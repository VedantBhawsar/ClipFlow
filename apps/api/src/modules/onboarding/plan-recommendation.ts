/**
 * Plan recommendation logic.
 *
 * Maps the `uploadFrequency` answer to a recommended plan id, surfaced
 * later on the billing screen as a soft suggestion (never auto-applied).
 * Keep this in its own file so the billing slice can import it directly
 * without pulling in the rest of the onboarding module.
 */
import type { UploadFrequency } from "@clipflow/types";

/**
 * Map upload frequency to a recommended plan id.
 *
 *   ONE_TO_FOUR         -> "starter"
 *   FIVE_TO_TEN         -> "creator"
 *   ELEVEN_TO_TWENTY    -> "creator"
 *   TWENTY_PLUS         -> "pro"
 *
 * @param frequency The validated `UploadFrequency` value.
 * @returns The plan id to suggest on the billing screen.
 */
export const recommendPlan = (frequency: UploadFrequency): string => {
  switch (frequency) {
    case "ONE_TO_FOUR":
      return "starter";
    case "FIVE_TO_TEN":
    case "ELEVEN_TO_TWENTY":
      return "creator";
    case "TWENTY_PLUS":
      return "pro";
  }
};
