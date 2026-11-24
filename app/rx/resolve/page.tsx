import { AppShell } from "@/components/app-shell";
import { AppProviders } from "@/components/app-providers";

// S14: page metadata (previously this public token-resolution page had none).
// noindex keeps scanned-token URLs out of search results.
export const metadata = { title: "Resolve a prescription", robots: { index: false, follow: false } };

export default function PrescriptionResolvePage() {
  return <AppProviders><AppShell /></AppProviders>;
}
