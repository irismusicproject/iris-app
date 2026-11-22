import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The partner calendar PDF is rendered on the server with @react-pdf.
  serverExternalPackages: ["@react-pdf/renderer"],
  // Files the PDF reads at run time, so Vercel includes them.
  outputFileTracingIncludes: {
    "/residencies/[id]/month/[month]/calendar": [
      "./node_modules/@fontsource/montserrat/files/montserrat-latin-*-normal.woff",
      "./public/brand/logo-horizontal-purple.png",
    ],
  },
};

export default nextConfig;
