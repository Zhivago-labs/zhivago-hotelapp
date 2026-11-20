# Zhivago | Parecer sobre as melhorias propostas

**20 de novembro de 2026** · Avaliação do relato de produção de 19/11/2026, feito com o perfil de proprietário da Imobiliária Santa Rosa, confrontado com o código local do site (`acea96c`) e da API (`09ba2f6`).

**Recomendo aprovar as correções de endereço, métricas e temporada antes de ampliar a operação.** O redesenho completo de `/imoveis` pode esperar. Para quem compara dois imóveis hoje, voltar à mesma busca e entender quanto cada opção custa resolve um problema mais imediato que trocar a galeria por um mapa.

O relato descreve uma conta com portfólio e funil vazios e um catálogo público com 11 imóveis naquela visita. A leitura do código ajuda a explicar o comportamento das telas. A versão implantada, os vínculos reais dos usuários e a classificação dos anúncios em produção seguem sem confirmação independente. As capturas citadas no relato não estavam disponíveis para inspeção. Esta análise foi documental, sem testes transacionais.

## O que priorizar

| Quando | Decisão | Razão |
|---|---|---|
| Antes de ampliar a operação | A1 e A2. Elevar A6 a P1 para a modalidade temporada. | O gestor precisa confiar nos nomes do relatório, o anunciante precisa prever onde seu endereço aparecerá e o hóspede precisa conseguir enviar um pedido válido. |
| Próximo ciclo | A3, A4 e A5. Incorporar A7, A8 e A9 nas respectivas telas. | São correções que melhoram a comparação, a publicação e o atendimento usando estruturas existentes. Antecipar A9 se um controle impedir concluir uma tarefa por teclado ou leitor de tela. |
| Após essas correções | Refinar cartões e preços, experimentar a lista e medir o carregamento de Equipe. Condicionar o mapa à qualidade dos dados e à demanda. | Há evidência de perda de contexto e divergência de informações. O ganho de conversão de uma nova composição ainda é uma hipótese. |

## Os nove achados

### A1 · Quem entra nas métricas da imobiliária

**Manter P1 para investigação.** A consulta da equipe seleciona membros ativos. A remoção preserva o vínculo como inativo para manter o histórico do CRM. A consulta de métricas usa a organização do vínculo autenticado, mas inclui proprietários, gerentes e corretores independentemente do status e devolve seus nomes sem indicar a situação. Uma pessoa removida pode, portanto, aparecer até com zero atribuições. Essa é uma explicação plausível para o segundo nome. Identificar a situação daquela pessoa exige conferir o vínculo real. [Consultas de equipe, remoção e métricas](../apps/server/src/controllers/organizations.controller.ts) · [Tabela exibida pelo site](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/app/%28workspace%29/imobiliaria/page.tsx#L289)

**Decisão e aceite.** Usar membros ativos na visão operacional. Na histórica, incluir ex-membros com atividade no intervalo e identificá-los como tal. Explicitar o período de cada indicador. Hoje a tabela combina atribuições ainda vigentes com tempos de resposta históricos, e apenas a série mensal tem janela de seis meses. Validar com duas imobiliárias, uma remoção e uma transferência de atendimento. O histórico deve continuar atribuível, e cada gestor deve reconhecer todos os nomes exibidos no seu escopo.

### A2 · Endereço prometido e endereço exibido

**Manter P1.** O cadastro promete bairro e cidade na busca. O cartão principal tenta abreviar o endereço, mas as sugestões e os itens recentes usam diretamente o texto completo de `location`. Até a abreviação pode devolver o texto integral em registros antigos. A rota pública de listagem devolve os campos do imóvel, incluindo os de endereço. Alterar só o cartão deixaria a mesma divergência em outras superfícies. [Listagem pública](../apps/server/src/controllers/listings.controller.ts) · [Sugestões](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/ListingsExplorer.tsx#L352) · [Itens recentes](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/ListingsExplorer.tsx#L833) · [Endereço do cartão](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/ListingCard.tsx#L29)

**Decisão e aceite.** Adotar a promessa atual como regra inicial. Entregar ao catálogo uma localização resumida a partir de bairro, cidade e UF. Se só existir texto livre e a precisão for incerta, usar a parte conhecida ou indicar “Região não informada”. Reservar o endereço detalhado para a ficha conforme a política escolhida pelo produto. Conferir o conteúdo recebido e exibido na busca, sugestões, recentes, semelhantes e vitrine, com e sem login, inclusive para um anúncio antigo. A mesma regra deve orientar os futuros marcadores do mapa. [Especificação do projeto, seção 65](./zhivago-especificacao-completa-crm-cadastro-imoveis-pagina-publica.md)

### A3 · Quartos, suítes e localização contraditórios

**Aprovar em duas etapas.** Revisar com o anunciante os números e a cidade do Apto Timóteo. O formulário pede confirmação das quantidades, e a API verifica inteiros não negativos, mas cada contagem é validada isoladamente. Primeiro definir se “quartos” e “banheiros” incluem os das suítes e explicitar isso no cadastro. Se ambos forem totais, duas suítes exigem pelo menos dois quartos e dois banheiros. Aplicar a regra na publicação e na edição, conferir a importação e revisar registros antigos. Para a descrição livre, preferir um alerta editorial. “Acesso pela rodovia para São Paulo” pode ser perfeitamente compatível com um imóvel em outra cidade. [Validação da publicação](../apps/server/src/lib/listing-publication.ts) · [Contadores do formulário](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/listings/NewListingForm.tsx#L1032)

### A4 · Retorno à busca

**Aprovar para o próximo ciclo.** A busca já grava consulta, filtros, ordenação e página na URL. O link “Voltar para a busca” aponta sempre para `/imoveis`. A correção é levar a origem da navegação até a ficha e recuperá-la no retorno, com destino padrão para quem abriu um link direto. Aceite prático: filtrar por Timóteo, ordenar por preço, abrir uma ficha e voltar pelo link e pelo navegador. Nos dois caminhos, a mesma busca deve reaparecer. Em uma listagem maior, conferir também a página e o cartão onde a pessoa parou. [Estado da busca](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/ListingsExplorer.tsx#L285) · [Link de retorno da ficha](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/app/imovel/%5Bid%5D/page.tsx#L542)

### A5 · Mensagens pessoais e da imobiliária

**Aprovar a separação de contexto.** A lista corporativa exige uma oportunidade no escopo do membro e sua participação na conversa. O botão abre a central geral, e o indicador soma mensagens das conversas da conta. Isso explica como uma reserva pessoal pode acender o indicador dentro da empresa. O caso relatado envolve uma conversa do próprio usuário. [Consulta corporativa](../apps/server/src/controllers/workspace.controller.ts) · [Entrada da central](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/app/%28workspace%29/empresa/mensagens/page.tsx#L15) · [Contagem de não lidas](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/chat/ChatSocketProvider.tsx#L93)

Identificar a central global já reduz a ambiguidade. Para uso comercial, abrir “Imobiliária” por padrão no painel e oferecer “Pessoal” explicitamente, mantendo o mesmo chat. Atribuir o escopo pela participação e pelo papel naquela oportunidade. Um corretor também pode ser cliente de outra imobiliária. **Aceite:** receber uma mensagem pessoal e outra de atendimento, ler cada uma e conferir qual contador mudou, inclusive com o painel aberto.

### A6 · Solicitação de temporada

**Elevar a P1 para temporada.** Com um único clique, o formulário mostra “1 dia”, habilita o botão e usa a entrada como saída. A API calcula zero noites e rejeita esse período. Para 21 a 23/11, ela calcula duas noites, soma a taxa de limpeza uma vez e registra um pedido pendente. Há ainda uma divergência de calendário. O preço exclui o dia de saída, enquanto a verificação de conflito inclui as duas extremidades. Isso pode impedir outra entrada na data da saída anterior. [Envio das datas](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/listing/BookingRequestForm.tsx#L43) · [Dias ocupados no calendário](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/listing/RentalBookingCalendar.tsx#L66) · [Cálculo, conflito e aprovação](../apps/server/src/controllers/bookings.controller.ts)

**Decisão e aceite.** Exigir saída posterior à entrada e respeitar a estadia mínima anunciada. Mostrar entrada, saída, noites, diária, limpeza e total antes de “Solicitar reserva e abrir chat”. Por exemplo, duas noites a R$ 200 e limpeza de R$ 80 devem mostrar R$ 480 antes do clique e registrar o mesmo valor no pedido. Validar uma noite, o mínimo do imóvel, duas estadias consecutivas, um conflito real e a confirmação posterior pelo anunciante. Se a operação exigir intervalo para limpeza, esse intervalo precisa ser explícito.

### A7 · Avaliações de hóspedes no aluguel mensal

**Aprovar a ocultação da seção no mensal.** O site usa a categoria ampla “aluguel” para mostrar o componente. A elegibilidade exige estadia confirmada e encerrada, e novas reservas só existem para diária. Usar a modalidade temporada para essa seção. Se houver avaliações históricas em imóvel que mudou de modalidade, identificá-las como referentes à hospedagem anterior. Criar avaliações de locação mensal exigiria definir quem pode avaliar e em que momento do contrato. [Exibição das avaliações](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/listing/ListingReviews.tsx#L147) · [Elegibilidade da avaliação](../apps/server/src/controllers/reviews.controller.ts)

### A8 · Revisão indica conclusão prematura

**Aprovar.** A última etapa reúne as pendências das anteriores e não tem requisitos próprios. O nome acessível do botão interpreta a ausência de erros locais como conclusão. Usar “Revisão disponível, cinco pendências”, com a quantidade real, e “Pronto para enviar” quando o total chegar a zero. Manter o acesso à prévia, a lista acionável e o foco no campo com erro. Conferir o anúncio vazio, parcialmente preenchido e pronto para envio. [Pendências e revisão](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/listings/NewListingForm.tsx#L654) · [Nome acessível da etapa](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/listings/NewListingForm.tsx#L859)

### A9 · Nomes dos controles

**Aprovar como parte da próxima revisão de Chat e Equipe.** A busca da central, o e-mail de convite e os campos de empreendimento dependem de textos de exemplo. O seletor da função do convidado também precisa de identificação própria. Associar cada campo a um rótulo que continue compreensível depois da digitação. Aceitar a correção quando for possível, por teclado e leitor de tela, pesquisar uma conversa, escolher o papel do convidado e identificar qual campo de empreendimento precisa de correção. [Busca do chat](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/chat/ChatSidebar.tsx#L286) · [Convite](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/dashboard/InviteMemberForm.tsx#L29) · [Empreendimento](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/dashboard/CreateBuildingForm.tsx#L13)

## Operação da imobiliária

| Ideia | Parecer | Como verificar o benefício |
|---|---|---|
| Primeiros passos no painel vazio | Aprovar uma sequência curta com links para completar a vitrine, cadastrar o primeiro imóvel e definir quem atende. Convite deve ser opcional para quem trabalha sozinho. Usar a situação real da empresa para exibir a sequência. Uma semana sem leads também acontece em empresas já ativas. | Medir quantas imobiliárias novas chegam ao primeiro anúncio aprovado e o tempo até isso acontecer. |
| Contexto da conta | Aprovar junto com A5. Mostrar a imobiliária em uso no painel e manter os ajustes pessoais identificáveis no menu do usuário. | Em uma conta com os dois usos, pedir que a pessoa encontre uma reserva pessoal e depois um atendimento da empresa. |
| Carregamento de Equipe | Medir antes de investir. A página já consulta dados em paralelo, mas espera o conjunto, inclusive blocos secundários como auditoria, antes de apresentar a equipe. Se houver atraso repetível, mostrar membros e convites primeiro e permitir recuperar o bloco que falhou. | Comparar tempo até a lista ficar utilizável na primeira visita e nas seguintes, por perfil e em rede móvel. |
| Dados de demonstração | Aprovar a curadoria agora. A API já exclui do catálogo registros marcados com `isDemo` e há ferramenta para revisar IDs específicos. Um título fictício é motivo para revisão humana. Confirmar com o responsável quais anúncios são exemplos antes de classificá-los. | Conferir os mesmos registros na busca, vitrine, semelhantes e link direto, preservando o histórico comercial legítimo. |

Fontes do projeto. [Painel inicial](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/app/%28workspace%29/empresa/page.tsx#L17) · [Menu da conta](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/workspace/WorkspaceShell.tsx#L56) · [Carregamento de Equipe](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/app/%28workspace%29/equipe/page.tsx#L80) · [Curadoria de demonstrações](../apps/server/src/scripts/mark-demo-listings.ts)

## Decisão de design para `/imoveis`

**Manter a galeria como padrão inicial.** A exploração geral e a temporada se beneficiam de fotos grandes. Para compra e aluguel mensal, testar uma lista compacta que permita comparar bairro, área, quartos e preço entre imóveis. Oferecer a escolha explícita e lembrá-la. As duas apresentações devem refletir a mesma consulta, quantidade, página e ordenação. A coluna única para celular, os filtros avançados, a remoção individual de filtros e a prioridade de carregamento das primeiras fotos já existem. O trabalho imediato está em refinar a hierarquia e preservar o retorno à busca. [Filtros ativos](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/ListingsExplorer.tsx#L559) · [Grade responsiva](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/ListingsExplorer.module.css#L743) · [Cartão de exploração](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/ListingCard.tsx#L123)

| Modalidade | O que merece destaque | Dependência de dados |
|---|---|---|
| Compra | Valor pedido e preço por m² para comparar opções similares. | Preferir área privativa válida e identificada. Omitir o indicador se a área for zero ou desconhecida. |
| Aluguel mensal | Orçamento mensal conhecido, com aluguel, condomínio e IPTU mensal discriminados. | Diferenciar encargo zero de encargo desconhecido. Se faltar um valor, indicar “total parcial”. O filtro e a ordenação hoje usam o preço-base e precisam seguir o critério informado na tela. |
| Temporada | Destino, datas e hóspedes. Exibir diária sem período e total estimado quando houver entrada e saída. | Usar as mesmas regras de noites e limpeza de A6. Só prometer disponibilidade para o período e a ocupação se ambos forem verificados. |

Os campos comerciais já constam do modelo de dados. Na referência de temporada, o Airbnb organiza a busca em destino, datas e hóspedes. No aluguel residencial, o QuintoAndar permite escolher aluguel ou valor total como critério. Esses exemplos orientam quais perguntas fazer em cada modalidade. O efeito sobre os contatos do Zhivago precisa ser medido no próprio catálogo. [Modelo de anúncios](../apps/server/prisma/schema.prisma) · [Busca do Airbnb](https://www.airbnb.com.br/) · [Filtros de aluguel do QuintoAndar](https://www.quintoandar.com.br/alugar/imovel/sao-paulo-sp-brasil/apartamento)

**Cartões e cabeçalho.** Compactar a introdução até que o primeiro imóvel apareça mais cedo no celular. Destacar foto, preço, bairro/cidade e atributos comparáveis. Reduzir a etiqueta de modalidade quando o usuário já segmentou a busca e manter a distinção na busca geral. Suavizar “Ver foto” preservando o botão nomeado e acessível por teclado. Usar o selo de verificação que já depende dos dados da imobiliária e conferir se o chat flutuante cobre ações em telas estreitas.

**Mapa.** Adiar o mapa integrado. A ficha já incorpora um mapa individual. O catálogo precisaria localizar vários resultados com precisão conhecida, tratar endereços incompletos e respeitar A2. Considerar um piloto quando houver oferta suficiente em uma região e compradores ou locatários relatarem dificuldade para comparar bairros. Em telas amplas, testar lista ao lado do mapa. No celular, usar uma visualização por vez, mantendo filtros e imóvel selecionado. [Mapa individual existente](https://github.com/Zhivago-labs/zhivago-web/blob/acea96ce588c0106d28da3791c659e8b3fd398d8/apps/web/src/components/listing/MapEmbed.tsx#L10) · [Campos de localização](../apps/server/prisma/schema.prisma)

## Como decidir se a próxima entrega funcionou

1. **Homologação comercial.** Usar duas imobiliárias de teste, membros ativos e removidos, um proprietário, um gerente, um corretor e um cliente com conversas pessoais e corporativas. Percorrer interesse → oportunidade → distribuição → atendimento → mudança no Kanban. Conferir o resultado nas métricas, nos contadores e nos acessos de cada perfil.
2. **Publicação e consistência.** Exercitar rascunho no mesmo navegador e em outro acesso, fotos, edição, aprovação, rejeição e importação de CSV válido, duplicado e com imagem indisponível. Incluir um anúncio antigo com endereço livre. Conferir nas superfícies públicas o que foi cadastrado para cada modalidade.
3. **Usabilidade.** Em celular e desktop, pedir que a pessoa compare dois imóveis dentro de um orçamento, volte à lista e explique o custo. Para temporada, pedir que informe quantas noites selecionou, quanto pagará e quem ainda precisa confirmar. Repetir as tarefas essenciais por teclado e leitor de tela.
4. **Resultado de produto.** Registrar uma linha de base por modalidade e dispositivo antes de mudar a apresentação. Acompanhar buscas que chegam à ficha, favoritos e contatos por sessão de busca, além de pedidos de temporada concluídos entre os iniciados. Com pouco tráfego, dar mais peso a erros observáveis de tarefa, como perder filtros ou interpretar o checkout incorretamente, do que a variações pequenas de conversão.

**Decisão de investimento:** aprovar primeiro as correções que tornam o produto confiável para anunciar, comparar e solicitar. Liberar a lista como experimento depois que endereço, preço e retorno funcionarem de ponta a ponta. Reavaliar o mapa com evidência de demanda e cobertura geográfica.

## Atualização após a implementação local de A1, A2 e A6

| Item | Comportamento implementado | Verificação executada |
|---|---|---|
| A1 · Métricas | A tabela principal traz a equipe ativa. Uma seção histórica identifica ex-membros com atribuições e informa o período de todo o histórico. A carteira e os ganhos vigentes ficam associados ao responsável atual. | Duas imobiliárias fictícias, um ex-membro com atribuição transferida e outro sem histórico. A API exibiu os nomes no escopo esperado e recusou o acesso do membro removido. |
| A2 · Endereço | Catálogo, vitrine e semelhantes recebem localização resumida. A ficha individual mantém o endereço cadastrado. O site usa campos estruturados nos cartões, nas sugestões e em vistos recentemente. Para anúncios antigos sem região identificável, exibe “Região não informada”. | Consultas às rotas com e sem autenticação, usando um imóvel estruturado e um legado. Os testes também verificaram o texto dos cartões e os dados usados pelas sugestões. |
| A6 · Temporada | O solicitante vê entrada, saída, noites, diária, limpeza e total antes do envio. A API exige a estadia mínima e usa o dia de saída como primeira data livre. O pedido aguarda confirmação. | Em navegador com serviços simulados, o formulário real passou nos cenários desktop e celular. Nas rotas da API, foram verificados preço alterado, pedido pendente, aprovação, datas adjacentes e conflito real de noites. |

**Resultado da validação local.** Passaram 12 verificações no executor de testes da API, nove no site, dois cenários no Edge e a verificação de tipos dos dois projetos. Os testes de rotas usaram persistência em memória. A confirmação com as contas e os dados reais da Santa Rosa continua pendente para homologação. As alterações estão nos repositórios locais, sem publicação em produção.

## Segundo ciclo implementado localmente

| Item | Resultado |
|---|---|
| A3 · Ficha do imóvel | Quartos e banheiros são totais que incluem as suítes. O cadastro e a API apontam a inconsistência antes da publicação. O CSV aceita a coluna opcional de suítes, informa a linha inválida e continua aceitando o modelo antigo. A prévia pede que o anunciante confira a cidade citada na descrição. Os dados corretos do Apto Timóteo precisam ser confirmados pelo responsável. |
| A4 · Retorno à busca | Os links dos cartões, da galeria e dos itens recentes levam a origem da busca à ficha. O retorno recupera consulta, filtros, ordenação, página e, quando o imóvel ainda está na lista, o foco no cartão. Abrir uma ficha diretamente mantém o catálogo como destino padrão. |
| A5 · Mensagens | O painel abre a caixa da imobiliária e conta suas mensagens não lidas. A central permite consultar também as pessoais e todas as conversas da conta. A classificação usa participação, vínculo ativo, oportunidade autorizada e papel do cliente. Conversas históricas de contexto indeterminado continuam disponíveis em “Todas”. |
| A7 · Avaliações | Aluguel mensal e venda ocultam a seção vazia de hóspedes. Quando existe histórico, ele aparece como “Avaliações de hospedagens anteriores”. A temporada mantém sua seção de hóspedes. |
| A8 · Revisão | O resumo visual e o nome acessível da última etapa usam a contagem geral de pendências. O usuário pode abrir a revisão desde o início e vê o estado de conclusão correspondente a envio ou salvamento de rascunho. |
| A9 · Campos acessíveis | Busca do chat, e-mail e função do convidado, nome e endereço do empreendimento têm rótulos persistentes. Os erros enviados pelo servidor nos formulários de equipe são anunciados como alertas. |

**Validação do ciclo.** Passaram 22 testes da API e 11 do site, incluindo regressões das prioridades anteriores. Nos componentes reais, com serviços simulados, o Edge validou o cartão e o foco na segunda página de uma busca, a revisão vazia e preenchida, as avaliações atuais e históricas, os rótulos dos campos e a separação das caixas e contadores em desktop e em largura de celular. O TypeScript passou nos dois repositórios. A homologação em produção e o teste manual com leitor de tela continuam pendentes.
