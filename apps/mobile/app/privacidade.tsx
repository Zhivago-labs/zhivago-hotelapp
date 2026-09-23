import React from 'react';
import { LegalScreen, LegalSection } from '@/components/LegalScreen';

export default function PrivacidadeScreen() {
  return (
    <LegalScreen title="Política de Privacidade" updatedAt="22 de setembro de 2026">
      <LegalSection title="1. Introdução">
        Esta política explica como a Zhivago coleta, usa, compartilha e protege dados
        pessoais dos usuários da plataforma, em conformidade com a Lei Geral de Proteção de
        Dados (Lei nº 13.709/2018 — LGPD).
      </LegalSection>

      <LegalSection title="2. Dados que coletamos">
        {'Dados de cadastro: nome, e-mail, telefone e senha (armazenada de forma criptografada).\n' +
          'Dados de uso: buscas realizadas, imóveis favoritados, mensagens trocadas no chat, reservas e propostas.\n' +
          'Dados de anúncios: informações e fotos de imóveis publicados por quem anuncia.\n' +
          'Dados técnicos: endereço IP, tipo de dispositivo e sistema operacional, para fins de segurança e prevenção a fraude.'}
      </LegalSection>

      <LegalSection title="3. Finalidade do tratamento">
        {'Viabilizar a criação de conta, publicação de anúncios e comunicação entre usuários.\n' +
          'Processar e acompanhar reservas, propostas e negociações.\n' +
          'Enviar notificações relevantes sobre sua conta, anúncios e conversas.\n' +
          'Prevenir fraude, abuso e uso indevido da plataforma.\n' +
          'Cumprir obrigações legais e regulatórias.'}
      </LegalSection>

      <LegalSection title="4. Compartilhamento de dados">
        Dados de contato e da conversa são compartilhados apenas com a outra parte envolvida
        em uma negociação (por exemplo, entre interessado e anunciante). Não vendemos dados
        pessoais a terceiros. Podemos compartilhar dados com prestadores de serviço que nos
        ajudam a operar a plataforma, sempre sob obrigação de confidencialidade, ou quando
        exigido por lei ou ordem judicial.
      </LegalSection>

      <LegalSection title="5. Armazenamento e segurança">
        Adotamos medidas técnicas e organizacionais para proteger seus dados contra acesso não
        autorizado, perda ou alteração, incluindo criptografia de senhas e controle de acesso
        por papéis dentro das organizações (imobiliárias/equipes).
      </LegalSection>

      <LegalSection title="6. Seus direitos como titular de dados">
        {'Nos termos da LGPD, você pode solicitar a qualquer momento:\n' +
          'Confirmação da existência de tratamento e acesso aos seus dados.\n' +
          'Correção de dados incompletos, inexatos ou desatualizados.\n' +
          'Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a lei.\n' +
          'Portabilidade dos dados a outro fornecedor de serviço.\n' +
          'Eliminação dos dados tratados com consentimento, exceto hipóteses legais de retenção.\n' +
          'Revogação do consentimento, quando aplicável.'}
      </LegalSection>

      <LegalSection title="7. Retenção de dados">
        Mantemos seus dados enquanto sua conta estiver ativa ou pelo tempo necessário para
        cumprir finalidades legais, contratuais ou de defesa em processos administrativos e
        judiciais, após o que são eliminados ou anonimizados.
      </LegalSection>

      <LegalSection title="8. Alterações desta política">
        Esta Política de Privacidade pode ser atualizada periodicamente. Mudanças relevantes
        serão comunicadas dentro do app.
      </LegalSection>

      <LegalSection title="9. Contato">
        Para exercer seus direitos ou tirar dúvidas sobre o tratamento de dados, entre em
        contato com privacidade@zhivago.com.br.
      </LegalSection>
    </LegalScreen>
  );
}
