import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";

export const metadata: Metadata = {
  title: "Política de Privacidade | Zhivago",
};

export default function PrivacidadePage() {
  return (
    <LegalPageLayout title="Política de Privacidade" updatedAt="22 de setembro de 2026">
      <h2>1. Introdução</h2>
      <p>
        Esta política explica como a Zhivago coleta, usa, compartilha e protege dados
        pessoais dos usuários da plataforma, em conformidade com a Lei Geral de Proteção de
        Dados (Lei nº 13.709/2018 — LGPD).
      </p>

      <h2>2. Dados que coletamos</h2>
      <ul>
        <li>Dados de cadastro: nome, e-mail, telefone e senha (armazenada de forma criptografada).</li>
        <li>Dados de uso: buscas realizadas, imóveis favoritados, mensagens trocadas no chat, reservas e propostas.</li>
        <li>Dados de anúncios: informações e fotos de imóveis publicados por quem anuncia.</li>
        <li>Dados técnicos: endereço IP, tipo de dispositivo e navegador, para fins de segurança e prevenção a fraude.</li>
      </ul>

      <h2>3. Finalidade do tratamento</h2>
      <p>Utilizamos os dados coletados para:</p>
      <ul>
        <li>Viabilizar a criação de conta, publicação de anúncios e comunicação entre usuários.</li>
        <li>Processar e acompanhar reservas, propostas e negociações.</li>
        <li>Enviar notificações relevantes sobre sua conta, anúncios e conversas.</li>
        <li>Prevenir fraude, abuso e uso indevido da plataforma.</li>
        <li>Cumprir obrigações legais e regulatórias.</li>
      </ul>

      <h2>4. Compartilhamento de dados</h2>
      <p>
        Dados de contato e da conversa são compartilhados apenas com a outra parte envolvida
        em uma negociação (por exemplo, entre interessado e anunciante). Não vendemos dados
        pessoais a terceiros. Podemos compartilhar dados com prestadores de serviço que nos
        ajudam a operar a plataforma (hospedagem, envio de notificações), sempre sob obrigação
        de confidencialidade, ou quando exigido por lei ou ordem judicial.
      </p>

      <h2>5. Cookies e tecnologias semelhantes</h2>
      <p>
        Usamos cookies e armazenamento local do navegador para manter você conectado, lembrar
        preferências e entender como a plataforma é utilizada. Você pode gerenciar cookies nas
        configurações do seu navegador, mas isso pode afetar o funcionamento de algumas
        funcionalidades.
      </p>

      <h2>6. Armazenamento e segurança</h2>
      <p>
        Adotamos medidas técnicas e organizacionais para proteger seus dados contra acesso não
        autorizado, perda ou alteração, incluindo criptografia de senhas e controle de acesso
        por papéis dentro das organizações (imobiliárias/equipes).
      </p>

      <h2>7. Seus direitos como titular de dados</h2>
      <p>Nos termos da LGPD, você pode solicitar a qualquer momento:</p>
      <ul>
        <li>Confirmação da existência de tratamento e acesso aos seus dados.</li>
        <li>Correção de dados incompletos, inexatos ou desatualizados.</li>
        <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a lei.</li>
        <li>Portabilidade dos dados a outro fornecedor de serviço.</li>
        <li>Eliminação dos dados tratados com consentimento, exceto hipóteses legais de retenção.</li>
        <li>Revogação do consentimento, quando aplicável.</li>
      </ul>

      <h2>8. Retenção de dados</h2>
      <p>
        Mantemos seus dados enquanto sua conta estiver ativa ou pelo tempo necessário para
        cumprir finalidades legais, contratuais ou de defesa em processos administrativos e
        judiciais, após o que são eliminados ou anonimizados.
      </p>

      <h2>9. Alterações desta política</h2>
      <p>
        Esta Política de Privacidade pode ser atualizada periodicamente. Mudanças relevantes
        serão comunicadas dentro da plataforma.
      </p>

      <h2>10. Contato</h2>
      <p>
        Para exercer seus direitos ou tirar dúvidas sobre o tratamento de dados, entre em
        contato com <a href="mailto:privacidade@zhivago.com.br">privacidade@zhivago.com.br</a>.
      </p>
    </LegalPageLayout>
  );
}
