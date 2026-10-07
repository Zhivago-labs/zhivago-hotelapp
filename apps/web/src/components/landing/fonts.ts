import { Fraunces, Inter } from "next/font/google";

// Tipografia exclusiva das páginas institucionais (home e /para-imobiliarias):
// Fraunces nos títulos, Inter no corpo.
export const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-landing-serif",
});

export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-landing-sans",
});
