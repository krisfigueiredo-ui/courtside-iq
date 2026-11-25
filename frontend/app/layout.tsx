import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { Shell } from "@/components/shell/Shell";

import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "COURTSIDE IQ", template: "%s · COURTSIDE IQ" },
  description: "NBA and college basketball intelligence: live games, model projections against the market, player research and an accountable forecast record.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0A0B0D" },
    { media: "(prefers-color-scheme: light)", color: "#F2F2EF" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Applies the saved (or system) theme before first paint, so there is no flash of the wrong theme.
const themeBootstrap = `(function(){try{var s=JSON.parse(localStorage.getItem('courtside-prefs')||'{}');var t=(s.state&&s.state.theme)||'system';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','dark')}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="font-sans">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
