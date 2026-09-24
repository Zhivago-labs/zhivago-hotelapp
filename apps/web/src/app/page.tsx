import { redirect } from "next/navigation";
import { Fraunces, Inter } from "next/font/google";
import type { Listing } from "@zhivago/shared";
import { getListings } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";
import { PropertyDiscoverySection } from "@/components/landing/PropertyDiscoverySection";
import { ExperienceSection } from "@/components/landing/ExperienceSection";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import { TransitionBand } from "@/components/landing/TransitionBand";
import { CrmSection } from "@/components/landing/CrmSection";
import { ListYourPropertySection } from "@/components/landing/ListYourPropertySection";
import { FaqSection } from "@/components/landing/FaqSection";
import { CtaSection } from "@/components/landing/CtaSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import styles from "./page.module.css";

// Tipografia exclusiva da landing page (Fraunces nos títulos, Inter no corpo)
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-landing-serif",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-landing-sans",
});

// Critério de relevância: contagem de visualizações com desempate por mais recente
function byRelevance(a: Listing, b: Listing): number {
  if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function topLocations(listings: Listing[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const listing of listings) {
    counts.set(listing.location, (counts.get(listing.location) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([location]) => location);
}

export default async function LandingPage() {
  const user = await getSessionUser();

  if (user) {
    const isAgencyAccount = user.accountType === "AGENCY" && user.role !== "ADMIN";
    redirect(isAgencyAccount ? "/dashboard" : "/imoveis");
  }

  let listings: Listing[] = [];
  let loadError = false;
  try {
    listings = await getListings();
  } catch {
    loadError = true;
  }

  const withPhoto = listings.filter((listing) => listing.images.length > 0);
  const sorted = [...withPhoto].sort(byRelevance);
  const featuredListing = sorted[0] ?? null;
  const editorialListing = sorted[1] ?? featuredListing;
  const discoveryListings = sorted.slice(0, 9);
  const locations = topLocations(listings, 6);

  return (
    <div className={`${styles.landingRoot} ${fraunces.variable} ${inter.variable}`}>
      <LandingNav />
      <main>
        <LandingHero featuredListing={featuredListing} locations={locations} />
        <PropertyDiscoverySection listings={discoveryListings} loadError={loadError} />
        <ExperienceSection featuredImage={editorialListing?.images[0]?.url ?? null} />
        <TestimonialsSection />
        <TransitionBand />
        <CrmSection />
        <ListYourPropertySection />
        <FaqSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
