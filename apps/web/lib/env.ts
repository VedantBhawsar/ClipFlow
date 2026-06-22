/**
 * Centralized access to NEXT_PUBLIC_* env vars.
 *
 * The actual validation lives in @clipflow/config's loadPublicEnv (the
 * single source of truth shared with apps/api's loadEnv). This module
 * is a thin façade so the rest of the web app imports `env` from one
 * place and can pull additional public vars later without rewiring
 * every call site.
 */
import { loadPublicEnv } from "@clipflow/config";

const publicEnv = loadPublicEnv();

export const env = {
  /**
   * Base URL of the ClipFlow backend API.
   * Defaults to http://localhost:4000 in development.
   */
  apiBaseUrl: publicEnv.NEXT_PUBLIC_API_BASE_URL,
} as const;
