/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_URL || "http://localhost:8000";
const isStatic = process.env.STATIC_EXPORT === "1";

// STATIC_EXPORT=1 builds a self-contained static preview (GitHub Pages) that reads pre-generated
// JSON from public/data instead of calling the API. Otherwise the app runs as a Next.js server
// that proxies /api/* to the backend.
const nextConfig = isStatic
  ? {
      output: "export",
      basePath: process.env.BASE_PATH || "",
      trailingSlash: true,
      images: { unoptimized: true },
      reactStrictMode: true,
    }
  : {
      output: "standalone",
      reactStrictMode: true,
      async rewrites() {
        return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
      },
    };
export default nextConfig;
