import type { MetadataRoute } from "next";

// S14 (nextjs-seo): codify crawler policy as a static robots.txt route.
// Public, indexable surface is the landing page only — auth pages, the
// fictional demo, token-resolution and lab-verification URLs, and the
// role-gated workspaces are kept out of search results.
function publicSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit;
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) return `https://${vercelProd}`;
  const vercelHost = process.env.VERCEL_URL ?? process.env.VERCEL_BRANCH_URL;
  if (vercelHost) return `https://${vercelHost}`;
  return "http://localhost:3000";
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/demo",
          "/login",
          "/signup",
          "/setup",
          "/verify/",
          "/access-pending",
          "/rx/",
          "/patient/",
          "/doctor/",
          "/front-desk/",
          "/pharmacy/",
          "/lab/",
          "/provider-admin/",
          "/admin/",
        ],
      },
    ],
    sitemap: new URL("/sitemap.xml", publicSiteUrl()).toString(),
  };
}
