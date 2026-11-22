import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Brand type (brand guide, "what to use in Google"): Montserrat Regular for
// body text, Medium for subheadings and captions, Bold for titles.
// The font files live in the repo (src/app/fonts, SIL Open Font License), so
// builds never depend on downloading them from Google Fonts.
const montserrat = localFont({
  variable: "--font-montserrat",
  src: [
    { path: "./fonts/montserrat-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/montserrat-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/montserrat-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Iris Music Project",
  description: "The staff and musician app for Iris Music Project.",
  appleWebApp: { title: "Iris", capable: true, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#411F50",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${montserrat.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
