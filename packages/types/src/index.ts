/**
 * @clipflow/types
 *
 * Shared DTOs and enums between apps/web (Next.js) and apps/api (Express).
 * Kept dependency-free so it can be consumed by both runtimes without dragging
 * Node-only or DOM-only types into the other.
 */

// ---------- Enums (mirror Prisma enums in packages/db) ----------

export const CONTENT_NICHES = [
  "GAMING",
  "TECH_EDUCATION",
  "VLOG_LIFESTYLE",
  "BUSINESS_FINANCE",
  "ENTERTAINMENT_COMEDY",
  "OTHER",
] as const;
export type ContentNiche = (typeof CONTENT_NICHES)[number];

export const UPLOAD_FREQUENCIES = [
  "ONE_TO_FOUR",
  "FIVE_TO_TEN",
  "ELEVEN_TO_TWENTY",
  "TWENTY_PLUS",
] as const;
export type UploadFrequency = (typeof UPLOAD_FREQUENCIES)[number];

export const PRIMARY_GOALS = [
  "SAVE_TIME_EDITING",
  "BETTER_THUMBNAILS_CTR",
  "CONSISTENT_SCHEDULE",
  "GROW_VIEWS",
] as const;
export type PrimaryGoal = (typeof PRIMARY_GOALS)[number];

export const AUTH_PROVIDERS = ["EMAIL", "GOOGLE"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

// ---------- Auth ----------

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  authProvider: AuthProvider;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export interface MeResponse {
  user: AuthUser;
  profile: UserProfile | null;
  onboardingCompleted: boolean;
}

// ---------- Onboarding ----------

export interface UserProfile {
  id: string;
  displayName: string | null;
  niche: ContentNiche | null;
  uploadFrequency: UploadFrequency | null;
  primaryGoal: PrimaryGoal | null;
  recommendedPlanId: string | null;
  onboardingCompletedAt: string | null;
}

export interface UpdateProfileRequest {
  displayName?: string;
  niche: ContentNiche;
  uploadFrequency: UploadFrequency;
  primaryGoal: PrimaryGoal;
}

export interface OnboardingStatusResponse {
  completed: boolean;
  profile: UserProfile | null;
}

// ---------- Errors ----------

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}