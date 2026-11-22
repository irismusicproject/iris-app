import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The partner calendar PDF is rendered on the server with @react-pdf.
  // The import spreadsheet (v0.30) is read and written on the server; loading
  // these from node_modules keeps their Node builds (bundling picks a browser one).
  serverExternalPackages: ["@react-pdf/renderer", "read-excel-file", "write-excel-file"],
  // The admin import uploads a spreadsheet through a server action; the default
  // limit is 1 MB. Vercel accepts request bodies up to 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Files the PDF reads at run time, so Vercel includes them.
  outputFileTracingIncludes: {
    "/residencies/[id]/month/[month]/calendar": [
      "./node_modules/@fontsource/montserrat/files/montserrat-latin-*-normal.woff",
      "./public/brand/logo-horizontal-purple.png",
    ],
  },
};

export default nextConfig;
