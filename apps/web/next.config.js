import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The bottom-left "N" indicator is purely a dev affordance; disabling
  // it keeps marketing-page screenshots clean and stops it from
  // overlapping the footer on mobile captures.
  devIndicators: false,
  // `output: "standalone"` is what apps/web/Dockerfile's runtime stage
  // relies on — it produces apps/web/.next/standalone/apps/web/server.js,
  // a self-contained bundle that only needs node at runtime. Required
  // for the Turborepo Docker build to land on a slim image; without it
  // the `COPY --from=build /app/apps/web/.next/standalone ./` layer is
  // empty and the CMD has no entrypoint.
  output: "standalone",
  // The Next app lives at apps/web/ inside the Turborepo root. Without
  // this, Next.js's file tracer only looks downward from apps/web/ and
  // misses the @clipflow/config + @clipflow/types workspace packages
  // (which sit one level up at packages/*/). Symptom of getting this
  // wrong: the build succeeds but the runtime throws
  // `ERR_MODULE_NOT_FOUND` on `@clipflow/<pkg>` because the standalone
  // bundle omitted the package's dist/ output.
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
};

export default nextConfig;
