import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

/**
 * Owner feedback 2026-11-21: "switching between [workspace] pages changes
 * nothing (i think they are the same)". These render tests pin the fix — each
 * section of each workspace panel renders DISTINCT content, and the page
 * everyone complained about (the prescription/resolve/report tool) no longer
 * appears on the pages it does not belong to.
 */

// The doctor panel calls useRouter() for repeat/amend navigation.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
}));

import { RealDoctorPanel } from "@/components/real-doctor-panel";
import { RealFrontDeskPanel } from "@/components/real-front-desk-panel";
import { RealPharmacyPanel } from "@/components/real-pharmacy-panel";
import { RealLabPanel } from "@/components/real-lab-panel";

const patients = [
  { id: "p1", healthId: "HARD-000102", fullName: "Amna Siddiqui", cnic: "4210112345671", dob: null, bloodGroup: "O+", createdAt: "2026-11-01T10:00:00Z", phone: "03001234567", email: "amna@example.com", hasAccount: true },
  { id: "p2", healthId: "HARD-000103", fullName: "Bilal Ahmed", cnic: "4210123456782", dob: null, bloodGroup: "A+", createdAt: "2026-11-02T10:00:00Z", phone: "03007654321", email: null, hasAccount: false },
];

const recentRx = [
  {
    id: "rx1", code: "RX-ABCD-1234", status: "active", issuedAt: "2026-11-20T09:00:00Z",
    consultationCost: 3500, note: null, patientId: "p1", patientName: "Amna Siddiqui",
    patientHealthId: "HARD-000102", version: 1, supersedesCode: null,
    items: [{ medicine: "Paracetamol", strength: "500mg", dose: "1", frequency: "OD", duration: "5d", quantity: 5 }],
  },
];

function html(el: React.ReactElement) {
  return renderToString(el);
}

describe("doctor workspace — four DISTINCT pages", () => {
  const props = { patients, recentPrescriptions: recentRx, templates: [], doctorName: "Dr. Test", providerName: "Cedar Medical" };

  it("overview shows the dashboard, NOT the prescription composer", () => {
    const h = html(<RealDoctorPanel {...props} section="Today" />);
    expect(h).toContain("Doctor quick actions");
    expect(h).toContain("Latest prescriptions");
    expect(h).not.toContain("Digital prescription tool");
  });

  it("patient history shows the directory only", () => {
    const h = html(<RealDoctorPanel {...props} section="Patient history" />);
    expect(h).toContain("Patient clinical directory");
    expect(h).not.toContain("Digital prescription tool");
  });

  it("new prescription is the ONLY page with the composer", () => {
    const h = html(<RealDoctorPanel {...props} section="New prescription" />);
    expect(h).toContain("Digital prescription tool");
  });

  it("prescriptions page shows the history list, NOT the composer", () => {
    const h = html(<RealDoctorPanel {...props} section="Recent prescriptions" />);
    expect(h).toContain("Recent prescriptions");
    expect(h).toContain("RX-ABCD-1234");
    expect(h).not.toContain("Digital prescription tool");
  });
});

describe("front desk workspace — four DISTINCT pages + navigation tabs", () => {
  const collections = [
    {
      invoiceId: "inv1", receiptNo: "HARD-R-00103", patientName: "Bilal Ahmed", healthId: "HARD-000103",
      invoiceType: "registration", amount: 500, providerShare: 150, platformShare: 350,
      paymentMethod: "cash", status: "paid", date: new Date().toISOString(),
    },
  ];
  const props = { patients, collections, config: { registrationFee: 500, providerSharePercent: 30 } };

  it("overview shows quick actions + latest registrations, not the form", () => {
    const h = html(<RealFrontDeskPanel {...props} section="Overview" />);
    expect(h).toContain("Front desk quick actions");
    expect(h).not.toContain("Patient desk registration");
  });

  it("register page shows the validated form with the email field", () => {
    const h = html(<RealFrontDeskPanel {...props} section="Register patient" />);
    expect(h).toContain("Patient desk registration");
    expect(h).toContain('id="fd-email"');
    expect(h).toContain('id="fd-phone"');
  });

  it("directory page shows the table with email + portal-link columns", () => {
    const h = html(<RealFrontDeskPanel {...props} section="Patient directory" />);
    expect(h).toContain("Registered patients on database");
    expect(h).toContain("amna@example.com");
    expect(h).toContain("Not linked");
  });

  it("collections page shows REAL receipts (no invented rows)", () => {
    const h = html(<RealFrontDeskPanel {...props} section="Daily collections" />);
    expect(h).toContain("HARD-R-00103");
    expect(h).toContain("Split Posted");
  });

  it("the tab strip navigates (real hrefs, not state-only buttons)", () => {
    const h = html(<RealFrontDeskPanel {...props} section="Overview" />);
    expect(h).toContain('href="/front-desk/patients/new"');
    expect(h).toContain('href="/front-desk/patients"');
    expect(h).toContain('href="/front-desk/collections"');
  });
});

describe("pharmacy workspace — four DISTINCT pages (was: all identical)", () => {
  const activity = {
    dispenses: [
      { id: "d1", prescriptionId: "rx1", prescriptionCode: "RX-ABCD-1234", patientName: "Amna Siddiqui", patientHealthId: "HARD-000102", fillNumber: 1, dispensedAt: "2026-11-20T10:00:00Z" },
    ],
    bills: [
      { id: "b1", title: "Pharmacy bill · PH-7182", amount: 3200, prescriptionCode: "RX-ABCD-1234", patientName: "Amna Siddiqui", patientHealthId: "HARD-000102", date: "2026-11-20T10:00:00Z" },
    ],
  };

  it("overview shows the dashboard, NOT the resolve form", () => {
    const h = html(<RealPharmacyPanel section="Overview" activity={activity} />);
    expect(h).toContain("Pharmacy quick actions");
    expect(h).not.toContain("Resolve prescription");
  });

  it("resolve is the only page with the lookup tool", () => {
    const h = html(<RealPharmacyPanel section="Resolve" activity={activity} />);
    expect(h).toContain("Resolve prescription");
  });

  it("dispenses page lists the pharmacist's own real dispenses", () => {
    const h = html(<RealPharmacyPanel section="Dispenses" activity={activity} />);
    expect(h).toContain("Dispensed prescriptions");
    expect(h).toContain("RX-ABCD-1234");
    expect(h).not.toContain("Pharmacy quick actions");
  });

  it("bills page lists attached bills with real amounts", () => {
    const h = html(<RealPharmacyPanel section="Bills" activity={activity} />);
    expect(h).toContain("Attached pharmacy bills");
    expect(h).toContain("PH-7182");
    expect(h).toContain("3,200");
  });
});

describe("lab workspace — three DISTINCT pages (was: overview = issue form)", () => {
  const reports = [
    { id: "rep1", testType: "Complete Blood Count (CBC)", hash: "SHA256:88c6b02b49f1", fee: 0, patientName: "Amna Siddiqui", patientHealthId: "HARD-000102", testedAt: "2026-11-20T08:00:00Z", verifiedUrl: "/verify/lab/rep1" },
  ];

  it("overview shows the dashboard, NOT the issue form", () => {
    const h = html(<RealLabPanel patients={patients} section="Overview" reports={reports} />);
    expect(h).toContain("Laboratory quick actions");
    expect(h).not.toContain("Issue verified diagnostic report");
  });

  it("new report is the only page with the issue form", () => {
    const h = html(<RealLabPanel patients={patients} section="New report" reports={reports} />);
    expect(h).toContain("Issue verified diagnostic report");
  });

  it("reports issued lists REAL reports (no hard-coded demo rows)", () => {
    const h = html(<RealLabPanel patients={patients} section="Reports issued" reports={reports} />);
    expect(h).toContain("Diagnostic reports issued");
    expect(h).toContain("Complete Blood Count (CBC)");
    // the old hard-coded demo rows must NOT appear
    expect(h).not.toContain("LAB-9481");
    expect(h).not.toContain("Lipid Profile");
  });
});
