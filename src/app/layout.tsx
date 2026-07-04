import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#05060a",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Evacua - Responder Dashboard for Wildfire Operations",
  description:
    "Evacua is a responder dashboard that turns live wildfire, weather, responder, and route data into an operational command surface.",
  metadataBase: new URL("https://evacua.app"),
  openGraph: {
    title: "Evacua - Responder Dashboard",
    description:
      "A live wildfire operations surface for incidents, routes, responders, and alerts.",
    type: "website",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-mode="calm"
      className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--color-bg-oled)] text-[var(--color-text-primary)] font-sans selection:bg-[color-mix(in_oklab,var(--color-cyan)_35%,transparent)]">
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--color-bg-elev)",
              border: "1px solid var(--color-line-subtle)",
              color: "var(--color-text-primary)",
            },
          }}
        />
      </body>
    </html>
  );
}
