import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The bottom-left "N" indicator is purely a dev affordance; disabling
  // it keeps marketing-page screenshots clean and stops it from
  // overlapping the footer on mobile captures.
  devIndicators: false,
  // `output: "standalone"` and `outputFileTracingRoot` are only for
  // production builds (Docker). In dev mode, Turbopack encounters the
  // standalone config and runs file-tracing eagerly on the entire
  // monorepo root + pnpm store, causing an infinite loop that consumes
  // all available RAM and hangs compilation indefinitely.
  ...(process.env.NODE_ENV === "production" && {
    output: "standalone",
    outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  }),
};

export default nextConfig;
