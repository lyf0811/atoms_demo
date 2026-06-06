const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins,
  distDir: ".next-app",
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
