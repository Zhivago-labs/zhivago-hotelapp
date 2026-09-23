import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";

export const metadata: Metadata = {
  title: "Termos de Uso | Zhivago",
};

export default function TermosPage() {
  return (
    <LegalPageLayout title="Termos de Uso" updatedAt="22 de setembro de 2026">
      <h2>1. Aceitação dos termos</h2>
      <p>
        Ao acessar ou usar a plataforma Zhivago, você concorda com estes Termos de Uso. Se
        você não concordar com qualquer parte destes termos, não utilize a plataforma.
      </p>

      <h2>2. O que é a Zhivago</h2>
      <p>
        A Zhivago é um marketplace de imóveis que conecta pessoas interessadas em comprar,
        alugar por mês ou reservar por temporada (diária) com anunciantes — proprietários,
        imobiliárias e corretores. A Zhivago não é proprietária, locadora nem intermediária
        legal dos imóveis anunciados: ela oferece a infraestrutura para que anunciantes e
        interessados se encontrem, conversem e negociem.
      </p>

      <h2>3. Cadastro e conta</h2>
      <ul>
        <li>Você deve fornecer informações verdadeiras, completas e atualizadas ao criar sua conta.</li>
        <li>Você é responsável por manter a confidencialidade da sua senha e por toda atividade realizada na sua conta.</li>
        <li>Contas de imobiliária/equipe têm papéis e permissões definidos pelo administrador da organização.</li>
        <li>Podemos suspender ou encerrar contas que violem estes termos ou a lei.</li>
      </ul>

      <h2>4. Anúncios de imóveis</h2>
      <p>
        Quem anuncia é responsável pela veracidade das informações, fotos, preço e condições
        do imóvel publicado, seja para venda, aluguel mensal ou temporada. Todo anúncio passa
        por um processo de moderação antes de ficar público, mas isso não substitui o dever
        de diligência de cada usuário antes de fechar negócio.
      </p>

      <h2>5. Reservas, propostas e negociação</h2>
      <p>
        Pedidos de reserva (temporada), propostas (venda) e negociações de aluguel mensal são
        feitas diretamente entre interessado e anunciante, inclusive pelo chat da plataforma.
        A confirmação, recusa ou cancelamento de uma reserva/proposta é responsabilidade das
        partes envolvidas. A Zhivago pode auxiliar na comunicação, mas não garante a conclusão
        do negócio nem atua como parte no contrato final entre as partes.
      </p>

      <h2>6. Comunicação entre usuários</h2>
      <p>
        O chat da plataforma deve ser usado para fins relacionados à busca, negociação e
        gestão de imóveis. É proibido usar o chat para spam, assédio, discurso de ódio ou
        qualquer conduta ilegal. Conversas podem ser reportadas para moderação.
      </p>

      <h2>7. Condutas proibidas</h2>
      <ul>
        <li>Publicar anúncios falsos, duplicados ou de imóveis que não existem ou não estão disponíveis.</li>
        <li>Tentar contornar os mecanismos de moderação, pagamento ou comunicação da plataforma.</li>
        <li>Coletar dados de outros usuários para fins não autorizados.</li>
        <li>Usar a plataforma para qualquer finalidade ilegal ou fraudulenta.</li>
      </ul>

      <h2>8. Propriedade intelectual</h2>
      <p>
        A marca Zhivago, o layout, o código e os demais elementos da plataforma são protegidos
        por direitos de propriedade intelectual. O conteúdo enviado por você (fotos, descrições
        de anúncio, mensagens) continua sendo seu, mas você concede à Zhivago licença para
        exibi-lo dentro da plataforma com a finalidade de operar o serviço.
      </p>

      <h2>9. Limitação de responsabilidade</h2>
      <p>
        A Zhivago não garante a exatidão das informações fornecidas por anunciantes, nem se
        responsabiliza por danos decorrentes de negociações, visitas, reservas ou contratos
        firmados entre usuários. Recomendamos sempre verificar documentação e visitar o imóvel
        antes de fechar qualquer negócio.
      </p>

      <h2>10. Encerramento</h2>
      <p>
        Você pode encerrar sua conta a qualquer momento. Podemos suspender ou encerrar contas
        que violem estes Termos, mediante aviso quando possível, especialmente em casos de
        fraude, abuso ou risco à segurança de outros usuários.
      </p>

      <h2>11. Alterações destes termos</h2>
      <p>
        Podemos atualizar estes Termos de Uso periodicamente. Alterações relevantes serão
        comunicadas dentro da plataforma. O uso continuado após uma atualização representa
        aceite dos novos termos.
      </p>

      <h2>12. Lei aplicável</h2>
      <p>
        Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o
        foro do domicílio do usuário para dirimir eventuais controvérsias, salvo disposição
        legal em contrário.
      </p>

      <h2>13. Contato</h2>
      <p>
        Dúvidas sobre estes Termos podem ser enviadas para{" "}
        <a href="mailto:contato@zhivago.com.br">contato@zhivago.com.br</a>.
      </p>
    </LegalPageLayout>
  );
}
