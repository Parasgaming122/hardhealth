import { seedDemoData } from "@/lib/mock-data";
import { AppProviders } from "@/components/app-providers";
import LabVerificationView from "./lab-verification-view";

export const metadata = { title: "Verify a lab report", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return seedDemoData.labReports.map((report) => ({ token: report.token }));
}

export default async function LabVerificationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AppProviders><LabVerificationView token={token} /></AppProviders>;
}
