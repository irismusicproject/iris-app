import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

// Brand type (brand guide, "what to use in Google"): Montserrat Regular for
// body text, Medium for subheadings and captions, Bold for titles.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
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
