# CRM Zhivago — mapeamento e plano de evolução

**Base da análise** — código local do backend `hotelapp` (`118c6a4`) e da web `zhivago-web` (`6a54933`). A leitura do código e os testes locais descritos ao final cobrem o estado observado. A versão publicada e o conteúdo da base de produção ficam pendentes de verificação.

## Resumo executivo

- O CRM da imobiliária já tem painel, Contatos, Kanban, ficha de oportunidade, mensagens, visitas, tarefas, distribuição de leads e métricas. O vínculo ativo com uma organização define o acesso.
- **Contatos já inclui oportunidades novas, perdidas, ganhas e intermediárias** dentro do escopo de cada papel. A pessoa aparece uma vez, com os imóveis de interesse e o estágio de cada oportunidade. Hoje a lista fornece nome, e-mail e telefone quando cadastrado, além de links para fichas e conversas autorizadas.
- A melhoria de produto é transformar Contatos na base histórica da imobiliária. A proposta inclui visão por pessoa e por oportunidade, filtros e ficha completa com responsável, origem, última atividade, próxima ação e motivo de perda quando registrado.
- As prioridades técnicas são fazer a atribuição acompanhar o chat de forma consistente, expor a fila de oportunidades sem responsável, medir a primeira resposta efetiva e padronizar as transições entre atendimento, negociação e encerramento.

## 1. Modelo de dados e responsabilidades

| Entidade | O que representa no CRM atual |
| --- | --- |
| `Organization` e `OrganizationMember` | Imobiliária, papel e vínculo ativo ou inativo. A organização guarda o modo de distribuição e o cursor do rodízio. O membro tem `receiveLeads`. O vínculo é único por `userId`, inclusive quando inativo. |
| `User` | Conta do cliente e fonte do seu nome, e-mail e telefone opcional. A consulta de Contatos agrupa oportunidades pelo ID da conta. |
| `Listing` | Imóvel. Em anúncio de imobiliária, `organizationId` dá o escopo, `createdById` registra quem cadastrou, `agentId` aponta para o responsável comercial do anúncio e `buildingId` pode vinculá-lo a um empreendimento. |
| `OrganizationBuilding` | Empreendimento com um responsável principal de leads e um substituto opcional, ambos vinculados à equipe. |
| `Lead` | Oportunidade de uma conta em um imóvel, com organização, etapa, origem inicial e datas. A chave única `(userId, listingId)` faz interesse repetido reaproveitar a mesma oportunidade. A mesma pessoa pode ter várias oportunidades na imobiliária. |
| `LeadAssignment` | Histórico de responsáveis por oportunidade. A linha com `unassignedAt = null` representa a atribuição atual. O índice único parcial do banco limita a uma atribuição aberta por lead. A linha guarda destinatário, autor da atribuição quando informado, origem, datas e primeiro contato. |
| `LeadInteraction`, `Visit` e `LeadTask` | Interações, visitas estruturadas e tarefas com prazo opcional. A tarefa pendente com vencimento mais próximo aparece como próxima ação no Kanban. |
| `Conversation`, `Booking`, `Negotiation` e `Offer` | Conversa, reserva, negociação e suas rodadas. Conversa, reserva, negociação e oferta podem referenciar o lead. Campos opcionais acomodam imóveis individuais e dados legados. |

O responsável pela oportunidade é obtido na atribuição aberta. O responsável do imóvel e o do empreendimento entram no cálculo da primeira atribuição. A aba Contatos é uma consulta de `User` com oportunidades visíveis. O código atual já disponibiliza o CRM para organizações sem a regra histórica de plano `PRO`.

Fontes: [schema Prisma](../apps/server/prisma/schema.prisma), [índices e migração de leads](../apps/server/prisma/migrations/20260921000000_sprint1_operation_model_and_contracts/migration.sql), [remoção do plano](../apps/server/prisma/migrations/20260830160000_remove_organization_plan/migration.sql).

## 2. Captação, atendimento e encerramento

| Ação ou evento | Efeito observado |
| --- | --- |
| Cliente abre o chat de um imóvel da imobiliária | `ensureLead()` cria um lead `NEW` com `source = CHAT` ou devolve o lead existente. A distribuição roda na criação. Em conversa nova, `leadId` é gravado e o responsável atual entra como participante. Enquanto a oportunidade estiver sem responsável, a conversa pode ter só o cliente. Se já existe conversa encontrada pelo cliente e imóvel, a rota de chat pode devolvê-la antes de passar pelo `ensureLead()`. |
| Cliente pede uma reserva | A solicitação exige anúncio `DAILY_RENT`. Para imóvel da imobiliária, `ensureLead()` usa `BOOKING` na criação e a reserva recebe `leadId`. A conversa apresenta a solicitação de reserva e pode começar só com o cliente. |
| Cliente envia oferta pelo endpoint de oferta do anúncio | `ensureLead()` usa `OFFER` na criação e o fluxo abre ou reutiliza uma conversa para iniciar a negociação. Na negociação iniciada dentro do chat, os registros recebem o vínculo da conversa. |
| Cliente usa WhatsApp direto no anúncio | Os links da página pública abrem um canal externo. Esse clique não passa pelos fluxos de criação de lead descritos acima. Um contato iniciado somente por ali pode faltar na base, assim como contatos de canal externo sem cadastro ou registro no produto. |
| Equipe seleciona uma etapa no Kanban ou na ficha | Qualquer estágio aceito pelo endpoint pode ser selecionado por quem tem permissão. Mudança efetiva gera registro `STATUS_CHANGE`. A equipe pode registrar ligação, WhatsApp, e-mail, nota ou visita. Visitas estruturadas têm os estados agendada, confirmada, concluída, cancelada e não compareceu. Agendar exige atribuição atual, grava o responsável daquele momento e mantém a etapa do lead. Tarefas guardam título, autor, prazo opcional e data de conclusão. |
| Proposta, contraproposta e comando de chat | Primeira rodada e contraproposta podem avançar o lead para `PROPOSAL` e `NEGOTIATION`, respectivamente. Esse avanço por sistema é progressivo, preserva `WON` e `LOST` e gera registro quando há responsável atual. O comando `/negociar` usa outra função de transição, com validação de quem opera o lead. |
| Aceite de negociação | Em venda, a negociação aceita leva o imóvel a `SOLD` e pode marcar o lead `WON`. Em diária, o aceite confirma a reserva vinculada e pode marcar o lead `WON`. Em aluguel mensal, o aceite leva o imóvel a `RENTED`, enquanto a rotina de aceite pula o avanço do lead para `WON`. |
| Aprovação, recusa ou cancelamento de reserva | Aprovação confirma a reserva e tenta marcar o lead como `WON`. A recusa grava `REJECTED` e atualiza o chat. O caminho atual de recusa não marca `LOST` automaticamente. O cancelamento também tem fluxo próprio. |
| Imóvel individual | A conversa e as ações do lado do anúncio seguem o proprietário. A captação do CRM organizacional depende de `organizationId`. |

Etapas disponíveis no funil: `NEW` (Novo), `CONTACTED` (Contatado), `QUALIFIED` (Qualificado), `VISIT_SCHEDULED` (Visita agendada), `PROPOSAL` (Proposta), `NEGOTIATION` (Negociação), `WON` (Ganho) e `LOST` (Perdido). Hoje a tabela `Lead` guarda o estado atual e a primeira origem. Motivo estruturado de perda, reabertura comercial e registro de origens posteriores são propostas deste documento.

Fontes: [chat](../apps/server/src/controllers/chat.controller.ts), [reservas](../apps/server/src/controllers/bookings.controller.ts), [ofertas](../apps/server/src/controllers/offers.controller.ts), [negociações](../apps/server/src/lib/negotiations.ts), [socket](../apps/server/src/socket.ts), [operações do lead](../apps/server/src/controllers/leads.controller.ts), [WhatsApp na página pública](../../zhivago-web/apps/web/src/app/imovel/%5Bid%5D/page.tsx).

## 3. Papéis e escopo de acesso

| Papel da imobiliária | Contatos, funil e fichas | Operação sobre leads | Distribuição |
| --- | --- | --- | --- |
| Proprietário `OWNER` | Organização inteira, inclusive novos, perdidos e sem responsável | Atualiza, registra atividades e atribui ou transfere | Recebe se elegível. Configura modo, equipe, principal e substituto. |
| Administrador `ADMIN` | Organização inteira | Atualiza, registra atividades e atribui ou transfere | Configura modo, equipe, principal e substituto. Papel fora do conjunto de destinatários. |
| Gerente `MANAGER` | Organização inteira | Atualiza, registra atividades e atribui ou transfere | Recebe se elegível. |
| Corretor `BROKER` | Oportunidades com atribuição aberta para ele, inclusive perdidas e ganhas se ainda atribuídas | Atualiza a própria carteira, registra interações, tarefas e visitas | Recebe se elegível e pode gerenciar a própria disponibilidade conforme as regras. |
| Assistente `ASSISTANT` | Organização inteira, incluindo métricas e Contatos | Papel de consulta nas rotas normais | Fora do conjunto de destinatários. O controle de mutação deve preservar explicitamente a regra de leitura para dados legados. |

O backend resolve o vínculo ativo e o ID da imobiliária a partir do usuário autenticado. No workspace, a caixa corporativa requer participação na conversa, imóvel da própria imobiliária e lead autorizado. A visão ampla de uma ficha não concede acesso por si só ao conteúdo da conversa. O chat tem regras próprias de participação, administração de plataforma, encerramento e bloqueio. O acesso comercial também é distinto de permissões para cadastrar, editar ou redistribuir imóveis.

Fontes: [escopo do workspace](../apps/server/src/lib/workspace.ts), [vínculo e papéis](../apps/server/src/lib/organizations.ts), [rotas do CRM](../apps/server/src/routes/leads.routes.ts), [rotas de equipe e organização](../apps/server/src/routes/organizations.routes.ts).

## 4. Distribuição atual

Um destinatário regular deve pertencer à imobiliária, estar ativo, aceitar leads (`receiveLeads = true`) e ser proprietário, gerente ou corretor. Nesta ordem, `resolveLeadAssignee()` avalia:

1. **Principal do empreendimento** (`BUILDING_OWNER`).
2. **Substituto do empreendimento** (`BACKUP`).
3. **Responsável comercial do imóvel** (`LISTING_AGENT`).
4. **Rodízio da imobiliária** (`ROUND_ROBIN`), quando configurado. Uma transação bloqueia a linha de `Organization` para ler e atualizar o cursor. A lista é ordenada por data de entrada, com ID como desempate. Quando o cursor deixa de identificar alguém elegível, a escolha reinicia no primeiro da lista.
5. **Sem responsável**, quando nenhuma regra resolve o destino. Um gestor com permissão pode atribuir pelo CRM.

`MANUAL` é o modo padrão e desliga apenas o rodízio de fallback. Principal, substituto e responsável do imóvel continuam com prioridade automática. `SMART` aparece na documentação histórica como evolução. A API atual aceita `MANUAL` e `ROUND_ROBIN`.

| Operação | Comportamento atual |
| --- | --- |
| Atribuição manual e transferência | Proprietário, administrador ou gerente seleciona um destinatário elegível. A primeira atribuição manual tem origem `MANUAL`, a troca tem `TRANSFER`. A API aceita motivo opcional. A UI envia a seleção imediatamente e não oferece campo para o motivo. |
| Sincronização com o chat | A troca fecha a atribuição antiga e cria a nova na mesma transação. A sincronização do participante roda depois, localiza uma conversa pelo cliente e imóvel, preserva as mensagens e tenta substituir o participante comercial. Uma falha de sincronização é registrada no servidor. |
| Pausa de recebimento | O próprio elegível ou `OWNER`/`ADMIN` pode alterar `receiveLeads`. A API impede pausar o último elegível ou um principal de empreendimento que ainda detém essa função. As atribuições existentes ficam abertas. |
| Saída de membro | Inativa o vínculo, preserva histórico, transfere os imóveis para o proprietário ativo e, em seguida, transfere as atribuições abertas, inclusive de ganhos e perdidos. Esse caminho chama a atribuição diretamente e pode encaminhar ao proprietário mesmo com recebimento pausado. |
| Mudança de configuração | Alterar a preferência de distribuição ou o principal do empreendimento é uma mudança de roteamento. As oportunidades já existentes seguem com a atribuição registrada até uma ação de transferência. Configurar principal ou substituto em Equipe gera auditoria de organização. O cadastro de imóvel também oferece a opção de assumir o empreendimento, sujeita à elegibilidade e à existência de outro responsável. |

Há uma diferença entre tela e API. A lista de destinatários na ficha aceita apenas gerentes e corretores ativos e pode listar quem pausou recebimento. A API aceita também o proprietário elegível e recusa quem pausou. A contagem de recebimento em Equipe também exclui o proprietário. O filtro de imóveis do Kanban do corretor usa sua carteira de imóveis, que pode diferir dos imóveis das oportunidades recebidas por rodízio ou por empreendimento.

Fontes: [distribuição e transferência](../apps/server/src/lib/leads.ts), [regras de equipe e opt-out](../apps/server/src/controllers/organizations.controller.ts), [ficha da oportunidade](../../zhivago-web/apps/web/src/app/%28workspace%29/imobiliaria/leads/%5Bid%5D/page.tsx), [controle de atribuição](../../zhivago-web/apps/web/src/components/dashboard/AssignLeadSelect.tsx), [Equipe](../../zhivago-web/apps/web/src/app/%28workspace%29/equipe/page.tsx).

## 5. Interfaces e indicadores atuais

| Área da equipe | O que está disponível |
| --- | --- |
| **Início** `/empresa` | Indicadores para 7, 30 ou 90 dias, clientes únicos, pendências, taxa de contato, imóveis, visitas futuras e reservas de temporada quando aplicável. Pendências incluem oportunidades abertas novas ou sem responsável e são consultadas independentemente do período. |
| **Contatos** `/empresa/contatos` | Busca por nome ou e-mail, páginas de 25 pessoas, canais de contato e oportunidades agrupadas. Pode abrir o detalhe e, para um participante, a conversa. |
| **Kanban** `/imobiliaria` | Oito colunas, cards com cliente, imóvel, etapa, responsável na visão ampla, indicador de SLA e próxima tarefa quando houver. Troca de etapa por seletor. Busca e filtros por cliente, etapa, imóvel e, na visão ampla, corretor e empreendimento. Paginação global de 100 leads na web. Os totais das colunas consideram todos os resultados dos filtros, enquanto os cards representam a página atual. A API aceita também intervalo de criação. |
| **Oportunidade** `/imobiliaria/leads/[id]` | Nome, e-mail, imóvel, etapa, SLA, responsável, histórico de atribuição, interações, tarefas e visitas. O controle de tarefa permite marcar conclusão e reabrir. A API permite atualizar título e prazo. |
| **Mensagens** `/empresa/mensagens` | Até 100 conversas corporativas recentes e acesso à central de chat. Acesso depende de participação e do escopo da oportunidade. |
| **Imóveis**, **Equipe** e **Reservas / Temporada** | Imóveis da organização ou carteira do corretor, gestão de equipe e empreendimentos, modo de distribuição e recebimento, reservas de diária. O menu de temporada aparece quando a organização possui essa modalidade. |
| **Métricas** `/imobiliaria?view=metricas` | Funil atual, ganhos, perdas, conversão, média de resposta, SLA, volume mensal dos últimos seis meses, carteira da equipe ativa e histórico de ex-integrantes com atribuição. |

**Como os números funcionam hoje.** O SLA visual começa em `assignedAt`, entra em risco em 3 horas e vence em 4 horas corridas. Uma atribuição sem responsável tem indicador próprio. Depois de qualquer `firstContactAt`, o SLA visual passa a `ON_TIME`, mesmo se o contato foi tardio. Chamadas a `recordInteraction()` podem preencher o primeiro contato com nota interna ou mudança de etapa. Uma mensagem comum enviada no chat não preenche esse campo no fluxo analisado. O painel considera contatada uma oportunidade do período com primeiro contato em alguma atribuição. Métricas usam `WON / total` para conversão geral, e média e conformidade do SLA usam as atribuições com contato registrado. A carteira e os ganhos da equipe ativa usam a atribuição aberta. Cada métrica precisa exibir o denominador e a janela que lhe correspondem.

Fontes: [navegação da equipe](../../zhivago-web/apps/web/src/components/workspace/WorkspaceShell.tsx), [Início](../../zhivago-web/apps/web/src/app/%28workspace%29/empresa/page.tsx), [Kanban e Métricas](../../zhivago-web/apps/web/src/app/%28workspace%29/imobiliaria/page.tsx), [consultas do workspace](../apps/server/src/controllers/workspace.controller.ts), [cálculo de SLA](../apps/server/src/lib/leads.ts), [métricas da organização](../apps/server/src/controllers/organizations.controller.ts).

## 6. Contatos — especificação da evolução

### O que a aba já entrega

`GET /organizations/contacts` pagina pessoas por nome e ID. A mesma regra de organização e carteira é aplicada para selecionar as pessoas e as oportunidades aninhadas. Cada pessoa aparece uma vez pelo `userId`, com todas as oportunidades visíveis, de `NEW` a `LOST`, sem corte por data. A resposta atual fornece dados básicos do cliente, nome do imóvel, etapa e ID da conversa quando vinculada e acessível. A tela exibe o número de oportunidades do cliente, com uma lista de imóveis e etapas na mesma linha. [API](../apps/server/src/controllers/workspace.controller.ts) · [Tela](../../zhivago-web/apps/web/src/app/%28workspace%29/empresa/contatos/page.tsx)

### Experiência proposta

**Todos** será o filtro inicial, incluindo novos, em andamento, ganhos e perdidos, com ou sem responsável conforme a permissão. Para quem tem visão ampla, o universo são todos os leads da própria imobiliária. Para o corretor, o universo é a carteira atribuída no momento. A tela indicada para consultar uma pessoa é a mesma para todos os papéis, com ações e dados sujeitos à autorização.

| Elemento | Comportamento proposto |
| --- | --- |
| Visão **Pessoas** | Uma linha por pessoa. Exibir nome, canais disponíveis, quantidade de oportunidades visíveis, resumo das etapas, atividade mais recente e acesso à ficha. Expandir mostra os interesses e o status individual de cada um. |
| Visão **Oportunidades** | Uma linha por `leadId`. Exibir cliente, imóvel, modalidade, etapa, responsável, origem, entrada, última atividade e próxima ação. Disponibilizar o indicador de SLA quando a oportunidade aguarda resposta e exibir o motivo de perda quando houver. |
| Busca e filtros | Busca por nome, e-mail, telefone normalizado e imóvel. Filtros combináveis de etapa, modalidade, origem, responsável, sem responsável, empreendimento e período de entrada ou atividade. Para **Perdidos**, acrescentar motivo e data de encerramento quando disponíveis. A busca avança por toda a carteira permitida. |
| Ordenação e totais | Atividade mais recente como padrão, com desempate estável por ID. Oferecer nome, data de entrada, próxima ação e tempo sem resposta. Identificar separadamente o total de pessoas e o total de oportunidades que atendem aos filtros. |
| Ficha do contato | Cabeçalho com nome, telefone e e-mail disponíveis. Lista de oportunidades com imóvel, etapa, responsável, origem, datas de entrada e última atividade, próxima tarefa ou visita e desfecho. Na oportunidade selecionada, abrir histórico de interações, transferências, tarefas, visitas e referência à reserva ou negociação quando existente. |
| Ações | Abrir oportunidade, abrir chat quando autorizado, ligar ou enviar e-mail quando houver dados, registrar interação e criar tarefa conforme o papel. O atalho de WhatsApp depende de telefone válido e da regra de comunicação adotada pela imobiliária. |
| Visual responsivo | Tabela pesquisável em desktop, lista de cartões no celular, filtros em painel recolhível, etapas com rótulo textual, atalho para a ficha e navegação por teclado. Manter filtros e posição ao voltar da ficha. Diferenciar primeira carga, busca vazia e falha com ação de tentar novamente. |

Estrutura da tela em desktop:

```text
Contatos                    [Pessoas | Oportunidades]
[Buscar nome, e-mail, telefone ou imóvel] [Filtros]
[Todos] [Novos] [Em andamento] [Ganhos] [Perdidos]

Nome e canais        Oportunidades e etapas        Última atividade    Ações
Marina Campos        2 · Novo e Perdido            Hoje, 10:42          Ver ficha
  ├ Apartamento A    Novo · Ana · Chat · retorno hoje
  └ Casa B           Perdido · Bruno · Reserva · datas indisponíveis
```

### Regras de dados e de consulta

- Reaproveitar `User` e `Lead` na primeira entrega. Usar `userId` para agrupar e `leadId` para listar oportunidades. Duas contas com o mesmo nome ou telefone continuam separadas.
- O filtro por etapa na visão **Pessoas** seleciona quem tem uma oportunidade que corresponde ao filtro. A expansão evidencia as oportunidades que motivaram o resultado e a ficha exibe todas as oportunidades autorizadas da pessoa. Na visão **Oportunidades**, a linha deve satisfazer todos os filtros simultaneamente. Exemplo: a pessoa que tem um lead Novo e outro Perdido aparece em ambos os filtros, mas cada oportunidade pertence à sua etapa.
- Buscar e paginar dados no servidor. Trazer primeiro o resumo do contato e carregar histórico e oportunidades extensas ao abrir a ficha. Filtros, contagens, ficha e atalhos de conversa devem aplicar o mesmo escopo antes de agregar ou devolver dados. A página de contatos e a ficha devem compartilhar as regras de visibilidade com o Kanban.
- Aproveitar campos existentes como `source`, `createdAt`, responsável atual e tarefas. Derivar última atividade de eventos comerciais relevantes, como mensagem, interação, visita ou mudança de etapa, com regra de data e desempate estáveis. Introduzir motivo de perda, data de fechamento e autoria como campos ou eventos estruturados. Mostrar “Sem telefone” ou “Motivo não registrado” quando o dado faltar. Registros antigos precisam aparecer com as informações disponíveis, preservando a origem que consta no banco.
- Inventariar conversas, reservas e ofertas organizacionais legadas sem `leadId`. Reconciliar somente quando cliente, imóvel e imobiliária forem identificáveis. Executar simulação com contagens e amostras revisadas antes de um preenchimento idempotente. Preservar mensagens, etapas e atribuições existentes. Casos ambíguos ficam identificados para revisão, com erros rastreáveis e possibilidade de nova execução.
- Para incluir captação de WhatsApp, formulário, ligação e indicação, criar pontos explícitos de registro e identificar a origem. Começar por captura autenticada ou registro pela equipe, conforme o canal. Se for necessário cadastrar alguém que ainda não tem conta, evoluir para um contato da imobiliária com `userId` opcional e vínculo posterior mediante confirmação. Guardar o evento de entrada mesmo se ele reativar uma oportunidade existente. Um clique externo representa intenção de usar o canal e não confirma atendimento.

### Critérios de aceite de Contatos

1. Com um cliente que tem `NEW`, `WON` e `LOST` em três imóveis, a tela **Todos** conta uma pessoa e três oportunidades. **Perdidos** seleciona a pessoa na primeira visão e retorna apenas o seu lead perdido na segunda. A ficha recupera as três oportunidades autorizadas.
2. A gestão visualiza leads sem responsável, inclusive perdidos. O corretor visualiza apenas os leads atualmente atribuídos, e uma mesma pessoa pode ter outras oportunidades que ficam fora de suas contagens e ficha. Trocas de responsável refletem no escopo das duas carteiras.
3. Bloquear acesso cruzado entre imobiliárias em lista, contagem, ficha, busca e link de chat. Validar acesso direto por ID e acesso pelo menu com cada papel. Um assistente consegue consultar os registros autorizados com controles de edição indisponíveis.
4. Busca e paginação recuperam contatos antigos, mesmo com outros clientes de nome igual. Telefone ausente, data antiga incompleta e motivo de perda ausente apresentam estado legível. Telefone informado pode ser buscado com ou sem pontuação.
5. Abertura da ficha e retorno à lista preservam visão, filtros e página. Navegação por teclado e leitura no celular permitem acessar as etapas, dados e ações essenciais.

## 7. Melhorias de lógica e distribuição

| Prioridade | Evidência no código atual | Mudança proposta |
| --- | --- | --- |
| **P0** | Criar o lead, avançar o cursor e gravar a atribuição são operações separadas. Um erro posterior à criação pode deixar um lead sem destino, e `ensureLead()` pode devolver esse registro no retry. A leitura da atribuição atual antecede a transação de troca. | Consolidar criação ou reaproveitamento, decisão de encaminhamento, alteração do cursor, transição de responsável e registro da decisão numa unidade consistente de trabalho. Serializar troca por lead, revalidar destino no momento da escrita, repetir conflitos transitórios e tratar a mesma atribuição como operação idempotente. Consumir o turno do rodízio junto da atribuição efetiva. Usar o índice único de atribuição aberta como proteção do banco. |
| **P0** | A sincronização de participantes roda depois da troca, em melhor esforço, e localiza uma única conversa por cliente e imóvel. Conversas preexistentes podem ficar sem `leadId`. | Usar `leadId` como vínculo principal e reconciliar conversas legadas confirmadas. Atualizar a participação com a atribuição em transação quando possível. Se houver trabalho posterior, registrar a operação com retry e monitoramento. Derivar o acesso comercial do responsável atual no workspace, nas rotas de chat e no socket. Validar que transferir mantém o histórico e retira leitura e envio do responsável anterior, conforme a política de acesso. |
| **P0** | Nota interna e mudança de status podem marcar a primeira resposta. A contagem começa na atribuição. | Medir **tempo até atribuição** desde a captação e **tempo até primeira resposta** a partir da atribuição, guardando também o tempo total desde a entrada. Preencher `firstContactAt` uma vez por atribuição com mensagem humana enviada ao cliente ou contato externo efetivo registrado. Distinguir tentativa, contato, log automático e nota. Exibir pendente, em risco, atrasado, respondido no prazo ou respondido com atraso. |
| **P0** | A tela de transferência e as contagens de equipe divergem da elegibilidade da API. Em desligamento, a carteira pode ir diretamente ao proprietário pausado e a operação ocorre após a inativação. | Derivar seletor, contagens e regras de destino de uma definição comum. No desligamento, planejar e registrar o destino de cada lead aberto antes de concluir a saída, com reexecução segura. Enviar carteira ativa para destinatários elegíveis ou à fila da gestão. Preservar atribuição de encerramento para histórico e atribuir a disponibilidade de atendimento separadamente quando houver retomada. |
| **P1** | Atribuição opcional sem fila de trabalho dedicada, seletor imediato e nenhuma explicação do caminho escolhido. | Criar visão **Sem responsável** com ordem pela entrada mais antiga, idade, canal, empreendimento e motivo. Permitir assumir a fila conforme o papel e atribuir com confirmação, motivo obrigatório em transferência e ações em lote limitadas a organizações e papéis autorizados. Exibir no detalhe quem recebeu e qual regra decidiu o destino. |
| **P1** | Kanban e integrações mudam etapas por caminhos diferentes. A recusa de uma rodada ou reserva e o encerramento da oportunidade têm semânticas distintas. | Centralizar transições com etapa esperada, autor, motivo, referência e registro consistente. Exigir motivo ao encerrar como perdido e ação **Reabrir oportunidade** com histórico. Aceitar negócio marca Ganho quando a regra comercial da modalidade estiver satisfeita. Uma recusa individual permanece como atividade enquanto houver possibilidade de seguir com a oportunidade. Revisar o aceite mensal e definir se o marco de ganho é o aceite ou a formalização do contrato. |
| **P1** | Visitas, tarefas, chat e responsável são exibidos em blocos separados; a transferência altera a carteira sem ajustar o responsável de visitas ou tarefas. | Unificar eventos em uma linha do tempo com autoria. Na transferência, o operador revisa visitas futuras e tarefas pendentes em um resumo. Preservar quem registrou cada item e permitir delegar próxima ação com responsável e prazo. Usar o mesmo fuso da imobiliária para digitação e leitura dos prazos. |
| **P2** | Round robin considera elegibilidade e ordem, sem capacidade ou especialidade. Rotas prioritárias podem concentrar volume. | Depois de medir a fila, oferecer regras configuráveis para modalidade, região, disponibilidade, horário e limite de oportunidades abertas. Usar rodízio entre os elegíveis do mesmo grupo, com justificativa e fallback explícitos. Simular o resultado com os dados da imobiliária antes de ativar regras e mostrar os efeitos por responsável. |

### Distribuição proposta para a primeira entrega operacional

1. Ao entrar um interesse, recuperar a oportunidade do cliente e imóvel. Se for nova, registrar entrada e direcionar. Se já existir, registrar a atividade e manter o responsável atual. Se estiver perdida, sinalizar reentrada e oferecer reabertura com histórico preservado. Se estiver ganha, manter o desfecho e encaminhar o novo evento conforme a modalidade, especialmente em diárias recorrentes.
2. Avaliar principal, substituto e responsável do imóvel, nessa ordem, com elegibilidade uniforme e validação de que todos pertencem à mesma imobiliária. Mostrar essa prioridade ao configurar o modo de fallback.
3. Sem destinatário direto, aplicar o modo configurado. **Fila manual** envia à fila da gestão; **Rodízio** escolhe o próximo elegível e registra o turno. Rodízio com zero elegíveis também envia à fila com motivo e hora da entrada. Repetir um evento ou refresh da página conserva a atribuição já resolvida.
4. Ao pausar recebimento, manter atendimento da carteira atual. Exibir quem cobre novos leads do empreendimento. No primeiro lançamento, alertar no painel quando a fila ou o SLA ultrapassar o limite. Introduzir redistribuição automática após definição de horários, exceções, notificações e registro de tentativas por oportunidade.

**Casos de aceite.** Principal e substituto elegíveis respeitam a ordem. Principal ausente ou inelegível passa ao substituto. Sem destino direto, duas entradas simultâneas com dois destinos elegíveis consomem turnos distintos. Uma mesma entrada concorrente mantém um lead e uma atribuição. Sem elegíveis, o lead continua em Contatos e entra na fila. Uma troca concorrente tem resultado explícito e histórico íntegro. Um cliente que volta depois de perder o negócio continua pesquisável com o desfecho anterior. O ex-responsável perde acesso comercial ao chat, e o novo acessa as mensagens e tratativas da oportunidade conforme seu papel.

## 8. Design das telas da operação

| Tela | Melhoria e ação principal |
| --- | --- |
| **Início** | Mostrar os blocos **Novos sem resposta**, **Sem responsável**, **SLA vencido**, **Próximas tarefas** e **Visitas de hoje** com links que abram a consulta já filtrada. Para corretor, começar em **Minha carteira**. Para gestão, começar em **Visão da equipe** e permitir alternar para a própria carteira. |
| **Kanban** | Oferecer visão por colunas e uma lista compacta para celular e triagem. Mostrar em cada cartão cliente, imóvel, responsável, próxima ação e atraso. Dar atalho para filtrar sem responsável e vencidos. Usar carregamento por etapa, ou indicar “exibindo X de Y nesta etapa”, para que uma página global vazia não pareça uma etapa vazia. Os ganhos e perdidos ficam recolhíveis no modo de trabalho e pesquisáveis por filtro. Manter mudança por teclado e feedback de salvamento. |
| **Ficha da oportunidade** | Cabeçalho com cliente, canais, imóvel, origem e responsável. Deixar **Abrir conversa**, **Registrar contato**, **Criar tarefa** e **Transferir** acessíveis conforme o papel. Mostrar próxima ação no topo e timeline com filtros por evento. Para marcar perda, abrir formulário de motivo e nota opcional. Para transferir, mostrar seleção, motivo e impacto em tarefas, visitas e conversa antes de confirmar. |
| **Mensagens** | Ao abrir uma conversa autorizada, mostrar contexto da oportunidade e próxima ação sem exigir troca de tela. Indicar conversa encerrada, lead sem responsável e ausência de vínculo legado de forma coerente com a permissão. Avançar etapas com a mesma regra usada na ficha. |
| **Equipe e distribuição** | Mostrar responsáveis principal e substituto por empreendimento, disponibilidade e volume da carteira ativa. Explicar o modo com texto operacional, por exemplo “Usar responsáveis do imóvel e empreendimento. Enviar o restante à fila”. Mostrar histórico e diagnóstico com a origem de cada atribuição. |
| **Métricas** | Separar a fotografia da carteira atual dos resultados do período. Oferecer recortes por origem, modalidade, responsável e empreendimento. Mostrar mediana e percentil 90 do tempo de resposta, volume pendente, tempo até atribuição, taxa de resposta no prazo, motivos de perda e taxa de ganho nos encerrados (`ganhos / (ganhos + perdidos)`). Preservar a taxa atual `ganhos / total` com rótulo que explicite seu denominador. |

## 9. Sequência de entrega e verificação

| Ordem | Entrega | Evidência de conclusão |
| --- | --- | --- |
| 1 | Evoluir a aba existente com visão Pessoas/Oportunidades, busca, filtros, dados de responsável e origem, cronologia básica e ficha. Corrigir o seletor de atribuição e expor a fila **Sem responsável**. | Novo, ganho e perdido localizáveis desde o menu. Caso com um cliente e três imóveis passa nos testes de contagem e escopo. Atribuição usa a mesma elegibilidade da API. |
| 2 | Unificar atribuição e transições, sincronizar acesso ao chat e corrigir o SLA. Incorporar regras de encerramento, reabertura e transferência. | Testes com banco cobrem entradas concorrentes, troca de responsável, falha e retry. Nota e mudança de etapa não contam como resposta. Reserva ou negociação segue a regra da modalidade e registra o desfecho. |
| 3 | Reconciliar vínculos legados verificáveis, acrescentar captura de canais externos escolhidos e publicar métricas operacionais. | Relatório de simulação confere com os registros aplicados; segundo processamento permanece idempotente. Painel mostra fila, intervalo e denominadores. Toda nova captação permitida aparece em Contatos. |
| 4 | Ativar distribuição por capacidade, horário ou especialidade quando os dados justificarem. | Simulação e piloto comparados por volume, tempo sem dono, resposta no prazo e encaminhamentos manuais. Configuração explica regra, exceção e destino quando o grupo fica vazio. |

**Validação realizada nesta análise:** passaram 22 testes locais do backend. A seleção incluiu vínculo ativo e cinco papéis, escopo entre imobiliárias, totais filtrados, agrupamento de duas oportunidades em um contato, desligamento de membro com preservação do histórico, métricas, caixa de entrada e reservas. Esses testes usam injeção local e dependências simuladas nos cenários pertinentes. Permanecem para a implementação os casos de aceite da evolução, verificação visual em navegador, concorrência com PostgreSQL e reconciliação de registros de produção. [Permissões e Contatos](../apps/server/tests/workspace-permissions.ts) · [Caixa corporativa](../apps/server/tests/catalog-and-inbox.test.ts) · [Métricas e reservas](../apps/server/tests/catalog-metrics-bookings.test.ts)

## 10. Referência de rotas para manutenção

| Área | Rotas existentes |
| --- | --- |
| Workspace | `GET /organizations/workspace`, `GET /organizations/contacts`, `GET /organizations/messages`, `GET /organizations/bookings` |
| Carteira e ficha | `GET /leads/workspace` aplica escopo por papel, `GET /leads` exige visão ampla, `GET /leads/mine` retorna atribuições próprias e `GET /leads/:id` retorna a ficha após checagem de acesso. |
| Ações no lead | `PATCH /leads/:id/assign`, `PATCH /leads/:id/status`, `POST /leads/:id/interactions`, `POST /leads/:id/visits`, `PATCH /visits/:id/status`, `POST /leads/:id/tasks`, `PATCH /tasks/:id` |
| Configuração e auditoria | `PATCH /organizations/lead-distribution-mode`, `PATCH /organizations/members/:userId/receive-leads`, `PATCH /organizations/buildings/:id/lead-owner`, `PATCH /organizations/buildings/:id/backup`, `DELETE /organizations/members/:userId`, `GET /organizations/audit-log` |
| Imóveis e métricas | `GET /organizations/listings`, `GET /organizations/my-assigned-listings`, `PATCH /listings/:id/agent`, `GET /organizations/metrics` |

[Rotas de organização](../apps/server/src/routes/organizations.routes.ts) · [Rotas do lead](../apps/server/src/routes/leads.routes.ts) · [Rotas de imóveis](../apps/server/src/routes/listings.routes.ts) · [Ações da interface](../../zhivago-web/apps/web/src/lib/actions/leads.ts)
