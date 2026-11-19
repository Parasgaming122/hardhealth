import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";
import { SetupBanner } from "@/components/setup-banner";

export const metadata: Metadata = {
  title: "H.A.R.D — Your care, accounted for",
  description:
    "A healthcare-finance prototype that makes every cost visible and every issued document traceable.",
  icons: { icon: "/hard-mark.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <SetupBanner />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
