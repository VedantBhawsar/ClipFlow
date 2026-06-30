/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The bottom-left "N" indicator is purely a dev affordance; disabling
  // it keeps marketing-page screenshots clean and stops it from
  // overlapping the footer on mobile captures.
  devIndicators: false,
};

export default nextConfig;
