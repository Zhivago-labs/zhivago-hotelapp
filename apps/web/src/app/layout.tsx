import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { ConditionalHeader } from "@/components/ConditionalHeader";
import { ChatSocketProvider } from "@/components/chat/ChatSocketProvider";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { FloatingChatButton } from "@/components/chat/FloatingChatButton";
import { getToken } from "@/lib/session";
import { FavoritesProvider } from "@/components/favorites/FavoritesContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Zhivago — Imóveis para alugar e comprar",
    template: "%s · Zhivago",
  },
  description: "Encontre imóveis para alugar e comprar no Zhivago.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const token = await getToken();

  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <FavoritesProvider>
          <ChatSocketProvider token={token}>
            <ConditionalHeader>
              <SiteHeader />
            </ConditionalHeader>
            {children}
            <FloatingChatButton />
            <ChatSidebar />
          </ChatSocketProvider>
        </FavoritesProvider>
      </body>
    </html>
  );
}
