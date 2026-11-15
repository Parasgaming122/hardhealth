import { AppShell } from "@/components/app-shell";
import { AppProviders } from "@/components/app-providers";

export const metadata = { title: "Fictional demo · H.A.R.D", robots: { index: false, follow: false } };

export default function DemoPage() {
  return <AppProviders><AppShell /></AppProviders>;
}
