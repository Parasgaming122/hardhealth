import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SetupBanner } from "@/components/setup-banner";

// SEO (S14): resolve the public site URL once so OG/Twitter/canonical URLs are
// absolute on every deployment. Order mirrors lib/auth/trusted-origin.ts:
// explicit site URL first, then the Vercel production/host aliases.
function publicSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit;
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) return `https://${vercelProd}`;
  const vercelHost = process.env.VERCEL_URL ?? process.env.VERCEL_BRANCH_URL;
  if (vercelHost) return `https://${vercelHost}`;
  return "http://localhost:3000";
}

const siteUrl = publicSiteUrl();
const title = "H.A.R.D — Your care, accounted for";
const description =
  "A healthcare-finance prototype that makes every cost visible and every issued document traceable.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s · H.A.R.D",
  },
  description,
  applicationName: "H.A.R.D",
  icons: { icon: "/hard-mark.svg" },
  openGraph: {
    type: "website",
    siteName: "H.A.R.D",
    title,
    description,
    url: "/",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#059669",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <SetupBanner />
        {children}
      </body>
    </html>
  );
}
