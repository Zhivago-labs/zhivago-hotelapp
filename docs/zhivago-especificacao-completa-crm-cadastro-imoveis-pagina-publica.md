# Zhivago — Especificação Completa de Refatoração
## Cadastro de Imóveis + Página Pública do Imóvel + CRM + Chat + Venda + Aluguel Mensal + Aluguel por Diária

**Escopo desta especificação:** WEB + Backend.  
**Mobile:** fora do escopo desta refatoração. O modelo, APIs e regras devem, porém, ficar preparados para o mobile usar a mesma base posteriormente.

**Data de referência:** 21/09/2026.

---

# 1. Resumo executivo

O Zhivago já possui uma base funcional para:

- cadastro de imóveis;
- venda, aluguel mensal e aluguel por diária;
- organizações/imobiliárias;
- membros da organização;
- distribuição de Leads;
- histórico de atribuição;
- interações;
- visitas;
- chat;
- reservas;
- propostas;
- moderação.

O problema principal não é falta de funcionalidades. É que **as regras estão parcialmente misturadas e algumas entidades estão sendo usadas para representar conceitos diferentes**.

Exemplos identificados no código atual:

1. A página pública trata um imóvel mensal como se fosse hospedagem, mostrando elementos como hóspedes, camas, check-in, checkout e calendário.
2. O formulário de anúncio possui campos de diária/hospedagem que continuam sendo enviados mesmo quando a modalidade não exige esses dados.
3. O modelo `Listing` concentra informações de venda, locação mensal e diária sem uma separação clara de regras comerciais.
4. O criador do imóvel e o responsável comercial estão acoplados demais.
5. A distribuição atual usa `Listing.agentId` como prioridade para corretor, mas ainda não existe responsabilidade explícita por empreendimento.
6. `receiveLeads` atualmente não contempla OWNER como participante da distribuição, embora o proprietário da imobiliária possa também atuar como corretor.
7. O chamado Round Robin atual usa aleatoriedade (`Math.random()`), portanto não é Round Robin real.
8. O chat depende de participantes para boa parte da autorização, enquanto a autoridade comercial deveria ser o Lead e seu responsável atual.
9. A transferência de Lead já tenta sincronizar o participante do chat, mas isso ainda precisa virar uma regra de domínio central e transacional.
10. Chat, Booking e Offer criam/descobrem Leads em pontos diferentes, o que permite inconsistência e duplicação.
11. O endpoint de Booking verifica apenas `category === "aluguel"`, portanto aluguel mensal pode cair em um fluxo de reserva diária.
12. A API de anúncio público pode devolver informações pessoais do anunciante que não deveriam ser públicas.
13. A página pública contém textos/estatísticas fixos que podem aparentar ser fatos reais do anúncio sem terem vindo do banco.
14. O formulário de edição não representa todos os campos necessários para venda, mensal e diária.
15. A regra de rascunho e publicação está inconsistente porque o frontend permite a ideia de rascunho incompleto, mas o backend ainda exige imagem na criação.

A solução recomendada é organizar tudo em quatro camadas:

```text
1. LISTING
   Dados do imóvel

2. MODALIDADE
   SALE
   MONTHLY_RENT
   DAILY_RENT

3. CRM
   LEAD
   ASSIGNMENT
   INTERACTIONS
   VISITS

4. NEGÓCIO
   OFFER      → venda
   BOOKING    → diária

CHAT
   → acompanha o LEAD e o responsável atual
```

---

# 2. Regra central do produto

O Zhivago deve entender um anúncio assim:

```text
LISTING
├── dados do imóvel
├── localização
├── empreendimento
├── proprietário/organização
├── responsável comercial
├── modalidade
└── conteúdo público
```

A modalidade determina o fluxo comercial:

```text
SALE
    ↓
LEAD
    ↓
VISITA
    ↓
PROPOSTA
    ↓
NEGOCIAÇÃO
    ↓
WON / LOST
```

```text
MONTHLY_RENT
    ↓
LEAD
    ↓
VISITA
    ↓
INTERESSE / PROPOSTA
    ↓
NEGOCIAÇÃO / CONTRATO
    ↓
WON / LOST
```

```text
DAILY_RENT
    ↓
LEAD
    ↓
BOOKING
    ↓
CONFIRMED / REJECTED / CANCELLED / COMPLETED
```

O **Lead continua existindo nos três cenários**, mas a transação específica é diferente.

---

# 3. Estados da modalidade do anúncio

Recomendação:

```ts
type ListingOperation =
  | "SALE"
  | "MONTHLY_RENT"
  | "DAILY_RENT";
```

Não depender apenas da combinação atual:

```text
category
+
billingCycle
```

A combinação atual pode continuar temporariamente para compatibilidade, mas o código novo deve trabalhar com um conceito único e explícito de operação.

Mapeamento:

| Nova operação | category atual | billingCycle atual |
|---|---|---|
| SALE | venda | nulo |
| MONTHLY_RENT | aluguel | mês |
| DAILY_RENT | aluguel | noite |

---

# 4. Dados universais do imóvel

Esses dados existem independentemente da modalidade:

```text
name
description
propertyType
bedrooms
suites
bathrooms
parking
privateArea
totalArea
amenities
location
photos
```

## Tipos de imóvel

Começar com:

```text
HOUSE
APARTMENT
```

Preparar enum para:

```text
HOUSE
APARTMENT
CONDO
STUDIO
PENTHOUSE
COMMERCIAL_ROOM
STORE
WAREHOUSE
LAND
FARM
OTHER
```

Não é necessário disponibilizar todos na UI agora.

---

# 5. Melhorias urgentes no schema de Listing

O modelo atual possui:

```text
price
type
category
billingCycle
location
bedrooms
bathrooms
parking
amenities
checkInTime
checkOutTime
customMaxGuests
houseRules
safetyItems
cancellationPolicy
```

A direção futura recomendada é adicionar campos estruturados.

## Dados gerais

```text
operationType
propertyType
privateArea
totalArea
suites
createdById
buildingId
```

## Venda

```text
salePrice
condoFee
iptuAnnual
acceptsFinancing
acceptsExchange
```

## Aluguel mensal

```text
monthlyRent
condoFee
iptuMonthly
availableFrom
minimumLeaseMonths
guaranteeTypes
isFurnished
allowPets
```

## Diária

```text
dailyRate
maxGuests
checkInTime
checkOutTime
minimumNights
cleaningFee
cancellationPolicy
houseRules
safetyItems
```

### Estratégia de migração

Não é necessário reescrever tudo de uma vez.

Pode-se manter:

```text
price
category
billingCycle
```

como compatibilidade durante a migração, enquanto o domínio passa a interpretar:

```text
operationType
```

como fonte principal.

Depois, quando todo WEB e Backend estiverem migrados, os campos antigos podem ser removidos ou mantidos somente quando fizerem sentido para compatibilidade histórica.

---

# 6. Criador do anúncio

Adicionar/usar:

```text
Listing.createdById
```

Sem isso o sistema não consegue distinguir:

```text
quem cadastrou
```

de:

```text
quem responde comercialmente.
```

Exemplo:

```text
createdBy = João
agent = Mariana
```

Isto deve ser permitido.

---

# 7. Responsável comercial do imóvel

Manter:

```text
Listing.agentId
```

mas alterar o significado explícito:

> `agentId` = responsável comercial pelo imóvel.

Não usar:

> `agentId` = criador do imóvel.

Para pessoa física:

```text
ownerId = usuário
organizationId = null
agentId = null
```

Para organização:

```text
ownerId = null
organizationId = organização
agentId = responsável comercial
createdById = quem cadastrou
```

---

# 8. Empreendimento

Adicionar:

```text
OrganizationBuilding
```

Relacionamento:

```text
Organization
    |
    └── OrganizationBuilding
              |
              └── Listings
```

Campos:

```text
id
organizationId
name
address
leadOwnerMemberId
backupMemberId
createdAt
updatedAt
```

Um empreendimento deve pertencer a uma organização.

Um imóvel de organização pode:

```text
organizationId = X
buildingId = Y
```

---

# 9. Responsável por Leads do empreendimento

O empreendimento pode ter:

```text
leadOwnerMemberId
```

Regra:

```text
0 ou 1 responsável principal
```

Não permitir dois simultaneamente.

Exemplo:

```text
Unique Tower

Lead Owner:
Mariana

Backup:
Carlos
```

---

# 10. Regra de exclusividade do empreendimento

Não fazer:

```text
corretor cadastrou imóvel
↓
automaticamente ganhou todo o edifício
```

Isso é perigoso.

O corretor deve marcar explicitamente:

```text
[ ] Assumir todos os Leads deste empreendimento
```

Ao ativar:

```text
OrganizationBuilding.leadOwnerMemberId = membro
```

A partir daí, novos Leads de imóveis daquele empreendimento podem ser destinados ao Lead Owner antes das demais regras.

---

# 11. Se o corretor NÃO quiser receber Leads

Na configuração da pessoa:

```text
Receber novos Leads
[ ON/OFF ]
```

Isso é uma preferência global de distribuição.

Se estiver:

```text
OFF
```

o membro não pode receber novos Leads automaticamente.

---

# 12. OWNER também pode receber Leads

Regra recomendada:

| Papel | Elegível para receber |
|---|---:|
| OWNER | Sim, se ativar |
| MANAGER | Sim, se ativar |
| BROKER | Sim, se ativar |
| ADMIN | Não por padrão |
| ASSISTANT | Não |

O fato de alguém ser OWNER não significa que ele não possa vender.

A role administrativa e a participação comercial são conceitos diferentes.

---

# 13. Problema atual de `ELIGIBLE_LEAD_ROLES`

Hoje a lógica usa:

```ts
["BROKER", "MANAGER"]
```

Isso exclui OWNER.

Deve ser revisado para refletir a regra final.

Sugestão:

```ts
const LEAD_DISTRIBUTION_ROLES = [
  "OWNER",
  "MANAGER",
  "BROKER",
] as const;
```

`ADMIN` só entra se a organização explicitamente permitir.

---

# 14. Configuração do anúncio

A tela do imóvel deve ter:

```text
ATENDIMENTO DE LEADS

Quem recebe os Leads deste imóvel?

( ) Distribuição da imobiliária
( ) Responsável por este imóvel

Empreendimento:
[ Unique Tower ]

[ ] Assumir todos os Leads deste empreendimento
```

Para pessoa física:

```text
Você será o responsável pelo atendimento.
```

Para organização:

```text
A distribuição seguirá as regras da imobiliária.
```

---

# 15. Hierarquia final de distribuição

Quando um Lead nasce:

```text
1. Lead Owner do empreendimento
2. Agent do imóvel
3. Distribuição da organização
4. Atribuição manual
5. Unassigned
```

Mas sempre respeitando:

```text
status = ACTIVE
role elegível
receiveLeads = true
```

---

# 16. Fallback

Exemplo:

```text
Empreendimento:
Mariana

Mariana:
receiveLeads = false
```

Não mandar para Mariana.

Fallback:

```text
Backup
↓
Agent do imóvel
↓
Round Robin
↓
Manual
↓
Unassigned
```

---

# 17. Backup de empreendimento

Criar:

```text
backupMemberId
```

para permitir cobertura.

Exemplo:

```text
Unique Tower
Primário: Mariana
Backup: Carlos
```

Se Mariana estiver indisponível:

```text
Lead → Carlos
```

---

# 18. Contradição entre `receiveLeads` e Lead Owner

Não permitir estado inconsistente sem tratamento.

Se:

```text
Mariana.receiveLeads = false
```

e:

```text
Unique Tower.leadOwner = Mariana
```

ao desativar deve existir uma validação.

Mensagem:

```text
Você é responsável pelos Leads deste empreendimento.

Para deixar de receber novos Leads, transfira essa responsabilidade
para outra pessoa ou reative o recebimento.
```

---

# 19. Round Robin real

O código atual usa:

```ts
Math.random()
```

Isto não é Round Robin.

Implementar sequência real:

```text
Carlos
Mariana
João
```

Distribuição:

```text
1 → Carlos
2 → Mariana
3 → João
4 → Carlos
5 → Mariana
```

Usar:

```text
Organization.leadRoundRobinCursor
```

ou estrutura equivalente.

A alteração do cursor precisa ser segura contra concorrência.

---

# 20. Concorrência do Round Robin

Dois Leads podem chegar simultaneamente.

Não fazer simplesmente:

```text
ler cursor
selecionar
salvar cursor
```

sem proteção.

Duas requests podem ler o mesmo cursor.

Usar transação com estratégia que garanta que somente uma delas avance o cursor por vez.

Em PostgreSQL, considerar lock/transação adequada para a operação.

---

# 21. Lead único

Na V1:

```text
1 cliente
+
1 imóvel
=
1 Lead
```

Adicionar proteção:

```prisma
@@unique([userId, listingId])
```

Se o mesmo cliente demonstrar interesse novamente, recuperar o Lead existente.

---

# 22. `ensureLead()`

Criar função única:

```ts
ensureLead({
  userId,
  listingId,
  organizationId,
  source
})
```

Todos os fluxos devem usar essa função:

```text
Chat
Booking
Offer
Form
WhatsApp rastreado
CTA
integração futura
```

Não criar Lead diretamente em vários controllers.

---

# 23. Problema atual de criação de Lead pelo Chat

Hoje o chat:

```text
1. cria Conversation
2. tenta criar Lead
3. tenta distribuir
```

e o Lead está tratado como "aditivo".

Isso pode produzir:

```text
Conversation existe
Lead não existe
```

quando houver falha na criação do Lead.

Para CRM, isso é ruim.

---

# 24. Regra correta do Chat + Lead

Para imóvel de organização:

```text
criar/obter Lead
↓
resolver responsável
↓
criar/obter Conversation
↓
sincronizar participante
```

Preferencialmente com consistência transacional onde possível.

Se a operação realmente não puder ser 100% transacional devido a socket/notificação, a persistência deve ser atômica e os efeitos externos podem ser executados depois.

---

# 25. Conversation deve ter `leadId`

Adicionar:

```text
Conversation.leadId
```

Regra preferida:

```text
1 Lead
=
1 Conversation principal
```

Isso remove a necessidade de encontrar a conversa por:

```text
propertyId
+
cliente
+
participante
```

---

# 26. Chat deve ser pessoal

Para CRM:

```text
CLIENTE
   ↕
RESPONSÁVEL ATUAL
```

Não adicionar automaticamente:

```text
OWNER
MANAGER
ADMIN
ASSISTANT
outros BROKERS
```

O gerente acompanha o Lead no CRM.

O chat continua pessoal.

---

# 27. Fonte de verdade do responsável

A autoridade deve ser:

```text
LeadAssignment aberto
```

e não:

```text
Conversation.participants
```

Participantes podem ser sincronizados a partir da atribuição atual.

---

# 28. Transferência de Lead

Criar serviço central:

```ts
transferLead({
  leadId,
  toMemberId,
  changedByMemberId,
  reason
})
```

Validar:

```text
Lead existe
novo membro pertence à organização
membro está ACTIVE
papel é elegível
novo membro pode receber Lead
```

---

# 29. O que acontece na transferência

Exemplo:

```text
Antes

Lead #100
Responsável: Carlos

Chat:
João ↔ Carlos
```

Transferência:

```text
Carlos → Mariana
```

Depois:

```text
Lead #100
Responsável: Mariana

Chat:
João ↔ Mariana
```

O histórico permanece.

---

# 30. Assignment histórico

Não sobrescrever o assignment anterior.

Antes:

```text
LeadAssignment
Carlos
assignedAt = 09:00
unassignedAt = null
```

Depois:

```text
Carlos
09:00 → 11:00

Mariana
11:00 → null
```

---

# 31. Garantir apenas um assignment atual

Como PostgreSQL suporta índice parcial, criar migration manual semelhante a:

```sql
CREATE UNIQUE INDEX "LeadAssignment_one_current_per_lead"
ON "LeadAssignment" ("leadId")
WHERE "unassignedAt" IS NULL;
```

Isso garante no banco:

```text
1 Lead
=
no máximo 1 assignment aberto
```

Isso deve complementar a regra de aplicação.

---

# 32. Source da atribuição

Adicionar:

```text
LeadAssignment.source
```

Valores sugeridos:

```text
BUILDING_OWNER
LISTING_AGENT
ROUND_ROBIN
MANUAL
SELF_ASSIGNED
TRANSFER
BACKUP
```

Isso é importante para métricas e auditoria.

---

# 33. Transferência com motivo

Motivos:

```text
CLIENT_REQUEST
ABSENCE
VACATION
SPECIALIZATION
WRONG_ASSIGNMENT
WORKLOAD
OTHER
```

Guardar comentário opcional.

---

# 34. Bloqueio do corretor anterior

Depois da transferência, o corretor anterior perde:

```text
enviar mensagem
aprovar
recusar
alterar ações exclusivas
```

Isso deve ser aplicado no:

```text
WEB
REST
WebSocket
```

---

# 35. REST deve validar responsável atual

Se Carlos foi transferido e tentar:

```http
POST /conversations/:id/messages
```

responder:

```http
403 Forbidden
```

Não confiar no fato de que ele estava autorizado quando abriu a página.

---

# 36. WebSocket deve revalidar autorização

Cenário:

```text
Carlos abre o chat
Gerente transfere para Mariana
Carlos continua conectado
Carlos envia mensagem
```

Resposta:

```text
DENIED
```

Além disso:

```text
Carlos → removido da room
Mariana → adicionada à room
```

---

# 37. Histórico do Chat

Nunca criar segunda conversa por transferência.

Manter:

```text
João:
Ainda está disponível?

Carlos:
Sim.

João:
Aceita financiamento?

--- Transferência ---

Mariana:
Olá João, vou continuar seu atendimento.
```

---

# 38. Permissões de CRM

## OWNER

Pode:

```text
ver todos
distribuir
transferir
gerenciar equipe
gerenciar empreendimento
alterar regras
```

## MANAGER

Pode:

```text
ver CRM
distribuir
transferir
acompanhar equipe
```

## BROKER

Pode:

```text
ver próprios Leads
atuar nos próprios Leads
registrar interações
agendar visitas
negociar
```

## ADMIN

Administrativo, sem participar da distribuição por padrão.

## ASSISTANT

Somente leitura do CRM, conforme regra atual.

---

# 39. Aprovação de Lead

Não criar:

```text
Aprovar Lead
```

Lead nasce:

```text
NEW
```

O que pode ser aprovado:

```text
Offer
Booking
```

---

# 40. Aprovação deve seguir responsável atual

Para organização:

```text
responsável atual
```

ou usuário administrativo com permissão explícita.

Exemplo:

```text
Carlos → transferido para Mariana
```

Carlos:

```text
❌ Aprovar proposta
❌ Recusar proposta
```

Mariana:

```text
✅ Aprovar
✅ Recusar
```

---

# 41. VENDA

## Cadastro

Mostrar:

```text
Preço de venda
Condomínio
IPTU
Área privativa
Área total
Quartos
Suítes
Banheiros
Vagas
Mobiliado
Aceita financiamento
Aceita permuta
```

## Página pública

Mostrar:

```text
R$ 320.000

68 m²
2 quartos
1 suíte
2 banheiros
1 vaga

Condomínio: R$ 420/mês
IPTU: R$ 1.200/ano

[ Tenho interesse ]
```

Não mostrar:

```text
hóspedes
check-in
checkout
calendário
reserva diária
política de cancelamento de hospedagem
```

---

# 42. Venda — fluxo

```text
Tenho interesse
      ↓
ensureLead()
      ↓
distribuição
      ↓
chat
      ↓
qualificação
      ↓
visita
      ↓
proposta
      ↓
negociação
      ↓
WON / LOST
```

---

# 43. Oferta de venda

`Offer` continua sendo a entidade da proposta.

Campos atuais:

```text
value
paymentMethod
status
listingId
buyerId
```

Adicionar futuramente:

```text
leadId
```

Assim não é preciso descobrir o Lead depois.

---

# 44. Oferta aprovada

Ao aceitar:

```text
Offer = ACCEPTED
```

depois validar:

```text
transação de venda
```

e somente então:

```text
Listing = SOLD
Lead = WON
```

---

# 45. Aprovar uma proposta deve cuidar de outras propostas pendentes

Se existem:

```text
Oferta A = PENDING
Oferta B = PENDING
```

e A for aceita, B não pode continuar sendo uma proposta ativa válida.

Decisão recomendada:

```text
A = ACCEPTED
B = CANCELLED ou REJECTED
```

em transação.

---

# 46. ALUGUEL MENSAL

## Cadastro

Mostrar:

```text
Aluguel mensal
Condomínio
IPTU
Disponibilidade
Prazo mínimo
Garantias
Mobiliado
Pets
Área
Quartos
Suítes
Banheiros
Vagas
```

Exemplo:

```text
R$ 1.400 / mês

Condomínio: R$ 350/mês
IPTU: R$ 80/mês

Disponível a partir de 01/10/2026

Prazo mínimo:
12 meses

Garantias:
Caução
Seguro-fiança
```

---

# 47. Mensal — página pública

Não usar calendário de hospedagem.

Não usar:

```text
Check-in
Checkout
Hóspedes
Noites
Reserva diária
```

CTA:

```text
[ Tenho interesse ]
```

Opcional:

```text
[ Agendar visita ]
```

---

# 48. Mensal — fluxo

```text
Tenho interesse
      ↓
Lead
      ↓
distribuição
      ↓
chat
      ↓
qualificação
      ↓
visita
      ↓
negociação
      ↓
contrato
      ↓
WON / LOST
```

---

# 49. ALUGUEL POR DIÁRIA

Somente aqui aparecem:

```text
preço por noite
calendário
check-in
checkout
hóspedes
estadia mínima
taxa de limpeza
cancelamento
disponibilidade
```

Exemplo:

```text
R$ 250 / noite

Check-in: 10/10
Checkout: 14/10
2 hóspedes

4 noites
R$ 1.000

Taxa de limpeza
R$ 80

Total
R$ 1.080

[ Solicitar reserva ]
```

---

# 50. Booking só pode existir para DAILY_RENT

O endpoint atual usa:

```ts
listing.category === "aluguel"
```

Isso é insuficiente.

Trocar por:

```ts
listing.operationType === "DAILY_RENT"
```

Ou compatibilidade:

```text
category = aluguel
AND billingCycle = noite
```

durante a migração.

Um MONTHLY_RENT deve retornar erro ao tentar criar Booking.

---

# 51. Booking deve ter Lead

Adicionar:

```text
Booking.leadId
```

Fluxo:

```text
usuário escolhe período
        ↓
ensureLead()
        ↓
cria Booking
        ↓
Booking.leadId = Lead
```

---

# 52. Preço da diária

Hoje o booking usa:

```ts
price: listing.price
```

Isso não é suficiente.

Para diária:

```text
dailyRate × número de noites
+
cleaningFee
+
outros custos
```

O Booking precisa armazenar o total travado.

Sugestão:

```text
nightlyRateSnapshot
nights
cleaningFeeSnapshot
subtotal
total
```

Assim alterações futuras no anúncio não alteram uma reserva já criada.

---

# 53. Regra de intervalo

Definir claramente:

```text
check-in 10/10
checkout 14/10
```

significa:

```text
4 noites
```

Não:

```text
5 dias
```

A disponibilidade deve tratar o intervalo como:

```text
[startDate, endDate)
```

ou seja:

```text
10, 11, 12, 13
```

A entrada do dia 14 é o checkout.

Isso evita erro de double-booking.

---

# 54. Calendário

O calendário deve considerar:

```text
reservas confirmadas
bloqueios manuais
manutenção
datas indisponíveis
```

No futuro, todos podem entrar em uma estrutura de disponibilidade.

Na V1, pelo menos:

```text
CONFIRMED bookings
```

mais bloqueio manual, caso implementado.

---

# 55. Cadastro de imóveis — nova estrutura

A tela `/anuncios/novo` deve ser remodelada para:

```text
1. Tipo do anúncio
2. Sobre o imóvel
3. Localização
4. Condições
5. Atendimento/CRM
6. Fotos + revisão + publicação
```

---

# 56. ETAPA 1 — Tipo do anúncio

Primeiro:

```text
O que você quer fazer?

[ Vender ]
[ Alugar mensalmente ]
[ Alugar por diária ]
```

Depois:

```text
Tipo do imóvel

[ Casa ]
[ Apartamento ]
```

A modalidade deve ser a primeira decisão porque muda o resto do formulário.

---

# 57. ETAPA 2 — Sobre o imóvel

Campos:

```text
Área privativa
Área total

Quartos
Suítes
Banheiros
Vagas

Mobiliado

Comodidades
```

Não usar texto orientado a hóspedes.

---

# 58. Quartos, suítes, banheiros e vagas

O componente atual com steppers pode ser mantido.

Porém os textos devem ser imobiliários:

```text
Quartos
Quantos quartos possui o imóvel?

Suítes
Quantas suítes possui o imóvel?

Banheiros
Quantidade de banheiros

Vagas
Quantidade de vagas de garagem
```

---

# 59. Suítes

Adicionar:

```text
suites
```

O campo atual de `bathrooms` não deve ser usado para inferir suíte.

---

# 60. Área

Adicionar:

```text
privateArea
totalArea
```

Obrigatório para:

```text
SALE
MONTHLY_RENT
```

Recomendado para:

```text
DAILY_RENT
```

---

# 61. Comodidades

Não iniciar o formulário com uma lista gigante já selecionada.

Hoje existem vários valores pré-selecionados:

```text
cozinha
wifi
workspace
estacionamento
piscina
tv
ar_condicionado
cameras
```

Isso significa que o anúncio pode nascer dizendo que possui coisas que o anunciante nunca marcou.

Começar com:

```text
[]
```

e deixar o anunciante escolher.

Se houver bons defaults, eles devem ser apenas sugestões, nunca dados salvos automaticamente.

---

# 62. ETAPA 3 — Localização

Manter ViaCEP, mas armazenar:

```text
cep
logradouro
numero
complemento
bairro
cidade
uf
latitude
longitude
```

Em vez de depender apenas de:

```text
location: string
```

O `location` pode continuar como campo derivado para compatibilidade.

---

# 63. Empreendimento no cadastro

Para organização:

```text
Empreendimento
[ Buscar ]

[ + Novo empreendimento ]
```

Exemplo:

```text
Unique Tower
```

Depois:

```text
Unidade/apartamento
[ 1204 ]
```

A unidade pode ser opcional dependendo do tipo de imóvel.

---

# 64. Bairro e cidade

Esses campos estruturados são necessários para:

```text
busca
filtros
SEO
imóveis semelhantes
analytics
CRM
```

Não depender de parsing de uma string de endereço.

---

# 65. Localização pública

O cadastro deve permitir:

```text
Mostrar endereço exato
```

ou política definida por modalidade.

Para algumas modalidades, pode ser melhor publicar:

```text
bairro + cidade
```

e localização aproximada.

Se o mapa exato for mostrado, o texto não pode dizer:

```text
"localização aproximada"
```

ao mesmo tempo.

---

# 66. ETAPA 4 — Condições de VENDA

Mostrar somente:

```text
Preço de venda
Condomínio
IPTU
Área
Financiamento
Permuta
Mobiliado
```

Não mostrar:

```text
hóspedes
check-in
checkout
cancelamento
```

---

# 67. ETAPA 4 — Condições de MENSAL

Mostrar:

```text
Preço mensal
Condomínio
IPTU
Disponibilidade
Prazo mínimo
Garantias
Pets
Mobiliado
```

Não mostrar:

```text
check-in
checkout
noites
hóspedes
cancelamento de hospedagem
```

---

# 68. ETAPA 4 — Condições de DIÁRIA

Mostrar:

```text
Preço por noite
Hóspedes
Estadia mínima
Check-in
Checkout
Taxa de limpeza
Cancelamento
Regras
Segurança
Calendário/disponibilidade
```

---

# 69. Regras da casa

A estrutura atual:

```text
allowPets
allowSmoking
allowParties
quietHours
customNotes
```

é adequada para diária.

Não deve ser colocada automaticamente na experiência de venda.

Para mensal:

```text
allowPets
mobiliado
observações
```

podem existir em uma seção específica de locação.

---

# 70. Segurança

Campos:

```text
externalCameras
smokeAlarm
fireExtinguisher
doorman24h
firstAidKit
```

deixar como propriedades da hospedagem quando o modelo de produto exigir.

Não usar esses campos como preenchimento automático universal de qualquer imóvel.

---

# 71. Política de cancelamento

Somente:

```text
DAILY_RENT
```

deve ter:

```text
FLEXIBLE
MODERATE
STRICT
```

Aluguel mensal segue condições contratuais.

Venda não possui política de cancelamento de hospedagem.

---

# 72. ETAPA 5 — Atendimento/CRM

Essa etapa deve existir somente quando:

```text
organizationId != null
```

Para organização:

```text
ATENDIMENTO DE LEADS

(•) Distribuição da imobiliária
( ) Responsável por este imóvel

Empreendimento:
Unique Tower

[ ] Assumir todos os Leads deste empreendimento
```

---

# 73. Regra de preenchimento do responsável

Se:

```text
"Responsável por este imóvel"
```

estiver selecionado:

```text
Listing.agentId = usuário escolhido
```

e não necessariamente o criador.

---

# 74. Se "Assumir empreendimento" for marcado

Executar:

```text
OrganizationBuilding.leadOwnerMemberId = currentMember
```

com validação:

```text
currentMember.status = ACTIVE
role elegível
receiveLeads = true
```

---

# 75. Conflito de empreendimento

Se já houver dono:

```text
Unique Tower
Lead Owner = Mariana
```

Carlos não deve simplesmente sobrescrever.

Mensagem:

```text
Este empreendimento já possui Mariana como responsável pelos Leads.
```

Apenas OWNER/MANAGER com permissão pode transferir.

---

# 76. ETAPA 6 — Fotos

Permitir:

```text
upload
ordenar
definir capa
remover
```

Adicionar:

```text
Foto de capa
```

A primeira imagem pública deve ser definida pelo campo `order` ou flag específica.

---

# 77. Rascunho

A regra de rascunho deve ser verdadeira.

## Salvar rascunho

Pode estar incompleto:

```text
sem foto
sem preço
sem localização completa
sem descrição
```

## Publicar

Precisa cumprir validação completa.

O backend não deve exigir foto para simplesmente salvar um rascunho.

---

# 78. Validação por modalidade

## SALE

Obrigatório:

```text
tipo
título
preço
cidade
UF
área
fotos
```

## MONTHLY_RENT

Obrigatório:

```text
tipo
título
preço mensal
cidade
UF
área
fotos
```

## DAILY_RENT

Obrigatório:

```text
tipo
título
preço por noite
cidade
UF
maxGuests
checkInTime
checkOutTime
fotos
```

Outros campos podem ser configurados como opcionais.

---

# 79. Validação no backend

Nunca confiar somente no frontend.

Se o formulário manda:

```text
operationType = SALE
checkInTime = 15:00
maxGuests = 2
```

o backend deve:

```text
ignorar
normalizar
ou rejeitar
```

mas não transformar esses dados em propriedade oficial da venda.

---

# 80. Editar anúncio

A tela atual `EditListingForm` é muito mais simples que a tela de criação.

Isso gera risco de:

```text
campo existente no banco
↓
editar anúncio
↓
campo não aparece
↓
campo não pode ser corrigido
```

A edição deve compartilhar os mesmos blocos conceituais da criação:

```text
dados gerais
localização
modalidade
condições específicas
CRM
fotos
```

---

# 81. Mudança de modalidade

Tratar com cuidado.

Exemplo:

```text
DAILY_RENT
↓
SALE
```

Não deve simplesmente manter:

```text
cancellationPolicy
checkInTime
maxGuests
```

como dados ativos.

Na mudança de modalidade:

```text
manter histórico se necessário
mas limpar/desativar campos incompatíveis
```

Antes de salvar, mostrar:

```text
A mudança de modalidade removerá configurações exclusivas da hospedagem.
Continuar?
```

---

# 82. Página pública do imóvel

Criar estrutura comum:

```text
ListingDetailPage
```

Componentes compartilhados:

```text
Gallery
Header
PropertySummary
Description
Amenities
Location
Advertiser
SimilarListings
```

Componentes comerciais:

```text
SaleCommercialPanel
MonthlyRentCommercialPanel
DailyRentCommercialPanel
```

---

# 83. VENDA — página pública

Estrutura:

```text
Galeria

Apartamento 2 quartos
Centro · Coronel Fabriciano

2 quartos · 1 suíte · 2 banheiros · 1 vaga · 68 m²

R$ 320.000

Condomínio:
R$ 420/mês

IPTU:
R$ 1.200/ano

[ Tenho interesse ]
```

---

# 84. MENSAL — página pública

```text
Galeria

Apartamento 2 quartos
Centro · Coronel Fabriciano

2 quartos · 1 suíte · 2 banheiros · 1 vaga · 68 m²

R$ 1.400 / mês

Condomínio:
R$ 350/mês

IPTU:
R$ 80/mês

Disponibilidade:
01/10/2026

[ Tenho interesse ]
```

---

# 85. DIÁRIA — página pública

```text
Galeria

Loft
Centro · Coronel Fabriciano

1 quarto · 1 banheiro · 2 hóspedes

R$ 250 / noite

Check-in
[ 10/10 ]

Checkout
[ 14/10 ]

Hóspedes
[ 2 ]

4 noites
R$ 1.000

Taxa de limpeza
R$ 80

Total
R$ 1.080

[ Solicitar reserva ]
```

---

# 86. Problema atual da página pública: hóspedes

O código atual calcula:

```ts
listing.bedrooms * 2 || 4
```

Isso é incorreto.

Deve usar:

```text
customMaxGuests/maxGuests
```

e somente na modalidade:

```text
DAILY_RENT
```

---

# 87. Problema atual da página pública: camas

O código atual calcula:

```ts
listing.bedrooms + 1
```

como número de camas.

Isso é um dado inventado.

Se não existir:

```text
bedCount
```

não mostrar camas.

---

# 88. Problema atual: textos hardcoded

A página pública atual mostra afirmações que não são necessariamente vindas do anúncio, como:

```text
95% dos hóspedes recentes deram 5 estrelas
100% taxa de resposta
Responde em até 1 hora
Hospeda há 2 meses
piscina privativa
varanda panorâmica
fechadura inteligente
fibra ótica
```

Não manter isso como texto fixo.

Tudo deve vir de dados reais.

Se o dado não existir:

```text
não mostrar
```

---

# 89. Problema atual: "Anfitrião"

Para venda/mensal em imobiliária, trocar:

```text
Anfitrião
```

por:

```text
Anunciado por
```

ou:

```text
Imobiliária
```

e:

```text
Corretor responsável
```

Para diária de pessoa física:

```text
Anfitrião
```

pode continuar.

---

# 90. Problema atual: WhatsApp

A página atual possui caminho direto:

```text
wa.me
```

Isso contorna o CRM.

Fluxo desejado:

```text
Tenho interesse
   ↓
ensureLead()
   ↓
distribuição
   ↓
Chat Zhivago
```

WhatsApp pode existir como canal secundário.

Se continuar:

```text
registrar source = WHATSAPP
```

e idealmente criar Lead antes do redirecionamento.

---

# 91. Regra para WhatsApp

Não usar diretamente:

```text
listing.owner.phone
```

como única lógica.

Para organização:

```text
LeadAssignment atual
```

deve determinar o responsável.

Se o Lead ainda não existir:

```text
ensureLead()
resolveLeadAssignee()
```

Depois gerar o contato correto.

---

# 92. API pública de anunciante

Não devolver:

```text
email
phone
```

como parte de payload público do imóvel sem necessidade.

Criar uma projeção pública:

```text
PublicAdvertiser
```

com:

```text
id
name
avatar
organizationName
logo
verified
creci
```

Dados privados devem permanecer privados.

---

# 93. Acesso do OWNER/MANAGER ao imóvel

A página atual possui lógica que pode redirecionar uma conta AGENCY se ela não for `agentId`.

A regra de organização deve ser:

```text
OWNER/ADMIN
→ pode visualizar o inventário da organização

MANAGER
→ conforme permissão

BROKER
→ conforme responsabilidade do imóvel

cliente público
→ vê anúncio aprovado
```

Não basear isso somente em:

```text
user.id === listing.agentId
```

---

# 94. Imóveis semelhantes

A página atual busca praticamente todos os Listings e calcula similaridade usando:

```text
category
type
bedrooms
price
```

Isso é insuficiente.

Prioridade:

```text
mesmo empreendimento
↓
mesmo bairro
↓
mesma cidade
↓
mesma operação
↓
faixa de preço
↓
quartos
↓
tipo
```

Nunca sugerir como "semelhante" algo de modalidade comercial incompatível.

Exemplo:

```text
Apartamento mensal
```

não deve sugerir:

```text
Casa diária
```

só porque ambos estão em `category = aluguel`.

---

# 95. Buscar semelhantes no backend

Evitar:

```text
getListings()
↓
trazer tudo
↓
filtrar no navegador
```

Criar API específica:

```http
GET /listings/:id/similar
```

O backend pode limitar e ordenar.

---

# 96. Localização pública

Na página de venda/mensal:

```text
Bairro
Cidade/UF
```

pode aparecer de forma pública.

O endereço completo pode depender da política.

Para diária, especialmente quando o imóvel é residencial, considerar localização aproximada no público e liberar informações completas quando houver reserva confirmada, se esse for o produto adotado.

---

# 97. Status do anúncio

O modelo atual mistura moderação e disponibilidade.

Hoje existe:

```text
DRAFT
PENDING
APPROVED
REJECTED
REMOVED
SOLD
```

Isso funciona até certo ponto, mas cria ambiguidade.

Exemplo:

```text
APPROVED
```

significa publicado.

```text
SOLD
```

significa vendido.

Mas aluguel mensal e diária possuem outros estados.

Sugestão futura:

```text
publicationStatus
DRAFT
PENDING
PUBLISHED
REJECTED
REMOVED
```

e separado:

```text
availabilityStatus
AVAILABLE
RESERVED
RENTED
SOLD
UNAVAILABLE
```

Isso evita colocar:

```text
SOLD
```

dentro de uma máquina que também representa publicação.

---

# 98. Moderação

Para organização:

```text
criou anúncio
↓
PENDING
↓
OWNER/ADMIN aprova
↓
PUBLISHED
```

A moderação do anúncio é diferente do CRM.

Não misturar:

```text
Listing approval
```

com:

```text
Lead approval
```

---

# 99. Offer

Oferta:

```text
apenas SALE
```

Backend deve validar:

```text
operationType === SALE
```

ou compatibilidade temporária.

---

# 100. Booking

Reserva:

```text
apenas DAILY_RENT
```

Backend deve validar:

```text
operationType === DAILY_RENT
```

---

# 101. Monthly rental

Não criar Booking para aluguel mensal.

Usar:

```text
Lead
+
Visit
+
Offer/negociação
+
contrato futuramente
```

Se futuramente houver contrato estruturado:

```text
RentalContract
```

será entidade separada.

---

# 102. Chat para venda

```text
Lead
↓
Conversation
↓
cliente ↔ responsável
```

Proposta pode gerar:

```text
Message.type = OFFER_REQUEST
metadata.offerId
```

mas a autoridade continua sendo o Lead atual.

---

# 103. Chat para mensal

Mesma estrutura:

```text
Lead
↓
Conversation
↓
cliente ↔ responsável
```

Não precisa de um novo tipo de chat.

---

# 104. Chat para diária

Mesma estrutura:

```text
Lead
↓
Conversation
↓
cliente ↔ responsável
```

Booking entra como objeto comercial relacionado.

---

# 105. Relações finais recomendadas

```text
Organization
│
├── Members
│
├── Buildings
│      └── Listings
│
└── Leads
```

```text
Listing
│
├── createdBy
├── agent
├── building
├── images
├── leads
├── conversations
├── offers
└── bookings
```

```text
Lead
│
├── User
├── Listing
├── Organization
├── Assignments
├── Interactions
├── Visits
├── Conversation
├── Offers
└── Bookings
```

---

# 106. Offer e Booking devem apontar para Lead

Recomendação:

```text
Offer.leadId
Booking.leadId
```

Assim:

```text
Lead
├── Offer
└── Booking
```

A relação deixa de ser inferida.

---

# 107. Conversation deve apontar para Lead

```text
Conversation.leadId
```

E manter:

```text
propertyId
```

se necessário por compatibilidade.

No futuro:

```text
lead.listingId
```

é a relação principal.

---

# 108. Remove dependência de "contactId = ownerId ?? agentId"

Hoje vários controllers fazem algo conceitualmente parecido:

```ts
const contactId = listing.ownerId ?? listing.agentId;
```

Isso é frágil para organização.

Para organização, usar:

```text
LeadAssignment atual
```

e resolver:

```text
currentAssignment.broker.userId
```

Pessoa física:

```text
ownerId
```

---

# 109. Booking atual — problema crítico

O fluxo atual pode fazer:

```text
Booking criado
↓
depois tenta criar Lead
```

e o Lead é "best effort".

Isso pode deixar:

```text
Booking existe
Lead não existe
```

A operação deve ser reorganizada.

Para organização:

```text
ensureLead
+
createBooking
```

com persistência consistente.

---

# 110. Offer atual — problema similar

A proposta atualmente é criada antes de a ligação com Lead ser resolvida.

Reestruturar:

```text
ensureLead
↓
createOffer
↓
Conversation
↓
message
```

---

# 111. Notificação

Após atribuição:

```text
Novo Lead atribuído a você

Cliente: João
Imóvel: Apartamento 505
Empreendimento: Unique Tower

Motivo:
Responsável pelo empreendimento
```

Após transferência:

```text
Lead transferido para você

Cliente: João
Imóvel: Apartamento 505
```

---

# 112. Próxima ação

Adicionar futuramente:

```text
LeadTask
```

Campos:

```text
id
leadId
memberId
title
dueAt
completedAt
createdAt
```

Exemplo:

```text
Ligar para confirmar visita
22/09 às 14:00
```

---

# 113. SLA

Manter:

```text
assignedAt
firstContactAt
lastInteractionAt
```

Calcular:

```text
responseTime
```

Status:

```text
OK
AT_RISK
OVERDUE
```

---

# 114. SLA e transferência

Ao transferir:

```text
LeadAssignment antigo
fecha

novo Assignment
começa
```

O SLA de primeira resposta pode seguir uma política definida:

### Opção A
Medir o Lead desde sua criação.

### Opção B
Medir cada Assignment separadamente.

Recomendação:

```text
Lead.createdAt → primeiro contato do cliente
```

para SLA global.

E adicionalmente:

```text
Assignment.assignedAt → primeira ação do corretor
```

para performance operacional.

---

# 115. Histórico

Eventos:

```text
STATUS_CHANGE
ASSIGNMENT_CHANGED
INTERACTION
VISIT
OFFER_CREATED
OFFER_ACCEPTED
OFFER_REJECTED
BOOKING_CREATED
BOOKING_CONFIRMED
BOOKING_REJECTED
BOOKING_CANCELLED
```

Não depender apenas de texto.

---

# 116. Interface do detalhe do Lead

Cabeçalho:

```text
João Silva
Apartamento 505

Status: Negociação
Responsável: Mariana

SLA: OK
```

Ações:

```text
[ Conversar ]
[ Registrar contato ]
[ Agendar visita ]
[ Transferir ]
```

Linha do tempo:

```text
09:10
Lead criado

09:15
Atribuído a Carlos

09:30
Carlos enviou mensagem

10:45
Lead transferido para Mariana

10:46
Mariana assumiu
```

---

# 117. Card do Kanban

Mostrar:

```text
Cliente
Imóvel
Empreendimento
Responsável
Última interação
Próxima ação
SLA
```

Não colocar informação irrelevante.

---

# 118. Filtros do CRM

Adicionar:

```text
Todos
Meus Leads
Não atribuídos
```

Filtros:

```text
status
corretor
empreendimento
imóvel
origem
SLA
período
busca
```

---

# 119. Server-side pagination

Não fazer:

```text
GET todos os Leads
↓
filter no browser
```

Preferir:

```http
GET /leads?page=1&limit=30
GET /leads?status=QUALIFIED
GET /leads?brokerId=...
GET /leads?buildingId=...
GET /leads?search=joao
```

---

# 120. Tela de equipe

A configuração deve deixar clara a diferença:

```text
Recebe novos Leads
[ ON ]

Responsabilidades de empreendimento:
Unique Tower
Residencial Central
```

Se desligar recebimento e possuir responsabilidades:

```text
Transferir responsabilidades
```

---

# 121. "Participar do rodízio" — opção futura

Pode ser interessante separar:

```text
Receber novos Leads
```

de:

```text
Participar do rodízio
```

Mas isso não precisa existir na primeira implementação.

Na V1:

```text
receiveLeads = true
```

é suficiente para entrar no Round Robin.

---

# 122. Assumir Lead

Para Lead sem responsável:

```text
[ Assumir atendimento ]
```

Ao clicar:

```text
LeadAssignment.source = SELF_ASSIGNED
```

Depois:

```text
um responsável atual
```

---

# 123. Evitar dois corretores falando ao mesmo tempo

Regra:

```text
1 Lead
=
1 responsável operacional atual
```

Se outro corretor quiser ajudar:

```text
transferência
```

não participação paralela.

---

# 124. Acesso de OWNER/MANAGER ao chat

O fato de poder ver o Lead não significa automaticamente poder escrever no chat.

Separar:

```text
CRM access
```

de:

```text
chat write access
```

Por padrão:

```text
responsável atual → escrever
cliente → escrever
OWNER/MANAGER → visualizar/controlar conforme permissão
```

Se for necessário suporte interno no chat futuramente, implementar explicitamente como recurso adicional.

---

# 125. Auditoria

Registrar:

```text
quem alterou
quando
qual entidade
qual alteração
motivo
```

Para:

```text
transferências
atribuições
responsabilidade do empreendimento
mudança de status
aprovação/rejeição
alteração de anúncio
```

---

# 126. API pública do imóvel

Recomendar projeção sanitizada:

```text
GET /listings/:id
```

Retornar somente o necessário para visitante.

Não devolver:

```text
phone privado
email privado
campos internos de CRM
assignment
receiveLeads
```

---

# 127. API privada de detalhe do imóvel

Para dono/organização:

```text
GET /me/listings/:id
```

ou equivalente.

Pode incluir:

```text
agent
organization
CRM settings
```

conforme permissão.

---

# 128. API de empreendimentos

Criar futuramente:

```http
GET /organizations/buildings
POST /organizations/buildings
PATCH /organizations/buildings/:id
PATCH /organizations/buildings/:id/lead-owner
```

---

# 129. API de Lead

Recomendada:

```http
POST /leads/ensure
GET /leads
GET /leads/mine
GET /leads/:id
PATCH /leads/:id/status
PATCH /leads/:id/assign
POST /leads/:id/transfer
POST /leads/:id/interactions
POST /leads/:id/visits
```

---

# 130. API de Conversation

```http
POST /conversations
GET /conversations
GET /conversations/:id
GET /conversations/:id/messages
POST /conversations/:id/messages
PATCH /conversations/:id/read
```

A criação deve retornar algo como:

```json
{
  "conversationId": "...",
  "leadId": "...",
  "currentResponsible": {
    "memberId": "...",
    "userId": "..."
  }
}
```

---

# 131. API de Booking

Validar:

```text
DAILY_RENT
```

Fluxo:

```text
POST /listings/:id/bookings
```

Backend:

```text
validar listing
validar modalidade
validar período
validar disponibilidade
ensureLead
calcular total
criar Booking
criar/usar Conversation
notificar responsável
```

---

# 132. API de Offer

Validar:

```text
SALE
```

Backend:

```text
validar listing
validar disponibilidade
ensureLead
criar Offer
criar/usar Conversation
notificar responsável
```

---

# 133. Regra de página para ações

## SALE

```text
Tenho interesse
Conversar
Visitar
Propor
```

## MONTHLY_RENT

```text
Tenho interesse
Conversar
Agendar visita
```

## DAILY_RENT

```text
Selecionar datas
Solicitar reserva
Conversar
```

---

# 134. Não usar um CTA universal

Evitar:

```text
Alugar
```

para tudo.

Usar:

```text
Tenho interesse
```

para venda/mensal.

E:

```text
Solicitar reserva
```

para diária.

Isso reduz ambiguidade.

---

# 135. Galeria

Melhorar a visualização para desktop:

```text
foto principal
+
fotos secundárias
```

E:

```text
Ver todas as fotos
```

Manter fullscreen/lightbox.

No cadastro:

```text
definir capa
ordenar
```

---

# 136. Preview do cadastro

O preview deve respeitar modalidade.

### Venda

```text
R$ 320.000
```

### Mensal

```text
R$ 1.400/mês
```

### Diária

```text
R$ 250/noite
```

Não usar o mesmo preview para os três.

---

# 137. Arquivos do projeto que precisam de atenção

Principais pontos do ZIP revisado:

```text
apps/web/src/components/listings/NewListingForm.tsx
apps/web/src/components/listings/EditListingForm.tsx
apps/web/src/app/imovel/[id]/page.tsx
apps/web/src/components/listing/ListingHighlights.tsx
apps/web/src/components/listing/HostCard.tsx
apps/web/src/components/listing/BookingRequestForm.tsx
apps/web/src/components/listing/RentalBookingCalendar.tsx

apps/server/prisma/schema.prisma

apps/server/src/lib/leads.ts
apps/server/src/controllers/leads.controller.ts
apps/server/src/controllers/chat.controller.ts
apps/server/src/controllers/listings.controller.ts
apps/server/src/controllers/bookings.controller.ts
apps/server/src/controllers/offers.controller.ts

apps/server/src/routes/leads.routes.ts
apps/server/src/routes/chat.routes.ts
apps/server/src/routes/listings.routes.ts
apps/server/src/routes/bookings.routes.ts
apps/server/src/routes/offers.routes.ts

apps/web/src/components/dashboard/ReceiveLeadsToggle.tsx
apps/web/src/components/dashboard/AssignLeadSelect.tsx

docs/crm-b2b-organizacoes-leads.md
```

---

# 138. Pontos específicos encontrados no código atual

## `NewListingForm.tsx`

A estrutura atual mantém estados de:

```text
checkInTime
checkOutTime
customMaxGuests
houseRules
safetyItems
cancellationPolicy
```

e envia esses valores para qualquer modalidade.

Isso deve ser corrigido.

---

## `NewListingForm.tsx`

`billingCycle` atualmente assume:

```text
DAILY → noite
MONTHLY → mês
SALE → noite
```

Venda não deveria receber:

```text
billingCycle = noite
```

---

## `NewListingForm.tsx`

A etapa "Regras & Segurança" está quase correta ao esconder venda, mas mensal e diária ainda compartilham vários conceitos que precisam ser separados.

---

## `NewListingForm.tsx`

`amenities` começa com vários itens pré-selecionados.

Isso pode criar informações falsas no anúncio.

---

## `NewListingForm.tsx`

A validação de submit atual exige imagem até para rascunho.

Corrigir.

---

# 139. `EditListingForm.tsx`

Hoje a edição trabalha muito mais com:

```text
tipo
modalidade
preço
localização
quartos
banheiros
vagas
amenities
```

e não reproduz todas as informações específicas das novas modalidades.

A criação e edição devem compartilhar schema e componentes.

---

# 140. `listings.controller.ts`

Hoje o backend aceita vários campos de hospedagem para qualquer anúncio.

É necessário aplicar schema condicional.

Exemplo conceitual:

```ts
if (operationType === "SALE") {
  // validar dados de venda
}

if (operationType === "MONTHLY_RENT") {
  // validar mensal
}

if (operationType === "DAILY_RENT") {
  // validar diária
}
```

---

# 141. `listings.controller.ts` — rascunho

Atualmente a criação pode exigir imagem mesmo quando `status = DRAFT`.

Corrigir para:

```text
DRAFT:
mínimo de dados para salvar estado

PENDING:
anúncio completo
```

---

# 142. `leads.ts`

Pontos críticos:

```text
ELIGIBLE_LEAD_ROLES
distributeLead()
assignLead()
syncConversationParticipant()
resolveLeadAccess()
canManageListingConversation()
```

Todos precisam seguir a nova fonte de verdade:

```text
LeadAssignment atual
```

---

# 143. `leads.ts` — distribuição atual

Hoje:

```ts
Math.random()
```

deve ser substituído por Round Robin real.

E a regra atual:

```text
Listing.agentId = BROKER
→ lead é dele
```

deve evoluir para:

```text
building owner
↓
listing agent
↓
organization distribution
```

---

# 144. `leads.ts` — `syncConversationParticipant()`

A função atual já possui uma boa intenção:

```text
novo responsável entra
responsável antigo sai
cliente permanece
```

Isso deve ser mantido, mas movido para uma operação de transferência/distribuição central.

Além disso, não deixar a autorização depender apenas do sucesso dessa sincronização.

---

# 145. `chat.controller.ts`

Hoje a Conversation é localizada por:

```text
propertyId
+
cliente como participante
```

Esse mecanismo pode continuar temporariamente, mas o novo padrão deve ser:

```text
Conversation.leadId
```

---

# 146. `chat.controller.ts`

A criação atual escolhe:

```ts
listing.ownerId ?? listing.agentId
```

para determinar o contato.

Em organização isso não deve ser a autoridade principal.

Usar:

```text
LeadAssignment atual
```

---

# 147. `chat.controller.ts`

O Lead é criado depois da Conversation.

Reestruturar para:

```text
ensureLead
↓
atribuição
↓
Conversation
```

para CRM B2B.

---

# 148. `bookings.controller.ts`

Problema crítico atual:

```ts
listing.category === "aluguel"
```

permite mensal entrar no fluxo de Booking.

Corrigir.

---

# 149. `bookings.controller.ts`

O preço atual:

```ts
price: listing.price
```

não representa:

```text
número de noites
taxa de limpeza
total
```

Criar snapshot comercial.

---

# 150. `bookings.controller.ts`

A reserva deve estar diretamente vinculada ao Lead:

```text
Booking.leadId
```

---

# 151. `offers.controller.ts`

Proposta deve validar:

```text
SALE
```

e estar ligada ao Lead:

```text
Offer.leadId
```

---

# 152. Página pública — problemas críticos atuais

Na implementação revisada, os pontos de maior prioridade são:

```text
1. Mensal tratado como diária
2. Hóspedes calculados artificialmente
3. Camas calculadas artificialmente
4. Conteúdo hardcoded
5. CTA WhatsApp contornando CRM
6. Endereço completo público
7. Informações de anfitrião inadequadas para imobiliária
8. Semelhantes geograficamente ruins
9. Acesso de organização baseado em agentId de forma incompleta
```

---

# 153. Estado final esperado — venda

```text
Imóvel
↓
Página pública
↓
Tenho interesse
↓
Lead
↓
Distribuição
↓
Corretor
↓
Chat
↓
Visita
↓
Offer
↓
Negociação
↓
WON
↓
SOLD
```

---

# 154. Estado final esperado — mensal

```text
Imóvel
↓
Página pública
↓
Tenho interesse
↓
Lead
↓
Distribuição
↓
Corretor
↓
Chat
↓
Visita
↓
Negociação
↓
Contrato futuro
↓
WON
```

---

# 155. Estado final esperado — diária

```text
Imóvel
↓
Página pública
↓
Datas
↓
ensureLead
↓
Booking
↓
Conversation
↓
Responsável
↓
PENDING
↓
CONFIRMED
↓
COMPLETED
```

---

# 156. Transferência final

```text
Lead #100
Responsável = Carlos

Conversation:
João ↔ Carlos
```

Transferência:

```text
Carlos → Mariana
```

Resultado:

```text
Lead:
Mariana

Conversation:
João ↔ Mariana
```

Histórico:

```text
Carlos
↓
mensagens antigas preservadas

Mariana
↓
assume dali em diante
```

Carlos:

```text
❌ escrever
❌ aprovar
❌ agir como responsável
```

---

# 157. Checklist P0

## Cadastro

- [ ] Separar SALE/MONTHLY_RENT/DAILY_RENT.
- [ ] Não enviar campos incompatíveis.
- [ ] Adicionar área.
- [ ] Adicionar suítes.
- [ ] Adicionar empreendimento.
- [ ] Adicionar `createdById`.
- [ ] Corrigir rascunho.
- [ ] Validação condicional.
- [ ] Não pré-selecionar comodidades falsamente.

## Página pública

- [ ] Remover hardcoded.
- [ ] Remover hóspedes artificiais.
- [ ] Remover camas artificiais.
- [ ] Separar os três layouts comerciais.
- [ ] Remover calendário de mensal.
- [ ] Remover hospedagem de venda.
- [ ] Corrigir anunciante.
- [ ] Rever localização pública.
- [ ] Reduzir exposição de telefone/e-mail.
- [ ] Integrar CTA ao CRM.
- [ ] Corrigir semelhantes.

## CRM

- [ ] OWNER pode receber.
- [ ] `receiveLeads` separado de exclusividade.
- [ ] Lead Owner por empreendimento.
- [ ] Backup.
- [ ] Round Robin real.
- [ ] `ensureLead()`.
- [ ] Lead único.
- [ ] Source do assignment.
- [ ] Transferência centralizada.
- [ ] Um assignment aberto por Lead.

## Chat

- [ ] `Conversation.leadId`.
- [ ] Chat pessoal.
- [ ] Responsável atual como autoridade.
- [ ] Transferência.
- [ ] Remoção do responsável anterior.
- [ ] Bloqueio REST.
- [ ] Bloqueio WebSocket.
- [ ] Histórico preservado.

## Negócio

- [ ] Offer somente SALE.
- [ ] Booking somente DAILY_RENT.
- [ ] Booking ligado ao Lead.
- [ ] Offer ligado ao Lead.
- [ ] Snapshot de preço.
- [ ] Fechamento coerente.
- [ ] Propostas concorrentes tratadas.

---

# 158. Checklist P1

- [ ] Filtros server-side.
- [ ] Paginação.
- [ ] Próxima ação.
- [ ] Tarefas.
- [ ] SLA.
- [ ] Backup de empreendimento.
- [ ] Auditoria.
- [ ] Notificação.
- [ ] Preview por modalidade.
- [ ] Galeria premium.
- [ ] Edição completa.
- [ ] API pública sanitizada.

---

# 159. Checklist P2

- [ ] Ausência/férias.
- [ ] Regras automáticas de cobertura.
- [ ] Analytics avançado.
- [ ] Vários canais.
- [ ] Integrações WhatsApp/Instagram/e-mail.
- [ ] Automação.
- [ ] Scoring.
- [ ] IA.
- [ ] Workflows customizáveis.

---

# 160. Testes obrigatórios — distribuição

### Caso 1

```text
OWNER
receiveLeads = false
```

Resultado:

```text
não recebe Round Robin
```

### Caso 2

```text
OWNER
receiveLeads = true
```

Resultado:

```text
pode receber
```

### Caso 3

```text
empreendimento
Lead Owner = Mariana
```

Resultado:

```text
novo Lead → Mariana
```

### Caso 4

```text
Mariana receiveLeads = false
```

Resultado:

```text
fallback
```

### Caso 5

```text
imóvel agent = Carlos
sem Lead Owner
```

Resultado:

```text
Lead → Carlos
```

### Caso 6

```text
nenhum responsável
ROUND_ROBIN
```

Resultado:

```text
sequência determinística
```

---

# 161. Testes obrigatórios — chat

### Antes

```text
João ↔ Carlos
```

### Transferência

```text
Carlos → Mariana
```

### Depois

```text
João ↔ Mariana
```

Verificar:

```text
Carlos não consegue enviar
Mariana consegue enviar
histórico continua
```

---

# 162. Testes obrigatórios — modalidade

## SALE

```text
Booking → 400
check-in → não deve existir
hóspedes → não deve existir
Offer → permitido
```

## MONTHLY_RENT

```text
Booking → 400
Offer → conforme regra de produto
Lead → permitido
Visit → permitido
```

## DAILY_RENT

```text
Booking → permitido
Offer → 400
calendário → permitido
hóspedes → permitido
```

---

# 163. Testes obrigatórios — duplicidade

Disparar simultaneamente:

```text
Chat
Booking
```

para o mesmo:

```text
User + Listing
```

Resultado esperado:

```text
1 Lead
```

e não:

```text
2 Leads
```

---

# 164. Testes obrigatórios — mudança de modalidade

```text
DAILY_RENT
↓
SALE
```

Garantir:

```text
check-in não é exibido
hóspedes não é exibido
cancelamento não é exibido
Offer funciona
```

---

# 165. Testes de concorrência

Executar:

```text
2 Leads simultâneos
```

e validar:

```text
Round Robin não duplica cursor
1 Lead não ganha 2 assignments abertos
```

Executar:

```text
2 transferências simultâneas
```

e validar:

```text
apenas 1 assignment atual
```

---

# 166. Ordem recomendada de implementação

## Sprint 1 — Modelo e contratos

1. Definir `operationType`.
2. Criar `OrganizationBuilding`.
3. Criar `createdById`.
4. Adicionar áreas/suítes.
5. Adicionar `Conversation.leadId`.
6. Adicionar `Offer.leadId`.
7. Adicionar `Booking.leadId`.
8. Criar constraint de Lead.
9. Criar constraint de Assignment atual.

---

## Sprint 2 — Lead e distribuição

10. Implementar `ensureLead()`.
11. Refatorar `assignLead()`.
12. Implementar `resolveLeadAssignee()`.
13. Incluir OWNER elegível.
14. Implementar Lead Owner.
15. Implementar backup.
16. Corrigir Round Robin.
17. Adicionar source.
18. Criar transferência.

---

## Sprint 3 — Chat

19. Migrar Conversation para Lead.
20. Corrigir criação da conversa.
21. Atualizar participantes.
22. Bloquear antigo responsável.
23. Revalidar REST.
24. Revalidar WebSocket.
25. Preservar histórico.

---

## Sprint 4 — Cadastro

26. Refazer wizard.
27. Condições SALE.
28. Condições MONTHLY_RENT.
29. Condições DAILY_RENT.
30. Localização estruturada.
31. Empreendimento.
32. CRM.
33. Draft/Publish.
34. Preview.
35. Edição.

---

## Sprint 5 — Página pública

36. Componentes por modalidade.
37. Venda.
38. Mensal.
39. Diária.
40. Remover hardcoded.
41. Corrigir anunciante.
42. Corrigir localização.
43. Corrigir semelhantes.
44. Integrar CTA com CRM.

---

## Sprint 6 — Operações comerciais

45. Offer.
46. Booking.
47. Snapshot de preço.
48. Lead linkage.
49. Aprovação.
50. Encerramento.
51. Notificação.

---

# 167. Regra final de arquitetura

O Zhivago deve funcionar desta forma:

```text
                     LISTING
                        |
             +----------+----------+
             |          |          |
           VENDA      MENSAL     DIÁRIA
             |          |          |
           Offer      CRM        Booking
             |          |          |
             +----------+----------+
                        |
                       LEAD
                        |
                 RESPONSÁVEL ATUAL
                        |
                   CONVERSATION
                        |
             CLIENTE ↔ CORRETOR
```

Distribuição:

```text
EMPREENDIMENTO
      ↓
IMÓVEL
      ↓
ORGANIZAÇÃO
      ↓
FALLBACK
```

Chat:

```text
LEAD
 ↓
Conversation
 ↓
Cliente + responsável atual
```

Transferência:

```text
responsável antigo
       ↓
    encerra
       ↓
novo responsável
       ↓
mesma conversa
       ↓
histórico preservado
       ↓
antigo responsável bloqueado
```

---

# 168. Decisão de produto consolidada

### Venda

```text
Tenho interesse
→ Lead
→ Chat
→ Visita
→ Offer
→ Negociação
→ WON
→ SOLD
```

### Aluguel mensal

```text
Tenho interesse
→ Lead
→ Chat
→ Visita
→ Negociação
→ contrato futuro
→ WON
```

### Aluguel por diária

```text
Escolher datas
→ Lead
→ Booking
→ Chat
→ PENDING
→ CONFIRMED
→ COMPLETED
```

---

# 169. Resultado esperado

Depois dessa refatoração:

- um OWNER pode escolher receber Leads;
- um corretor pode optar por não receber;
- um corretor pode assumir todos os Leads de um empreendimento de forma explícita;
- o criador do imóvel não ganha exclusividade silenciosamente;
- o responsável do imóvel e o responsável pelo empreendimento são conceitos independentes;
- a distribuição é previsível;
- Round Robin é realmente Round Robin;
- um Lead possui um único responsável atual;
- o chat acompanha automaticamente esse responsável;
- transferência não cria uma nova conversa;
- o histórico não desaparece;
- o corretor anterior perde autorização imediatamente;
- venda não possui elementos de hospedagem;
- aluguel mensal não possui calendário diário;
- diária possui Booking de verdade;
- Booking não é confundido com Lead;
- Offer não é confundida com Lead;
- o cadastro alimenta corretamente a página pública;
- a página pública não inventa informações;
- o backend é a autoridade das regras;
- WEB e Backend passam a ter um modelo de negócio coerente.

---

# 170. Regra que deve ser considerada "fonte de verdade"

```text
Listing
→ dados do imóvel

Listing.operationType
→ define o produto comercial

OrganizationBuilding
→ define o responsável exclusivo pelo empreendimento

Listing.agent
→ responsável comercial do imóvel

Lead
→ oportunidade do cliente naquele imóvel

LeadAssignment aberto
→ responsável atual

Conversation.leadId
→ conversa principal daquele Lead

Offer.leadId
→ proposta daquele Lead

Booking.leadId
→ reserva daquele Lead
```

Esta estrutura deve ser considerada a base para qualquer futura funcionalidade de CRM do Zhivago.

