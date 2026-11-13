-- "Outros diferenciais" e "Sobre a região" do anúncio (aba Diferenciais / Localização da página do imóvel).
ALTER TABLE "Listing" ADD COLUMN "features" TEXT;
ALTER TABLE "Listing" ADD COLUMN "neighborhood" TEXT;
