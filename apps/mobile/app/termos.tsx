import React from 'react';
import { LegalScreen, LegalSection } from '@/components/LegalScreen';

export default function TermosScreen() {
  return (
    <LegalScreen title="Termos de Uso" updatedAt="22 de setembro de 2026">
      <LegalSection title="1. Aceitação dos termos">
        Ao acessar ou usar a plataforma Zhivago, você concorda com estes Termos de Uso. Se
        você não concordar com qualquer parte destes termos, não utilize a plataforma.
      </LegalSection>

      <LegalSection title="2. O que é a Zhivago">
        A Zhivago é um marketplace de imóveis que conecta pessoas interessadas em comprar,
        alugar por mês ou reservar por temporada (diária) com anunciantes — proprietários,
        imobiliárias e corretores. A Zhivago não é proprietária, locadora nem intermediária
        legal dos imóveis anunciados: ela oferece a infraestrutura para que anunciantes e
        interessados se encontrem, conversem e negociem.
      </LegalSection>

      <LegalSection title="3. Cadastro e conta">
        {'Você deve fornecer informações verdadeiras, completas e atualizadas ao criar sua conta.\n' +
          'Você é responsável por manter a confidencialidade da sua senha e por toda atividade realizada na sua conta.\n' +
          'Contas de imobiliária/equipe têm papéis e permissões definidos pelo administrador da organização.\n' +
          'Podemos suspender ou encerrar contas que violem estes termos ou a lei.'}
      </LegalSection>

      <LegalSection title="4. Anúncios de imóveis">
        Quem anuncia é responsável pela veracidade das informações, fotos, preço e condições
        do imóvel publicado, seja para venda, aluguel mensal ou temporada. Todo anúncio passa
        por um processo de moderação antes de ficar público, mas isso não substitui o dever
        de diligência de cada usuário antes de fechar negócio.
      </LegalSection>

      <LegalSection title="5. Reservas, propostas e negociação">
        Pedidos de reserva (temporada), propostas (venda) e negociações de aluguel mensal são
        feitas diretamente entre interessado e anunciante, inclusive pelo chat da plataforma.
        A Zhivago pode auxiliar na comunicação, mas não garante a conclusão do negócio nem atua
        como parte no contrato final entre as partes.
      </LegalSection>

      <LegalSection title="6. Comunicação entre usuários">
        O chat da plataforma deve ser usado para fins relacionados à busca, negociação e
        gestão de imóveis. É proibido usar o chat para spam, assédio, discurso de ódio ou
        qualquer conduta ilegal. Conversas podem ser reportadas para moderação.
      </LegalSection>

      <LegalSection title="7. Condutas proibidas">
        {'Publicar anúncios falsos, duplicados ou de imóveis que não existem ou não estão disponíveis.\n' +
          'Tentar contornar os mecanismos de moderação, pagamento ou comunicação da plataforma.\n' +
          'Coletar dados de outros usuários para fins não autorizados.\n' +
          'Usar a plataforma para qualquer finalidade ilegal ou fraudulenta.'}
      </LegalSection>

      <LegalSection title="8. Propriedade intelectual">
        A marca Zhivago, o layout, o código e os demais elementos da plataforma são protegidos
        por direitos de propriedade intelectual. O conteúdo enviado por você (fotos, descrições
        de anúncio, mensagens) continua sendo seu, mas você concede à Zhivago licença para
        exibi-lo dentro da plataforma com a finalidade de operar o serviço.
      </LegalSection>

      <LegalSection title="9. Limitação de responsabilidade">
        A Zhivago não garante a exatidão das informações fornecidas por anunciantes, nem se
        responsabiliza por danos decorrentes de negociações, visitas, reservas ou contratos
        firmados entre usuários. Recomendamos sempre verificar documentação e visitar o imóvel
        antes de fechar qualquer negócio.
      </LegalSection>

      <LegalSection title="10. Encerramento">
        Você pode encerrar sua conta a qualquer momento. Podemos suspender ou encerrar contas
        que violem estes Termos, mediante aviso quando possível, especialmente em casos de
        fraude, abuso ou risco à segurança de outros usuários.
      </LegalSection>

      <LegalSection title="11. Alterações destes termos">
        Podemos atualizar estes Termos de Uso periodicamente. Alterações relevantes serão
        comunicadas dentro do app. O uso continuado após uma atualização representa aceite dos
        novos termos.
      </LegalSection>

      <LegalSection title="12. Lei aplicável">
        Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o
        foro do domicílio do usuário para dirimir eventuais controvérsias, salvo disposição
        legal em contrário.
      </LegalSection>

      <LegalSection title="13. Contato">
        Dúvidas sobre estes Termos podem ser enviadas para contato@zhivago.com.br.
      </LegalSection>
    </LegalScreen>
  );
}
