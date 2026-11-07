import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Listing } from "@zhivago/shared";
import { getListings } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { LandingNav } from "@/components/landing/LandingNav";
import { HomeHero } from "@/components/landing/HomeHero";
import { LocationsSection } from "@/components/landing/LocationsSection";
import { FeaturedListingsSection } from "@/components/landing/FeaturedListingsSection";
import { WhyZhivagoSection } from "@/components/landing/WhyZhivagoSection";
import { ChatSection } from "@/components/landing/ChatSection";
import { ListYourPropertySection } from "@/components/landing/ListYourPropertySection";
import { AgencyTeaserSection } from "@/components/landing/AgencyTeaserSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { fraunces, inter } from "@/components/landing/fonts";
import { byRelevance, citySummaries, eligiblePublicListings, locationSuggestions } from "@/components/landing/home-data";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: { absolute: "Zhivago — Imóveis para comprar, alugar ou temporada" },
  description:
    "Encontre casas e apartamentos para comprar, alugar ou ficar por temporada e fale direto com quem anuncia pelo chat do Zhivago.",
};

// 2 filas cheias de 4 cards (a seção de destaques é mais larga que o resto da home).
const FEATURED_LIMIT = 8;

export default async function LandingPage() {
  const user = await getSessionUser();

  if (user) {
    if (!user.onboardingCompleted) redirect("/boas-vindas");
    const isAgencyAccount = user.accountType === "AGENCY" && user.role !== "ADMIN";
    redirect(isAgencyAccount ? "/dashboard" : "/imoveis");
  }

  let listings: Listing[] = [];
  let loadError = false;
  try {
    listings = eligiblePublicListings(await getListings());
  } catch {
    loadError = true;
  }

  // Destaques só com foto — um card sem imagem não vende o imóvel na vitrine da home.
  const featured = listings
    .filter((listing) => listing.images.length > 0)
    .sort(byRelevance)
    .slice(0, FEATURED_LIMIT);

  return (
    <div className={`${styles.landingRoot} ${fraunces.variable} ${inter.variable}`}>
      <LandingNav />
      <main>
        <HomeHero suggestions={locationSuggestions(listings)} />
        <FeaturedListingsSection listings={featured} loadError={loadError} />
        <LocationsSection cities={citySummaries(listings)} />
        <WhyZhivagoSection />
        <ChatSection />
        <ListYourPropertySection />
        <AgencyTeaserSection />
        <FaqSection />
      </main>
      <LandingFooter />
    </div>
  );
}
