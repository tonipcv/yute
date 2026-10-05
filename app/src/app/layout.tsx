import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://yute.dev"),
  title: {
    default: "yute",
    template: "%s",
  },
  description: "A data router for developers. Live web search first, validated before delivery.",
  openGraph: {
    type: "website",
    siteName: "yute",
    title: "yute",
    description: "A data router for developers. Live web search first, validated before delivery.",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "yute",
    description: "A data router for developers.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = { themeColor: "#f6f6f1" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
