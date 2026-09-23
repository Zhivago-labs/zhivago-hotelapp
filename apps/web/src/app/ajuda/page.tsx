import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { HelpFaq } from "@/components/legal/HelpFaq";

export const metadata: Metadata = {
  title: "Ajuda | Zhivago",
};

export default function AjudaPage() {
  return (
    <LegalPageLayout title="Central de Ajuda">
      <p>
        Reunimos aqui as dúvidas mais comuns sobre a Zhivago. Se você não encontrar o que
        procura, fale com a gente pelo chat da plataforma ou pelo e-mail de suporte.
      </p>

      <h2>Perguntas frequentes</h2>
      <HelpFaq />

      <h2>Ainda precisa de ajuda?</h2>
      <p>
        Envie um e-mail para{" "}
        <a href="mailto:suporte@zhivago.com.br">suporte@zhivago.com.br</a> descrevendo sua
        dúvida ou problema. Consulte também os nossos{" "}
        <a href="/termos">Termos de Uso</a> e a{" "}
        <a href="/privacidade">Política de Privacidade</a>.
      </p>
    </LegalPageLayout>
  );
}
