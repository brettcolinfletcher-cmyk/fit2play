import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/api", "/login", "/book/cancel"],
    },
    sitemap: "https://www.fit2perform.com.au/sitemap.xml",
  };
}
