# Revisão do CRM imobiliário do Zhivago — Contatos e área interna

> Documento de discussão (27/11/2026). Objetivo: entender o CRM como ele é hoje, criticar a experiência do ponto de vista do corretor e do gestor, comparar três direções de repaginação e detalhar a recomendada a ponto de virar protótipo.
>
> **Convenções.** "Hoje" = comportamento confirmado no código. **[Proposta]** = não existe. **[Hipótese]** = suposição a validar (com usuário ou medindo a tela). Caminhos começam pelo repositório: `zhivago-web/…` (site/área interna, Next.js) e `hotelapp/…` (backend Fastify + Prisma).

---

## 0. Como esta revisão foi feita e o que ficou sem verificação

- Frontend e backend estão em repositórios separados (`zhivago-web` e `hotelapp`, sem sincronização). Os dois estavam disponíveis localmente e foram lidos: rotas em `zhivago-web/apps/web/src/app/(workspace)/`, componentes em `zhivago-web/apps/web/src/components/{workspace,dashboard,chat}/`, API em `hotelapp/apps/server/src/{controllers,lib}/` e modelo em `hotelapp/apps/server/prisma/schema.prisma`.
- Versão lida do web: `bcd3da4` (ícones Phosphor e barra lateral recolhível), posterior à entrega do CRM `eae2869`. Backend: `7ea5299`.
- **Não executei o projeto.** O backend aponta para um Postgres em `localhost:5433` que não estava no ar, e não há Docker nesta máquina. Por isso, **nenhuma tela de Contatos foi vista renderizada com dados**. Medidas de altura e largura abaixo são **estimativas** feitas a partir do CSS (`Workspace.module.css`), não medições. A única referência visual usada foi uma captura antiga do Kanban (`zhivago-web/.tmp/workspace-browser/kanban-desktop.png`, 09/11), que confirma a linguagem visual (cartões brancos, rosa da marca, barra lateral de 252 px).
- Antes de decidir, vale abrir a tela atual com dados reais e conferir os pontos marcados como estimativa.

---

## 1. Como o CRM funciona hoje

### 1.1 Conceitos: o que é cada coisa no código

| Termo na interface | O que é no código | Distinto de verdade? |
|---|---|---|
| **Pessoa / Contato** | Um `User` comum do marketplace (`schema.prisma`, model `User`). Não existe uma entidade "Contato" própria da imobiliária. A "pessoa" de Contatos é o agrupamento por `userId` dos Leads da organização (`workspace.controller.ts`, `getWorkspaceContacts`, `groupBy: ['userId']`). | Sim, mas é **derivada**: só existe para a imobiliária enquanto houver ao menos um Lead visível. Não há notas, tags nem dados do contato no nível da pessoa. |
| **Lead / Oportunidade** | O mesmo objeto: `Lead`. A regra é **1 cliente + 1 imóvel = 1 Lead** (`@@unique([userId, listingId])`). Tem etapa (`status`: NEW → … → WON/LOST), origem, motivo de perda, fila, `lastActivityAt`. | "Lead" e "Oportunidade" são **sinônimos**. A interface usa "oportunidade"; o código e algumas telas (Kanban: "Pipeline de Leads", "Nenhum lead aqui") ainda falam "lead". |
| **Entrada** | `LeadEntry`: cada vez que o interesse chega (ENTRY), volta depois de perdido (REENTRY) ou é só um clique no WhatsApp (INTENT). | Sim. É o histórico de captação de uma oportunidade. |
| **Atendimento / Responsável** | `LeadAssignment`: quem atende a oportunidade agora (`unassignedAt = null`), com histórico, origem da atribuição e `firstContactAt` (1ª resposta efetiva). | Sim. O responsável é **por oportunidade**, não por pessoa. |
| **Conversa** | `Conversation` com `leadId` (e `propertyId`). Participantes = cliente + responsável atual. Mensagens em `Message` (com `senderId`, `isRead`). | Sim. Uma conversa por oportunidade (cliente × imóvel). |
| **Próxima ação** | Calculada, não armazenada: a tarefa (`LeadTask`) pendente com prazo mais próximo **ou** a próxima visita (`Visit`), o que vier antes (`crm-query.ts`, `toOpportunity`). | É derivada de tarefas e visitas. |
| **Interação** | `LeadInteraction`: ligação, WhatsApp, e-mail, visita, nota interna (com desfecho CONTACT/ATTEMPT). | Sim. Só contato efetivo conta como 1ª resposta. |

**Conclusão:** os conceitos realmente distintos são **pessoa (User)**, **oportunidade (Lead)**, **conversa**, **tarefa/visita** e **interação**. "Contato", "lead" e "atendimento" são nomes diferentes para pessoa ou oportunidade, e a interface mistura os três.

### 1.2 Do primeiro interesse até a área da imobiliária

Todos os caminhos passam por um único ponto: `ensureLeadDetailed` (`hotelapp/apps/server/src/lib/leads.ts`).

1. **Cliente abre conversa no anúncio** (`chat.controller.ts`, criação de conversa): se o imóvel é de imobiliária, cria ou recupera o Lead (origem CHAT), registra a entrada e **depois** cria a conversa com o responsável atual como participante.
2. **Reserva** (`bookings.controller.ts`), **proposta** (`offers.controller.ts`) e **clique no WhatsApp** (`leads.controller.ts`, `recordChannelIntentHandler`, tipo INTENT) usam o mesmo `ensureLead`.
3. **Distribuição** na mesma transação (`resolveLeadAssignee`): responsável principal do empreendimento → substituto → corretor responsável pelo imóvel → rodízio (se o modo for ROUND_ROBIN) → **fila "Sem responsável"** com motivo (`queueReason`: NO_ELIGIBLE, MANUAL_MODE…).
4. A oportunidade aparece em Contatos, no Kanban, no Início e, se tiver conversa, em Mensagens.

**Cadastro manual** ("Registrar contato", `RegisterLeadForm.tsx` → `POST /leads`, `registerLeadHandler`): a equipe escolhe imóvel, e-mail ou telefone, canal (telefone, WhatsApp, plantão, indicação…) e observação. **O cliente precisa já ter conta no Zhivago**. Sem conta, a API responde "Peça ao cliente para se cadastrar". Se a mesma pessoa e o mesmo imóvel já existem, registra uma nova entrada em vez de duplicar. Corretor que registra fica como responsável. Gestor só fica se marcar a opção. A caixa "Já falei com o cliente" conta como 1ª resposta (só telefone/WhatsApp).

> Isso limita muito o uso no plantão e no telefone: o lead que não tem conta não entra no CRM. É uma decisão de produto, não de interface, mas pesa na repaginação (ver §5).

### 1.3 A mesma pessoa interessada em dois imóveis

Exemplo: Ana pergunta pelo Apto Savassi e pelo Apto Funcionários.

| Onde | O que aparece |
|---|---|
| **Banco** | 2 Leads, 2 conversas, cada um com seu responsável, tarefas e visitas. |
| **Contatos › Pessoas** | 1 linha "Ana" com "2 · Visita agendada, Contatado" num `<details>` fechado. Abrindo, uma linha por imóvel com etapa, responsável, origem, próxima ação e "Abrir conversa". |
| **Contatos › Oportunidades** | 2 linhas independentes. |
| **Kanban** | 2 cartões, possivelmente em colunas diferentes. Nada indica que são a mesma pessoa. |
| **Mensagens** | 2 conversas separadas ("Ana · Apto Savassi", "Ana · Apto Funcionários"). |
| **A quem pertence** | A **cada oportunidade**. Como a distribuição é por imóvel (empreendimento/corretor do anúncio), **as duas podem cair com corretores diferentes**. |

Consequência importante: o corretor só enxerga oportunidades atribuídas a ele (`workspaceLeadScope`, `lib/workspace.ts`). Se Ana estiver dividida entre Bruno e Carla, **Bruno vê Ana com 1 oportunidade e não sabe que existe a outra**. O gestor vê as duas.

### 1.4 Atribuição e transferência

- Gestão (OWNER/ADMIN/MANAGER) atribui ou transfere pela **página da oportunidade** (`TransferLeadForm.tsx`) ou em lote na **fila Sem responsável** (`BulkAssignForm`). Também pode "assumir" um item da fila (`ClaimLeadButton`).
- A lista de destino mostra quem pode receber e por quê não (pausado, papel inelegível) e quantas oportunidades em aberto cada um tem. Transferir **exige motivo** e mostra o impacto: tarefas pendentes, visitas futuras e conversas. Há opção de levar o trabalho aberto junto (`moveOpenWork`).
- **Na conversa**, a troca é imediata: `syncConversationParticipantsTx` remove o responsável anterior e adiciona o novo. O histórico de mensagens é preservado, mas **o corretor anterior perde o acesso** e o novo passa a ver tudo.
- **Quem pode agir:** gestão age em qualquer oportunidade. O corretor age só nas suas. ASSISTANT lê tudo e não altera nada (`resolveLeadAccess` / `canViewLeadAccess`).
- **Gestor não lê conversas** de que não participa: o link "Abrir conversa" só aparece para participantes (`opportunitySelect` filtra conversas por `participants.some(viewer)`). Na página da oportunidade, o gestor vê "Conversa com o responsável atual" sem acesso ao conteúdo.
- Quando um integrante sai, `planAndApplyMemberDeparture` redistribui as oportunidades abertas ou as manda para a fila.

### 1.5 A tela de Contatos hoje (`/empresa/contatos`)

Arquivo: `zhivago-web/apps/web/src/app/(workspace)/empresa/contatos/page.tsx`. API: `GET /organizations/contacts` (`workspace.controller.ts`).

De cima para baixo:

1. **Cabeçalho:** "Contatos" (h1 28 px) e subtítulo ("Todas as pessoas e oportunidades da imobiliária — novas, em andamento, ganhas e perdidas"). À direita fica o botão **Registrar contato**, que abre um formulário inline no próprio cabeçalho.
2. **Abas de visão:** Pessoas (N) | Oportunidades (N).
3. **Barra de filtros** (cartão): busca (nome, e-mail, telefone ou imóvel), ordenação (atividade, nome, data de entrada; em Oportunidades também próxima ação e tempo sem resposta) e "Filtros" recolhível com etapa, origem, modalidade, responsável, "só sem responsável", empreendimento, motivo de perda e datas de entrada. Seguem os botões **Aplicar** e **Limpar**.
4. **Abas de situação:** Todos | Novos | Em andamento | Ganhos | Perdidos.
5. **Contagem:** "N pessoas · M oportunidades nos filtros".
6. **Tabela**, com 25 por página e Anterior/Próxima:
   - *Pessoas:* Pessoa (avatar, nome, "Desde dd/mm/aaaa") · Canais (e-mail e telefone por extenso, clicáveis) · Oportunidades e etapas (resumo + `<details>` com cada imóvel) · Última atividade (data/hora + "há X") · Ações ("Ver ficha").
   - *Oportunidades:* Cliente e imóvel · Etapa (+ motivo de perda + selo de SLA) · Responsável e origem · Entrada e idade da última atividade · Próxima ação · Ações ("Abrir oportunidade", "Abrir conversa").
7. **Ficha da pessoa** (`/empresa/contatos/[userId]`, **página inteira**): nome, e-mail e telefone, tabela de oportunidades com as mesmas colunas e "Entradas recentes". **Não há nenhuma ação** na ficha: não dá para registrar contato, criar tarefa ou ler mensagens. Tudo isso fica na **página da oportunidade** (`/imobiliaria/leads/[id]`).

O que já está bem resolvido:
- **O estado da lista fica na URL.** A ficha recebe `?back=` com visão, filtros e página (`page.tsx`, linhas 68–98).
- **Erro de carregamento** tem tratamento próprio e diferente do estado vazio.
- **A busca encontra o telefone com ou sem máscara** (`userIdsByPhone`).
- O **selo de SLA** em listas só aparece quando pede ação: em risco, atrasado ou sem responsável (`SlaBadge.tsx`).
- O **escopo por papel é idêntico** em Contatos, Kanban e Início (`buildLeadWhere` + `workspaceLeadScope`).

### 1.6 Para que serve cada tela, na prática

| Tela | Rota / arquivo | Serve para | Limite |
|---|---|---|---|
| **Início** | `/empresa` — `empresa/page.tsx` | Já é uma **fila do dia**: "Novos sem resposta", "SLA vencido", "Sem responsável", "Próximas tarefas", "Visitas de hoje", além de métricas e rankings de imóveis. | Cada bloco mostra até 6 itens e manda para outras telas. Não dá para agir ali. |
| **Contatos** | `/empresa/contatos` | Base consultável de pessoas e oportunidades, com filtros. | Só lista. Para agir é preciso navegar até a oportunidade. |
| **Sem responsável** | `/empresa/fila` | Fila da gestão, do mais antigo para o mais novo, com motivo, atribuição em lote e "assumir". | Atribuir um item específico manda para a página da oportunidade ("Atribuir na ficha"). |
| **Kanban** | `/imobiliaria` — `imobiliaria/page.tsx` | Funil por etapa (8 colunas) e aba **Métricas** para a gestão. | Muda etapa por `<select>`, sem arrastar. Mostra 100 por página, então em bases grandes as colunas exibem "N nesta etapa em outras páginas". O link do cartão **não leva `back`**: ao voltar, filtros e página se perdem (linha 262). |
| **Mensagens** | `/empresa/mensagens` | Lista de até 100 conversas da imobiliária em que você participa, com o status Em atendimento/Encerrada. Clicar abre o **chat flutuante** (`ChatSidebar.tsx`). | O `slaStatus` vem da API, mas **não é exibido**. Não há filtro "não respondidas". Gestor não vê conversas alheias. |
| **Página da oportunidade** | `/imobiliaria/leads/[id]` | Onde tudo acontece: etapa, transferência, registrar contato, tarefas, visitas, linha do tempo filtrável. | Página longa e vertical. A conversa não aparece nela, apenas um link. |
| **Equipe** | `/equipe` | Membros, convites, "recebendo leads", modo de distribuição. | — |

**Trocas de tela para terminar uma tarefa comum** (corretor responde Ana e agenda retorno):
Início → (clica Ana) página da oportunidade → "Abrir conversa" → `/empresa/mensagens` com o chat flutuante → responde → volta → página da oportunidade → registra contato → cria tarefa → "Voltar" (para o Início, que era o `back`). São **quatro navegações de página** para um único atendimento, e o contexto da lista se perde no caminho.

---

## 2. Crítica da experiência atual

### 2.1 O corretor, de manhã

> Quer saber: quem precisa de resposta, qual imóvel motivou o contato e o que ficou combinado.

| # | O que tenta fazer | Como faz hoje | Onde perde tempo ou contexto | O que resolveria |
|---|---|---|---|---|
| C1 | Ver quem precisa de resposta | Começa no Início (blocos "Novos sem resposta" e "SLA vencido") ou em Contatos › Oportunidades › ordenar por "Tempo sem resposta" › **Aplicar** | Contatos abre por padrão em **Pessoas por atividade recente**, uma ordem que não reflete urgência. Para ver urgência é preciso trocar de aba, mudar a ordenação e ainda clicar em Aplicar. O "sem resposta" atual só mede a **1ª resposta**: se Ana escreveu de novo ontem à noite, nada na lista indica isso (só o contador de não lidas no chat). | Visão padrão **"Precisa de mim"**, aberta já ordenada por urgência, com o motivo escrito na linha ("Sem 1ª resposta · 5 h", "Tarefa vence hoje 10:00"). |
| C2 | Saber qual imóvel motivou o contato | Em Pessoas, abre o `<details>` da linha. Em Oportunidades, o imóvel aparece em texto cinza 12 px abaixo do nome. | Na visão por pessoa, o imóvel, que é a informação mais importante, fica **escondido atrás de um clique**. A coluna "Canais", com o e-mail por extenso, ocupa a largura que deveria ser do imóvel. | O imóvel vira coluna própria, sempre visível, com miniatura. E-mail e telefone viram ícones de ação. |
| C3 | Lembrar o que ficou combinado | Abre a oportunidade e procura em "Tarefas", "Visitas" e "Linha do tempo" (seções empilhadas). | O "combinado" está espalhado entre a nota da interação, o título da tarefa e a última mensagem do chat, que fica em outra tela. A lista mostra só o título da próxima tarefa. | No painel lateral: "Último contato" (texto da interação ou da última mensagem) acima de "Próximo passo". |
| C4 | Responder e registrar | Quatro navegações (ver §1.6). | Cada ida e volta recarrega a página e **perde a posição de rolagem**. O "Voltar" é um `Link` para a URL salva, ou seja, uma navegação nova. No comportamento padrão do Next.js, isso leva ao topo da página. [Hipótese: não verificado visualmente] | Painel lateral sobre a lista, sem sair de `/empresa/contatos`. Fechar devolve a lista exatamente onde estava. |
| C5 | Ver Ana como uma pessoa só | Em Contatos › Pessoas, sim. No Kanban e em Mensagens, não. | O Kanban, tela que muitos corretores devem usar como "minha mesa" [Hipótese], fragmenta a cliente. | Agrupamento por pessoa como padrão, com sublinhas por imóvel. |

### 2.2 O gestor

> Quer identificar atendimentos sem responsável, distribuir oportunidades e acompanhar negociações paradas.

| # | O que tenta fazer | Como faz hoje | Onde perde tempo ou contexto | O que resolveria |
|---|---|---|---|---|
| G1 | Ver os sem responsável | Tem três caminhos: item "Sem responsável" no menu, filtro "Só sem responsável" escondido em Contatos › Filtros e atalho no Kanban. | Três lugares com recortes ligeiramente diferentes: a fila mostra só os abertos, enquanto o filtro de Contatos inclui ganhos e perdidos se a aba for "Todos". Mesmo dado, apresentado de formas diferentes. | Uma visão salva "Sem responsável" dentro de Contatos, com contador no menu, mantendo as ações de atribuir em lote e assumir. |
| G2 | Distribuir uma oportunidade | Na fila, marca as caixas e usa o lote. Para atribuir uma só, vai à página da oportunidade, escolhe o corretor e confirma. | A decisão de quem recebe depende de ver a carga de cada um ("3 em aberto"), informação que só aparece **dentro** do `<select>` de transferência. | Atribuição inline na linha (menu com carga e elegibilidade, como no `TransferLeadForm`), sem sair da lista. |
| G3 | Encontrar negociações paradas | Não há visão para isso. A API já aceita `activityFrom/activityTo` (`crm-query.ts`), mas a tela não expõe esse filtro. Ordenar por "Atividade mais recente" mostra o oposto do que ele precisa. | Precisaria exportar dados ou percorrer o Kanban coluna por coluna. | Visão "Parados há +7 dias" (etapas em andamento, sem atividade desde então), usando o filtro que a API já tem. |
| G4 | Entender por que um atendimento travou | Abre a oportunidade e lê a linha do tempo. | **Não pode ler a conversa** (não é participante). Vê só "Conversa com o responsável atual". | Decisão de produto: dar ao gestor leitura (somente leitura) das conversas da imobiliária. Hoje não existe [ver §5]. |

### 2.3 Hierarquia visual e uso do espaço

- **Faixas antes do primeiro resultado:** cabeçalho, abas Pessoas/Oportunidades, barra de filtros (que quebra em duas linhas, porque o "Filtros" recolhível tem `flex-basis: 100%`), abas de situação, contagem e cabeçalho da tabela. **Estimativa pelo CSS:** cerca de 400–430 px antes da primeira linha num monitor de 900 px de altura. Sobra espaço para **5 ou 6 pessoas visíveis**, já que cada linha da visão Pessoas tem duas linhas de texto e padding de 14 px. [Estimativa: medir com dados reais]
- **Dois grupos de abas separados por um formulário.** As abas de visão (Pessoas/Oportunidades) ficam **acima** dos filtros e as de situação (Novos/Em andamento…) **abaixo**. Não fica claro qual controle manda em qual. Além disso, a aba de situação e o filtro "Etapa" podem se contradizer: "Em andamento" + "Etapa: Perdido" resulta em zero, sem nenhum aviso.
- **Modelos de aplicação misturados:** abas são links (aplicam na hora), enquanto busca, ordenação e filtros dependem do botão **Aplicar**. Trocar a ordenação e esquecer o Aplicar não muda nada.
- **Largura:** a página tem `max-width: 1440px` com padding de 36 px. Em 1920 px, com a barra lateral de 252 px, sobra uma faixa vazia à direita, enquanto a coluna "Canais" (e-mail por extenso) disputa espaço com o imóvel, que está escondido.
- **Ações como texto rosa** ("Ver ficha", "Abrir oportunidade", "Abrir conversa") em todas as linhas: muitos pontos rosa competem entre si, e a linha em si não é clicável.
- **Rosa demais:** o botão "Novo anúncio" na barra lateral (rosa cheio), o "Aplicar" (rosa com sombra), as abas ativas (rosa claro), o selo da etapa "Novo" (tom `accent`, rosa) e os links rosa por linha. Com isso, o rosa deixa de sinalizar prioridade.
- **"Novo anúncio" × "Registrar contato":** no CRM, a ação mais forte na tela é "Novo anúncio" (botão rosa cheio, fixo no menu), enquanto "Registrar contato" é um botão menor no cabeçalho. Para quem está atendendo, a prioridade está invertida.

### 2.4 Estados vazios

O código tenta diferenciar (linha 203: `state.toString() ? "Nenhum resultado para estes filtros" : "Nenhum contato ainda"`), mas:
- `state` inclui `view`, `sort` e `stage`. Uma imobiliária **sem nenhum contato** que clica na aba "Oportunidades" ou muda a ordenação recebe "**Nenhum resultado para estes filtros**", o que está errado. O Kanban resolve isso com `allTotal`, mas a API de Contatos não devolve esse número.
- "Nenhum contato ainda" não oferece **nenhuma ação**: não há "Registrar contato", "Publicar anúncio" nem explicação de como os contatos chegam.
- "Nenhum resultado para estes filtros" não diz **quais** filtros estão ativos e não traz um botão "Limpar" junto. O "Limpar" fica lá em cima, na barra.

### 2.5 Voltar à lista

- **Funciona:** Contatos → ficha → Voltar preserva visão, filtros e página.
- **Não funciona:** a posição de rolagem (ver C4). O Kanban → oportunidade **perde até os filtros**. Início → oportunidade volta para o Início. Mensagens abre o chat **trocando de rota** para `/empresa/mensagens`, e quem estava em Contatos sai de Contatos.

### 2.6 O que preservar

1. Estado da lista na URL (links compartilháveis e recarregáveis).
2. A regra "1 cliente + 1 imóvel = 1 oportunidade" e a entrada repetida sem duplicar.
3. A transferência com motivo obrigatório e o **impacto antes de confirmar**: é o melhor fluxo do CRM.
4. O selo de SLA só quando pede ação.
5. O escopo único por papel em todas as telas.
6. A linha do tempo filtrável da oportunidade.
7. Os componentes visuais: `badge` com tons, `avatar` com cor estável por nome, `tabs` em pílula, `emptyState`, tabela que vira cartão no celular.

---

## 3. Três direções de repaginação

Exemplo comum: **Ana Ribeiro** perguntou sobre o **Apto 3q Savassi** (visita agendada para quinta, 15h) e o **Apto 2q Funcionários** (ela mandou uma pergunta sobre o condomínio ontem às 21h e ainda não teve resposta).

### Direção A — "Central de Contatos"

*Tabela como elemento principal, visões salvas e detalhe lateral.*

- **Ao abrir:** barra de visões salvas ("Precisa de mim", "Minha carteira", "Parados"…), uma linha de busca e filtros em chips e logo abaixo a tabela, que ocupa a largura toda.
- **O que ocupa mais espaço:** a tabela, com uma linha por pessoa e sublinhas por imóvel.
- **Ação principal:** abrir a pessoa e registrar o próximo passo. No cabeçalho, "Registrar contato".
- **Ao clicar numa pessoa:** um painel lateral de cerca de 480 px desliza da direita, e a lista continua visível e rolável à esquerda.
- **Ana:** a linha mostra "2 imóveis" com duas sublinhas. Savassi tem o selo âmbar "Visita qui 15:00"; Funcionários tem o selo vermelho "Cliente aguardando · 13 h". O corretor clica na sublinha de Funcionários, o painel abre já nesse imóvel com a última mensagem dela, e ele responde (link para o chat) e registra "Retornar amanhã 10h".
- **Funciona melhor:** gestor e corretor com carteira grande; triagem, filtros, distribuição em lote; imobiliárias com centenas de registros.
- **Torna mais difícil:** responder mensagens continua no chat, porque o painel mostra a mensagem mas não substitui a conversa. Exige disciplina no desenho para não virar uma planilha fria.
- **Reaproveitamento:** alto. API de Contatos (`/organizations/contacts`), filtros (`buildLeadWhere`), estado na URL, `toOpportunity`, formulários de interação, tarefa e transferência. Componentes `table`, `badge`, `tabs`.

### Direção B — "Fila do Dia"

*Organizada pelo que exige ação agora.*

- **Ao abrir:** seções empilhadas por urgência: "Atrasados", "Clientes aguardando", "Vence hoje", "Visitas de hoje", "Novos". Cada item é um cartão com botão de ação ("Responder", "Ligar", "Concluir").
- **O que ocupa mais espaço:** a seção mais urgente. Quando ela é concluída, o item some da lista.
- **Ação principal:** "Resolver próximo" (abre o próximo item e, depois de agir, avança sozinho).
- **Ao clicar numa pessoa:** abre o item em modo foco (tela dividida: contexto à esquerda, ação à direita).
- **Ana:** aparece **duas vezes**: em "Clientes aguardando" (Funcionários) e em "Visitas de hoje/semana" (Savassi). O corretor resolve o item de Funcionários e o de Savassi continua na seção de visitas.
- **Funciona melhor:** corretor com rotina de atendimento intensa; métricas de SLA; primeiras horas do dia.
- **Torna mais difícil:** encontrar alguém que **não** está pendente ("aquela cliente de março"); visão de base; trabalho do gestor (distribuição, parados). Também depende de sinais que hoje **não existem** de forma confiável ("cliente aguardando" além da 1ª resposta, ver §5). Com dados fracos, a fila mente.
- **Reaproveitamento:** médio. O Início (`/organizations/workspace`) já calcula metade dos blocos. A lógica de "resolver e avançar" é nova.

### Direção C — "Ficha 360 do Cliente"

*Conversas, imóveis e negociações no mesmo contexto.*

- **Ao abrir:** uma lista estreita de pessoas à esquerda (estilo caixa de entrada) e, à direita, a ficha da pessoa selecionada com as conversas em abas por imóvel, os imóveis de interesse em cartões com foto e a linha do tempo unificada.
- **O que ocupa mais espaço:** a ficha e a conversa.
- **Ação principal:** responder a mensagem ali mesmo.
- **Ao clicar numa pessoa:** a ficha troca no painel direito.
- **Ana:** a ficha mostra dois cartões de imóvel, "Savassi · Visita qui 15h" e "Funcionários · 1 mensagem não respondida". A conversa de Funcionários abre embaixo e o corretor responde sem sair dali.
- **Funciona melhor:** atendimento conversacional de poucos clientes ao mesmo tempo; corretor de alto padrão.
- **Torna mais difícil:** triagem e distribuição (a lista estreita mostra pouco); trabalho do gestor, que **não pode ler conversas** hoje. Para ele, a ficha ficaria vazia justamente no centro. Também conflita com a regra de escopo: se Ana está dividida entre dois corretores, a "ficha 360" de cada um mostra só metade.
- **Reaproveitamento:** baixo a médio. Seria preciso embutir `ChatConversation.tsx` (1.275 linhas, hoje acoplado ao chat flutuante) e criar uma linha do tempo por pessoa que agregue vários Leads (hoje ela existe só por Lead).

### Comparação rápida

| Critério | A · Central de Contatos | B · Fila do Dia | C · Ficha 360 |
|---|---|---|---|
| Corretor de manhã | Bom, com a visão "Precisa de mim" | **Ótimo**, se os sinais forem confiáveis | Bom para poucos clientes |
| Gestor | **Ótimo** | Fraco | Fraco (não lê conversas) |
| Base com centenas de registros | **Ótimo** | Bom só para pendências | Fraco |
| Onde Ana aparece dividida | Sublinhas na mesma linha | Em duas seções | Em dois cartões na ficha |
| Depende de capacidade nova | Pouco | Muito | Muito |
| Reaproveitamento | **Alto** | Médio | Baixo/médio |

### Recomendação

**Direção A, a Central de Contatos, organiza a tela principal.** Dela vem a estrutura: tabela, visões salvas e painel lateral. Das outras duas, entram apenas peças:

- **De B:** a visão salva **"Precisa de mim"** como padrão do corretor, com o **motivo** da urgência escrito na linha. Ela é uma visão da tabela, não uma tela separada.
- **De C:** o painel lateral organizado **por pessoa, com troca entre imóveis**, mostrando a última mensagem e o último contato.

Por que A, com base no produto encontrado:
1. **O modelo é centrado na oportunidade.** Responsável, conversa, tarefa, visita e SLA estão todos no Lead. Uma tabela com agrupamento por pessoa representa isso com fidelidade. A Ficha 360 teria de esconder que Ana pode ter dois donos.
2. **O backend já sustenta A.** Filtros, ordenação por urgência (`sort=waiting`, `sort=nextAction`), agrupamento por pessoa e estado na URL já existem. B e C dependem de sinais e permissões que não existem (§5).
3. **O gestor é usuário de primeira classe** (fila, distribuição, transferência com impacto) e é quem mais perde em B e C.
4. **O Início já faz o papel da "fila"** com blocos, então B duplicaria uma tela existente. A pode **absorver** os blocos do Início como visões salvas, e o Início volta a ser painel de indicadores.

---

## 4. A versão recomendada, descrita para protótipo

Referência de tela: desktop de 1440 × 900, barra lateral expandida.

### 4.1 Menu lateral

| Item | Proposta |
|---|---|
| Início | Fica. Passa a ser **indicadores** (métricas, imóveis mais vistos, evolução). Os blocos de ação ("Novos sem resposta", "SLA vencido"…) viram links para as visões salvas de Contatos. |
| **Atendimentos** (renomear "Contatos") | Fica e passa a ser **o destino principal**. Ganha um contador ao lado do nome: número de itens em "Precisa de mim" (corretor) ou "Sem responsável" (gestor), pílula neutra; vermelha só se houver atraso de SLA. [Proposta: nome a validar. "Atendimentos" descreve o trabalho; "Contatos" descreve o cadastro.] |
| ↳ Sem responsável | **Deixa de ser página própria** e vira uma visão salva. Para manter o acesso rápido, fica como **subitem recuado** sob Atendimentos, visível só para gestão, com contador âmbar. Clicar leva a `/empresa/contatos?visao=sem-responsavel`. |
| Kanban | Fica nesta fase. Em fase posterior, vira o **modo "Funil"** dentro de Atendimentos (alternador Lista/Funil no canto da área de trabalho), e "Métricas" vai para o Início. |
| Imóveis | Fica. Recebe o botão "Novo anúncio" no cabeçalho, onde já existe. |
| Mensagens | Fica (o chat é outra ferramenta). Ganha o mesmo contador de não lidas do chat flutuante. |
| Reservas / Temporada, Equipe, Configurações | Ficam. |
| Botão "Novo anúncio" (rosa, topo do menu) | **Sai do menu.** No lugar entra um botão neutro "+ Novo" (contorno) com menu: Registrar contato · Novo anúncio · Importar imóveis. O rosa cheio fica reservado para a ação principal de cada página. |

### 4.2 Cabeçalho da página

```
Atendimentos                                         [ Exportar ]  [ + Registrar contato ]
Sua carteira · 34 pessoas · 41 imóveis em aberto
```

- Título h1 em **22 px** (hoje 28 px) e subtítulo de uma linha só com números, em vez do texto explicativo atual. Altura total de cerca de 64 px.
- **"Registrar contato"** é o único botão rosa cheio da página. Abre um **modal** de 520 px, em vez do formulário inline que empurra o layout. Ordem dos campos: e-mail ou telefone (com busca da conta antes do imóvel, mostrando "Ana Ribeiro · conta encontrada"), imóvel, canal, observação, "já falei" e "ficar como responsável".
- "Exportar" (contorno) é **[Proposta]**: não existe exportação de contatos hoje.

### 4.3 Área de trabalho

De cima para baixo, numa faixa única colada ao topo da tabela:

**Linha 1: visões salvas** (abas em pílula, componente `tabs` atual, com contador):

- Corretor: **Precisa de mim (7)** · Minha carteira (34) · Visitas e tarefas (5) · Parados +7 dias (3) · Encerrados
- Gestor: **Sem responsável (12)** · Atrasados (4) · Toda a carteira (418) · Parados +7 dias (21) · Encerrados
- A primeira aba é o padrão ao abrir. As visões substituem **os dois** grupos de abas atuais (Pessoas/Oportunidades e Todos/Novos/Em andamento/Ganhos/Perdidos).

**Linha 2: busca e filtros** (sempre visível, uma linha só):

```
[🔍 Nome, telefone, e-mail ou imóvel     ]  [Responsável ▾] [Etapa ▾] [Imóvel ▾] [+ Filtros]   Ordenar: Urgência ▾   ☰ Agrupar por pessoa ✓
```

- **Sempre visíveis:** busca, Responsável (só gestão), Etapa, Imóvel. São os quatro recortes de uso diário.
- **Recolhidos em "+ Filtros"** (popover de 360 px): origem, modalidade, empreendimento, data de entrada, última atividade, motivo de perda (só aparece com Etapa = Perdido).
- **Aplicação imediata** em busca (Enter ou pausa de 300 ms), chips e ordenação, atualizando a URL. **Botão "Aplicar" só dentro do popover**, porque lá há campos que se completam em conjunto (intervalo de datas) e aplicar a cada campo geraria recargas inúteis.
- Filtro ativo vira um chip preenchido com "×" ("Etapa: Visita agendada ×"). Se houver algum ativo, aparece "Limpar filtros" ao final da linha.
- **Etapa** deixa de existir como aba e como select ao mesmo tempo, o que elimina a contradição atual.
- **Agrupar por pessoa** (ligado por padrão) substitui as abas Pessoas/Oportunidades. Desligado, a tabela mostra uma linha por imóvel, igual à visão Oportunidades de hoje.
- **Ordenações:** Urgência (padrão em "Precisa de mim"), Próximo passo, Última atividade, Entrada, Nome.

**Linha 3: contagem e ações em lote** (só aparece com itens selecionados):
`3 selecionados · [Atribuir a… ▾] [Mudar etapa ▾] · Cancelar`

Altura somada das linhas 1 e 2: cerca de 104 px. **Primeira linha da tabela a cerca de 210 px do topo** (hoje, cerca de 420 px estimados), o que deixa umas **11 linhas visíveis** em 900 px.

### 4.4 Lista preenchida

Colunas propostas (visão "Precisa de mim", agrupada por pessoa, perfil corretor):

| ☐ | Cliente | Imóvel de interesse | Por que agora | Próximo passo | Etapa | Última atividade |
|---|---|---|---|---|---|---|
| ☐ | **Ana Ribeiro** · 📞 ✉ | **2 imóveis** ▾ | 🔴 Cliente aguardando · 13 h | Visita qui 28/11 15:00 | 2 em andamento | há 13 h |
| | ↳ | Apto 2q Funcionários · Venda | 🔴 Cliente aguardando · 13 h | — | Contatado | há 13 h |
| | ↳ | Apto 3q Savassi · Venda | | Visita qui 28/11 15:00 | Visita agendada | há 2 dias |
| ☐ | **Carlos Menezes** · 📞 | Casa Pampulha · Aluguel | 🟠 Sem 1ª resposta · 3 h | — | Novo | há 3 h |
| ☐ | **Juliana Prado** · 📞 ✉ | Cobertura Belvedere · Venda | 🟡 Tarefa vence hoje 10:00 | Enviar proposta revisada | Proposta | há 4 dias |

O que cada coluna faz e por quê:

- **Cliente:** nome em 14 px semibold. Telefone e e-mail viram **ícones** (`tel:`/`mailto:`), com o valor completo no tooltip e no painel. Sai a coluna "Canais" e o "Desde dd/mm/aaaa" (vai para o painel).
- **Imóvel de interesse:** passa a ser coluna de primeira classe. Com 1 imóvel, mostra nome e modalidade. Com mais de um, mostra "**N imóveis** ▾" e as sublinhas abrem **por padrão** quando algum imóvel está na visão atual (ou seja, quando é ele que justifica a urgência). Miniatura 32 × 24 px **[Proposta: a API de Contatos não devolve imagem hoje]**.
- **Por que agora:** a coluna nova mais importante. Diz **o motivo** de a linha estar ali, com a idade. Cada indicador existe porque leva a uma ação:
  - "Sem 1ª resposta · 3 h" → responder ou ligar (fonte: SLA atual, confiável).
  - "Tarefa vence hoje 10:00" / "Tarefa atrasada" → executar ou reagendar (fonte: `LeadTask.dueAt`, confiável quando a tarefa existe).
  - "Visita hoje 15:00" → confirmar (fonte: `Visit`, confiável).
  - "Cliente aguardando · 13 h" → responder mensagem **[depende de expor dado existente, §5]**.
  - "Sem atividade há 9 dias" → retomar ou encerrar (fonte: `lastActivityAt`, confiável como "atividade", não como "contato").
  - Na linha da pessoa aparece **o motivo mais urgente** entre os imóveis dela.
- **Próximo passo:** o `nextAction` atual. Sem próximo passo em etapa ativa, mostra "Definir próximo passo" em cinza, como convite (abre o painel nesse campo).
- **Etapa:** `badge` atual. Na linha da pessoa com vários imóveis, resumo ("2 em andamento").
- **Última atividade:** **só relativa** ("há 13 h"), alinhada à direita, com a data completa no tooltip. Hoje a tela mostra as duas formas.
- **Responsável:** coluna extra, **só na visão do gestor**, inserida depois de Cliente, com avatar de 20 px e nome. Em "Sem responsável", vira o botão "Atribuir ▾" (menu com carga "3 em aberto" e elegibilidade, a mesma lista do `TransferLeadForm`).
- **Fora da lista** (ficam no painel): origem, data de entrada, e-mail e telefone completos, motivo de perda, empreendimento, histórico de entradas.
- **A linha inteira é clicável** e abre o painel. Somem os links "Ver ficha", "Abrir oportunidade" e "Abrir conversa" de cada linha. Ao passar o mouse, aparecem à direita **dois ícones**: 💬 (abre o chat flutuante daquele imóvel, **sem trocar de rota**) e ✓ (registrar contato rápido).

### 4.5 Detalhe aberto: o corretor clica em Ana

**Painel lateral à direita, 480 px**, ocupando a altura da área de conteúdo. A tabela continua visível à esquerda, encolhe e esconde as colunas "Etapa" e "Última atividade" enquanto o painel está aberto. A linha de Ana fica destacada com fundo `--accent-light` e barra rosa de 3 px à esquerda. A URL ganha `?pessoa=<userId>&imovel=<leadId>`, para que um link copiado abra o mesmo estado.

De cima para baixo:

1. **Cabeçalho do painel:** avatar 40 px, **Ana Ribeiro**, "Cliente desde 12/10/2026 · 2 imóveis". Ações em ícone: 📞 ligar, ✉ e-mail, 🟢 WhatsApp (link `wa.me`) **[Proposta]**. No canto: ⤢ "Abrir página completa" (a página da oportunidade atual) e ✕.
2. **Seletor de imóvel:** cartões horizontais compactos, um por imóvel (rola se houver mais de 3):
   ```
   ┌───────────────────────────┐ ┌───────────────────────────┐
   │ Apto 2q Funcionários      │ │ Apto 3q Savassi           │
   │ Contatado · 🔴 aguardando │ │ Visita agendada · qui 15h │
   └───────────────────────────┘ └───────────────────────────┘
   ```
   O ativo tem borda rosa de 2 px. Abre por padrão no imóvel que motivou a urgência da linha (Funcionários). Imóveis encerrados aparecem depois, esmaecidos.
3. **Resumo do imóvel ativo** (lista de definições em duas colunas): Etapa (select, se puder alterar) · Responsável (com "Transferir" para a gestão) · Origem · Entrada · 1ª resposta.
4. **Última conversa:** as **3 últimas mensagens** da conversa desse imóvel, em balões compactos (13 px). A última de Ana fica em destaque: *"O condomínio inclui água? E aceita pet?" · ontem 21:04*. Abaixo, o botão **"Responder no chat"**, que abre o chat flutuante nessa conversa **sem sair da página** (o `ChatSidebar` já é global; basta chamar `openSidebar(id)` em vez de navegar para `/empresa/mensagens`).
   - Para quem não participa da conversa (gestor), mostra "Conversa visível apenas para o responsável (Bruno)". Isso é coerente com a regra atual.
   - **[Depende de API]:** as mensagens existem em `GET /conversations/:id/messages` para participantes, mas carregar só as 3 últimas, e de dentro do painel, pede um parâmetro de limite ou um campo no detalhe da pessoa.
5. **Último contato registrado:** a interação mais recente (tipo, autor, texto). Exemplo: "Ligação · você · 25/11 — Ana prefere visitas à tarde".
6. **Próximo passo (bloco fixo no rodapé do painel)**, sempre visível sem rolar:
   ```
   O que aconteceu?  ( Liguei ) ( WhatsApp ) ( E-mail ) ( Nota )   ☐ não atendeu
   [ Resumo… ______________________________________ ]
   Próximo passo     [ Retornar sobre condomínio e pet ]  [ amanhã ▾ ] [ 10:00 ]
                                                     [ Salvar ]   (rosa)
   ```
   Um único "Salvar" grava a **interação** (`POST /leads/:id/interactions`) e a **tarefa** (`POST /leads/:id/tasks`), as duas chamadas que já existem. Quem não pode alterar (ASSISTANT, ou corretor olhando algo que não é seu) vê o bloco desabilitado, com o motivo.
7. **Linha do tempo** (recolhida, "Ver histórico · 14 eventos"): o componente atual, com os mesmos filtros.

**Alternar entre os imóveis:** clicar no cartão de Savassi troca as seções 3 a 7 sem fechar o painel. O cabeçalho da pessoa fica. Na lista, a sublinha de Savassi passa a ficar destacada.

**Ao fechar** (✕, Esc ou clique numa área vazia da lista): o painel recolhe, a tabela volta à largura total **na mesma posição de rolagem** (não houve navegação) e a linha de Ana pisca o destaque por 1 s. Se Ana deixou de cumprir o critério da visão (por exemplo, saiu de "Precisa de mim" porque o próximo passo foi registrado), a linha **fica visível esmaecida com "✓ resolvido"** até a próxima atualização, para não "pular" a lista debaixo do cursor. **[Proposta]**

**Navegação por teclado:** ↑/↓ muda a pessoa com o painel aberto e Enter abre o painel. Isso vale tanto para o corretor que percorre a fila quanto para o gestor que distribui.

### 4.6 Estados

**Primeira visita, sem nenhum contato** (decidido por um total **sem filtros** vindo da API, como o `allTotal` do Kanban):

```
        [ícone pessoas, rosa claro]
   Seus atendimentos vão aparecer aqui
   Cada interesse em um imóvel da imobiliária (mensagem, proposta,
   reserva ou clique no WhatsApp) vira um atendimento automaticamente.

   [ + Registrar contato ]   Ver imóveis publicados (3) →
```

Se a imobiliária não tiver imóvel publicado, o segundo link vira "Publicar primeiro imóvel". As abas e filtros **ficam ocultos** nesse estado, porque não há o que filtrar.

**Busca ou filtro sem resultados:**

```
   Nenhum atendimento para "Marcos" com Etapa: Proposta
   [ Limpar filtros ]   [ Buscar "Marcos" em toda a carteira ]
```

Diz o que está filtrando e oferece as duas saídas mais prováveis. Na visão "Precisa de mim" vazia, o tom é positivo: "Nada pendente agora. Próximo compromisso: visita com Ana, qui 15:00."

**Imobiliária com centenas de registros:**
- O gestor abre em "Sem responsável" (curta, acionável). "Toda a carteira" fica a um clique.
- Paginação de **50** linhas (hoje são 25), com "1–50 de 418" e números de página. Linhas de 48 px (com sublinhas de 40 px).
- A busca é o caminho principal para registros antigos, e por isso fica à esquerda e larga (máx. 420 px).
- Seleção em lote para atribuir ou mudar etapa.
- **[Hipótese]** As ordenações "Urgência" e "Próximo passo" calculam a chave em memória para todas as oportunidades do filtro (`workspace.controller.ts`, ramo `sort === 'nextAction' || 'waiting'`). Com milhares de registros, isso precisa ser medido antes de virar padrão.

### 4.7 Tela pequena (≤ 760 px)

- Barra superior atual (nome da imobiliária + menu). Abaixo, o título "Atendimentos" com o botão "+" (registrar) à direita.
- **Visões salvas** viram uma faixa horizontal rolável, com a primeira visível.
- **Busca** em largura total. "Filtros (2)" num botão que abre uma folha inferior com todos os filtros e **Aplicar** (no celular, aplicar em lote faz sentido, porque cada recarga custa mais).
- **Cada pessoa vira um cartão** de 3 linhas:
  ```
  Ana Ribeiro                              há 13 h
  Apto 2q Funcionários  +1
  🔴 Cliente aguardando · 13 h       [📞] [💬]
  ```
  Ficam visíveis: nome, imóvel do motivo, motivo/urgência e as duas ações de contato (ligar, chat). Saem do cartão: etapa, próximo passo e responsável (vão para o detalhe).
- **Tocar no cartão** abre o detalhe **em tela cheia** (folha que sobe), com a mesma estrutura do painel: seletor de imóvel em carrossel, última conversa, e o bloco "Próximo passo" fixo no rodapé. "Voltar" retorna à lista na mesma posição.

### 4.8 Decisões visuais

| Tema | Decisão | Por quê |
|---|---|---|
| Largura | A página de Atendimentos remove o `max-width: 1440px` e usa a largura disponível (fluida até cerca de 1680 px). | A tabela e o painel de 480 px precisam caber lado a lado em 1440 px: 1440 − 252 (menu) − 480 = 708 px para a tabela, suficiente para Cliente, Imóvel, Por que agora e Próximo passo. Com o menu recolhido (76 px), sobra mais. |
| Densidade | Linhas de 48 px (padding vertical 10 px em vez de 14 px), uma linha de texto por célula. | Dobra o número de linhas visíveis. A informação secundária vai para o painel. |
| Alinhamento | Texto à esquerda; idades e datas à direita com `font-variant-numeric: tabular-nums`; selos alinhados pelo início. | Permite comparar "há 3 h" e "há 13 h" de relance. |
| Tipografia | h1 22 px; nome 14 px/600; corpo 13 px; meta 12 px em `--muted`; cabeçalho da tabela fica como está (11 px maiúsculas). | Menos peso no título, mais no conteúdo. |
| Rosa da marca | **Só três usos:** (1) o botão de ação principal da página ("Registrar contato"; no painel, "Salvar"); (2) o item selecionado (visão ativa, linha aberta, imóvel ativo no painel); (3) foco de teclado. | Hoje há rosa em cinco papéis diferentes, e ele deixou de indicar prioridade. |
| Cores de estado | Vermelho = atraso ou cliente aguardando; âmbar = vence hoje / sem responsável; azul = agendado; cinza = encerrado. **A etapa "Novo" deixa de usar o tom `accent` (rosa) e passa para azul claro.** | Evita confundir "novo" com "selecionado" ou "principal". |
| Selos de etapa | Ficam (`badge` atual), mas na coluna de etapa, sem se misturar com os sinais de urgência. | Separa o "onde está no funil" do "o que fazer agora". |
| Botão "Aplicar" | Sai da barra principal e fica só no popover de filtros avançados e na folha de filtros do celular. | Um único modelo de aplicação, imediato, para os controles do dia a dia. |

### 4.9 O que sai, condensa ou muda de lugar

| Hoje | Proposta |
|---|---|
| Subtítulo explicativo longo do cabeçalho | Uma linha com números. |
| Abas Pessoas/Oportunidades **e** abas Todos/Novos/… | Uma única barra de **visões salvas** + alternador "Agrupar por pessoa". |
| Select "Etapa" escondido em Filtros + abas de situação | Um único chip "Etapa". |
| Coluna "Canais" com e-mail e telefone por extenso | Ícones ao lado do nome. |
| `<details>` com as oportunidades da pessoa | Sublinhas visíveis (abertas quando relevantes). |
| Links "Ver ficha", "Abrir oportunidade", "Abrir conversa" em cada linha | Linha clicável + 2 ícones ao passar o mouse. |
| Ficha da pessoa em página separada, sem ações | Painel lateral com ações. A página `/empresa/contatos/[userId]` pode continuar existindo para links diretos. |
| Data absoluta + relativa na última atividade | Só relativa, com a absoluta no tooltip. |
| "Abrir conversa" troca a rota para `/empresa/mensagens` | Abre o chat flutuante sem sair da página. |
| Página "Sem responsável" separada | Visão salva + subitem no menu. As ações (lote, assumir) vêm junto. |
| "Novo anúncio" rosa no topo do menu | Botão neutro "+ Novo" com menu. |
| Formulário "Registrar contato" inline no cabeçalho | Modal. |

---

## 5. Repaginação visual × evolução do produto

**Legenda de suporte:**
- **(I) Interface:** dá para fazer só reorganizando a tela com os dados que a tela já recebe.
- **(API) Expor dado existente:** o dado está no banco, mas a API de Contatos não o devolve ou não filtra por ele.
- **(Nova) Capacidade nova:** precisa de modelo, regra ou permissão que não existe.

### 5.1 Checagem dos indicadores pedidos

| Indicador | Há fonte confiável hoje? | Veredito |
|---|---|---|
| **"Retorno hoje"** | Só se o corretor criou uma **tarefa** com prazo (`LeadTask.dueAt`). Não existe campo "data de retorno". Sem tarefa, não há retorno. A API de Contatos devolve a próxima ação e ordena por ela, mas **não filtra** "vence hoje". O Início já busca as próximas tarefas (`/organizations/workspace`). | Usar o rótulo honesto **"Tarefa vence hoje"**, não "Retorno hoje". Ordenar é (I). Filtrar "vence hoje/atrasada" é (API). |
| **"Aguardando resposta"** | **1ª resposta: sim** (`LeadAssignment.firstContactAt` + `computeSlaStatus`, prazo de 4 h). **Resposta a mensagens posteriores: não exposto.** `Message.senderId`/`createdAt` permitem saber se a última mensagem é do cliente, mas a API de Contatos não calcula isso. Contato feito por WhatsApp ou telefone **fora do Zhivago** só aparece se o corretor registrar a interação. | "**Sem 1ª resposta**" é (I). "**Cliente aguardando**" é (API), com uma limitação a explicar ao usuário: considera só o chat do Zhivago e contatos registrados. |
| **"Última interação"** | `Lead.lastActivityAt` existe, mas é atualizado por **qualquer** atividade: mensagem do cliente ou da equipe, interação, tarefa criada ou concluída, visita, mudança de etapa, nova entrada. Não é "último contato com o cliente". | Mostrar como "**Última atividade**" é (I). "Último contato" de verdade (última interação com desfecho CONTACT ou última mensagem da equipe) é (API). |
| **"Negociação parada"** | Não existe data de entrada na etapa. `lastActivityAt` + o filtro `activityTo`, **que a API já aceita** (`leadFilterSchema`), permitem "etapa em andamento sem atividade desde X". "Tempo na etapa" exigiria derivar das interações STATUS_CHANGE ou criar um campo. | "**Sem atividade há +7 dias**" é (I): o filtro existe na API, só não está na tela. "**Parado na etapa há N dias**" é (API/Nova). |

### 5.2 Tabela de mudanças

| # | Mudança proposta | Benefício para o usuário | Suporte atual no código | Dependência | Prioridade |
|---|---|---|---|---|---|
| 1 | Painel lateral da pessoa com seletor de imóvel, mantendo a lista | Atender sem perder a posição. Elimina 3 das 4 navegações | `GET /organizations/contacts/:userId` já devolve as oportunidades da pessoa; formulários de interação e tarefa já existem | (I) | **P1** |
| 2 | Bloco "Próximo passo" (interação + tarefa num só Salvar) | Registrar o combinado em 10 s | `POST /leads/:id/interactions` e `/tasks` existem | (I) | **P1** |
| 3 | Visões salvas substituindo os dois grupos de abas | Abrir já no recorte certo, sem combinar controles | `stage`, `unassigned`, `overdue`, `sort`, `activityTo` existem na API | (I) | **P1** |
| 4 | Visão "Precisa de mim" (sem 1ª resposta + tarefa vencida/hoje + visita hoje) | O corretor sabe por onde começar | SLA e próxima ação existem. Falta um filtro que junte os três critérios ("OU") | (API): filtro composto | **P1** |
| 5 | Coluna "Por que agora" com o motivo | Entender a urgência sem abrir a linha | Derivável de `slaStatus` + `nextAction` já devolvidos | (I) | **P1** |
| 6 | Imóvel como coluna, sublinhas visíveis, canais em ícone | Ver o imóvel que motivou o contato | Dados já devolvidos | (I) | **P1** |
| 7 | "Responder no chat" abrindo o chat flutuante sem mudar de rota | Responder sem sair de Atendimentos | `ChatSocketProvider.openSidebar(id)` já existe | (I) | **P1** |
| 8 | Estado vazio correto (base vazia × filtros) com ações | Primeira visita útil; filtro sem resultado com saída | Lógica atual erra por usar `state` com `view`/`sort` | (API): devolver `allTotal` como no Kanban | **P1** |
| 9 | Filtros: chips imediatos + popover com Aplicar | Menos cliques, sem filtros "esquecidos" | Tudo existe | (I) | P2 |
| 10 | "Sem responsável" como visão + subitem no menu com contador | Acesso rápido à fila num lugar só | `unassigned=true` existe; o lote existe em `/leads/bulk-assign` | (I) | P2 |
| 11 | Atribuir na linha (menu com carga e elegibilidade) | Distribuir sem abrir a ficha | `GET /leads/assignees` + `assignLeadAction` existem | (I) | P2 |
| 12 | Visão "Sem atividade há +7 dias" | O gestor encontra negociações paradas | `activityTo` já aceito pela API | (I) | P2 |
| 13 | Últimas 3 mensagens no painel | Ler o que o cliente pediu sem abrir o chat | `GET /conversations/:id/messages` existe para participantes; falta limite ou campo resumido | (API) | P2 |
| 14 | "Cliente aguardando" (última mensagem é do cliente) | Não deixar mensagem sem resposta depois da 1ª | `Message.senderId` existe; não calculado | (API) | P2 |
| 15 | Filtro "Tarefa vence hoje / atrasada" | Organizar o dia | `LeadTask.dueAt` existe; sem filtro | (API) | P2 |
| 16 | Hierarquia do rosa, densidade, largura fluida, etapa "Novo" em azul | Prioridade visual legível | CSS de `Workspace.module.css` / `workspace-ui.ts` | (I) | P2 |
| 17 | Kanban preservar `back` e filtros ao abrir o cartão | Não perder o contexto no funil | Falta `?back=` no link do cartão (`imobiliaria/page.tsx`, linha 262) | (I) | P2 (correção pequena) |
| 18 | "+ Novo" neutro no menu; "Registrar contato" como principal no CRM | Ação certa em destaque | `WorkspaceShell.tsx` | (I) | P3 |
| 19 | Kanban como modo "Funil" dentro de Atendimentos | Uma tela só para a carteira | Kanban usa `/leads/workspace`, que tem filtros equivalentes | (I), mas é trabalho grande | P3 |
| 20 | "Último contato" real (CONTACT ou mensagem da equipe) | Saber quando se falou com o cliente de fato | `LeadInteraction.outcome` e `Message` existem | (API) | P3 |
| 21 | "Parado na etapa há N dias" | Gestão de funil precisa | Sem data de entrada na etapa | (Nova) ou derivação das interações STATUS_CHANGE | P3 |
| 22 | Miniatura do imóvel na lista | Reconhecimento visual rápido | `ListingImage` existe; não devolvido em Contatos | (API) | P3 |
| 23 | Gestor ler conversas da imobiliária (somente leitura) | Entender atendimentos travados | Hoje o acesso é só do participante (`syncConversationParticipantsTx`) | (Nova) + decisão de privacidade | Discutir |
| 24 | Registrar contato de quem **não tem conta** | Plantão e telefone entram no CRM | API exige conta existente (`registerLeadHandler`) | (Nova): contato sem usuário ou convite | Discutir (alto impacto) |
| 25 | Corretor saber que o cliente tem outro imóvel com outro corretor | Evitar atendimento duplicado ou contraditório | Escopo esconde por desenho (`workspaceLeadScope`) | (Nova) + decisão de produto | Discutir |
| 26 | WhatsApp como ação no painel | Contato no canal que o cliente usa | Telefone existe; link `wa.me` não | (I) | P3 |

### 5.3 Primeira entrega para prototipar e testar

**Escopo ("Atendimentos v0"), só itens P1, para o perfil corretor:**

1. Em `/empresa/contatos`: barra de visões com **"Precisa de mim"** como padrão e "Minha carteira". Na v0, "Precisa de mim" pode ser montada com os filtros e ordenações já existentes (`stage=ACTIVE`, `sort=waiting`), deixando o filtro composto (#4) para a versão seguinte.
2. Tabela agrupada por pessoa com as colunas **Cliente · Imóvel de interesse · Por que agora · Próximo passo · Última atividade**, sublinhas por imóvel e linha clicável.
3. **Painel lateral** com cabeçalho da pessoa, seletor de imóvel, resumo, bloco **Próximo passo** (interação + tarefa) e botão **"Responder no chat"** (chat flutuante, sem trocar de rota). As "últimas 3 mensagens" ficam de fora da v0.
4. Fechar o painel preserva a rolagem.

Fica de fora: visão do gestor, atribuição inline, Kanban, menu, mudanças de cor.

**Tarefa do teste** (com um corretor real, em base de demonstração com cerca de 30 pessoas e Ana configurada como no exemplo):

> "Bom dia. Antes da primeira visita, descubra qual cliente está esperando por você há mais tempo, sobre qual imóvel ela falou, e registre que você ligou para ela e combinou de retornar amanhã às 10h. Depois, passe para o próximo cliente que precisa de você."

**Critérios observáveis de sucesso:**
- O corretor conclui a tarefa **sem sair de `/empresa/contatos`**: nenhuma troca de rota, verificável pelo histórico do navegador ou pela gravação de tela.
- Identifica **o imóvel certo de Ana (Funcionários) na primeira tentativa**, sem abrir Savassi antes.
- Leva **até 90 segundos** do carregamento da página até o "Salvar". Para comparar, a mesma tarefa deve ser cronometrada **na tela atual** com o mesmo corretor ou outro de perfil parecido, antes do teste.
- Depois de salvar, chega ao próximo cliente da lista **sem rolar a página desde o topo**.
- Pergunta final, aberta: "O que você esperava ver nesta tela que não viu?" Registrar a resposta literal.

Se os quatro critérios forem atingidos e o tempo cair visivelmente em relação à tela atual, vale construir as entregas P2 (visão do gestor, cliente aguardando, últimas mensagens). Se o corretor procurar a conversa antes de qualquer outra coisa, é sinal de que a Direção C merece mais peso no painel.
