import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The partner calendar PDF is rendered on the server with @react-pdf.
  // The import spreadsheet (v0.30) is read and written on the server; loading
  // these from node_modules keeps their Node builds (bundling picks a browser one).
  serverExternalPackages: ["@react-pdf/renderer", "read-excel-file", "write-excel-file"],
  // The admin import uploads a spreadsheet through a server action; the default
  // limit is 1 MB. Vercel accepts request bodies up to 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Files every PDF reads at run time, so Vercel includes them. pdfkit (under
  // @react-pdf) loads its built-in fonts through a package alias
  // ("#standard-fonts/Helvetica") that the file tracer doesn't follow; without
  // them, musician, custom and partner invoice PDFs and sending the calendar
  // (phone and website) failed on Vercel with "Cannot find module
  // .../pdfkit/js/standard-fonts/Helvetica.cjs", and the crash could take
  // other requests on the same instance with it. Our font and logo are read
  // by path, which the tracer can't see either. "/**" covers every route,
  // including PDFs added later; it adds about 1 MB per function.
  outputFileTracingIncludes: {
    "/**": [
      // Recursive: Helvetica.cjs loads ./chunks/standardGlyphNames-*.cjs, and
      // pdfkit reads data/ by path too (about 0.8 MB together).
      "./node_modules/pdfkit/js/standard-fonts/**",
      "./node_modules/pdfkit/js/data/**",
      "./node_modules/@fontsource/montserrat/files/montserrat-latin-*-normal.woff",
      "./public/brand/logo-horizontal-purple.png",
    ],
  },
};

export default nextConfig;
