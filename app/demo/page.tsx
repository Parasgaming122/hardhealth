import { AppShell } from "@/components/app-shell";
import { AppProviders } from "@/components/app-providers";

// S14: the demo context provider now lives with the demo route instead of the
// root layout, so /login, /signup, the role workspaces and the landing page
// stop shipping the demo store and its seed data in their client bundles.
export const metadata = { title: "Fictional demo", robots: { index: false, follow: false } };

export default function DemoPage() {
  return <AppProviders><AppShell /></AppProviders>;
}
