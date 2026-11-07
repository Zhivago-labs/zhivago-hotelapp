# Área de trabalho das imobiliárias

## Estrutura e rotas

O grupo de rotas `apps/web/src/app/(workspace)` compartilha o layout corporativo sem mudar os endereços das telas existentes. A vitrine `/imobiliaria/[id]` permanece fora do grupo. O layout consulta a sessão autenticada e o vínculo ativo no servidor; sem vínculo, mantém a navegação pessoal. As páginas `/empresa/*` exigem vínculo ativo e encaminham quem não o possui à tela existente de equipe/ingresso.

- `/empresa`: visão operacional, período de 7/30/90 dias.
- `/empresa/contatos`: clientes agrupados por User.id, com todas as oportunidades autorizadas.
- `/imobiliaria`: Kanban existente, mesmas etapas e transições; filtros e paginação no backend.
- `/empresa/imoveis`: inventário compacto com ações existentes.
- `/empresa/mensagens`: conversas corporativas autorizadas das quais o usuário participa, abertas no chat existente.
- `/empresa/reservas`: reservas DAILY_RENT; o menu aparece quando há operação de temporada na organização.
- `/equipe`: equipe, convites, redistribuição de anúncios, empreendimentos e auditoria existentes.
- `/configuracoes`: conta pessoal; `/configuracoes/imobiliaria`: empresa.

`/dashboard`, `/meus-anuncios`, `/anuncios` e `/inbox` continuam válidos e encaminham membros ao contexto adequado. Usuários comuns mantêm os fluxos pessoais. Voltar ao site público permite explorar imóveis sem sidebar.

## Identidade e migração

Aplicar a migração `20261107000000_workspace_identity` com `npx prisma migrate deploy` em `apps/server`, após revisar as migrações pendentes do ambiente. Não é necessário apagar/recriar dados. A migração adiciona legalName, address, businessHours e whatsapp à Organization, todos opcionais. Não copia foto, nome, telefone ou e-mail pessoal. Logo/capa continuam com o upload existente. O telefone comercial não é convertido automaticamente em WhatsApp.

Públicos, quando cadastrados: nome comercial, logo, capa, descrição, cidade/estado, telefone comercial, WhatsApp comercial, e-mail comercial e horário de atendimento. Razão social e endereço completo ficam internos e só aparecem no contexto autenticado. O endpoint público não devolve telefone pessoal de contas empresariais/membros. A identidade do anunciante usa o logo da empresa; sem logo, iniciais. O responsável continua identificado separadamente.

Ambiguidades legadas: nomes comerciais ausentes recebem um rótulo genérico, não o nome pessoal. Não há inferência de razão social, endereço, horários ou WhatsApp. Canais públicos preenchidos antes desta alteração são preservados; registros legados sem procedência documentada devem ser revisados pelo proprietário. Não é possível distinguir retroativamente, com segurança, um telefone pessoal copiado em migração antiga de um telefone comercial confirmado depois. Não há limpeza em massa desses dados.

## Matriz preservada

| Ação | OWNER / ADMIN | MANAGER | BROKER | ASSISTANT |
|---|---|---|---|---|
| Ler operação | Organização | Organização | Registros atribuídos | Organização |
| Editar anúncio | Todos da organização | Não | Anúncio atribuído | Não |
| Criar anúncio | Sim | Não | Sim | Não |
| Excluir / moderar / redistribuir anúncio | Sim | Não | Não | Não |
| Atualizar oportunidade | Organização | Organização | Oportunidade atribuída | Não |
| Redistribuir oportunidade | Sim | Sim | Não | Não |
| Empresa e equipe | Sim | Não | Não | Não |

As políticas existentes são aplicadas pelo backend. A organização nunca é escolhida por parâmetro do cliente. Vínculo INACTIVE não autoriza acesso. O papel da plataforma ADMIN é distinto do ADMIN de organização. Não foi introduzido suporte a múltiplas organizações: o modelo mantém OrganizationMember.userId único.

OWNER administra a conta empresarial; Listing.agentId administra o anúncio; a atribuição aberta de LeadAssignment conduz a oportunidade. Listing.organizationId, Lead.organizationId e os históricos permanecem corporativos. Listing.createdById preserva autoria. A remoção existente inativa o membro, transfere anúncios e atribuições ao proprietário e conserva o histórico e a conversa. Proprietários não podem ser removidos; não foi criado endpoint de rebaixamento ou transferência de propriedade.

## Contatos, indicadores e limites

Contato é uma projeção do usuário cliente que tem oportunidades visíveis na organização. A identidade é User.id no escopo da imobiliária; não há fusão por nome, telefone ou e-mail aproximado. Uma pessoa com dois interesses tem um contato e duas oportunidades. Não foi criado CRM paralelo nem cadastro manual de pessoas externas: o fluxo existente gera oportunidades a partir de clientes cadastrados.

O Kanban retorna página, total filtrado, total sem filtros e resumo filtrado na mesma transação RepeatableRead. Contagens por etapa, pendências e SLA abrangem todos os resultados filtrados, inclusive para corretores. As colunas mostram os cartões da página e os totais integrais, com paginação explícita. A alteração de etapa continua disponível por select acessível, com as validações existentes.

O início separa novas oportunidades/clientes no período de pendências e imóveis publicados atuais. O percentual de primeiro atendimento usa firstContactAt registrado em qualquer atribuição do período de entrada; não representa conversão de visualização em contato. Visitas e reservas futuras não dependem do período de entrada de leads. Visualizações e contatos por imóvel são acumulados; não existe histórico diário de visualizações, por isso não há gráfico fictício. Não se infere receita da imobiliária a partir do valor de venda ou da reserva.

O modelo atual tem um único status para moderação/disponibilidade de anúncios. A interface usa os significados existentes sem inventar dois campos de status independentes. As mensagens continuam respeitando a participação na conversa, além da autorização sobre a oportunidade; não há abertura automática de acesso a todos os chats da organização.

## Verificação local

- `npm run build --workspace=apps/server`
- `npm run build --workspace=apps/web`
- `npx tsx apps/server/tests/workspace-permissions.ts`
- `node apps/web/tests/workspace-browser.mjs` (Edge instalado no Windows)

Os testes de backend exercitam rotas reais e autenticação com persistência simulada: papéis, escopo, membro inativo, totais além da página, contato com múltiplas oportunidades, proteção de proprietário e preservação de autoria/histórico na remoção. O teste de navegador usa API local isolada e não acessa o banco configurado; gera capturas desktop/celular em `.tmp/workspace-browser`.

A migração não é aplicada automaticamente e não foi feito deploy. Testes contra o banco de destino e dados reais exigem aplicar a migração no ambiente apropriado.

Anúncios antigos com ownerId pessoal e sem organizationId não são atribuídos retroativamente só porque o usuário hoje pertence a uma empresa: isso também poderia mover patrimônio pessoal para a empresa. Esses casos exigem revisão manual de titularidade. Novas importações CSV por membros autorizados já gravam organizationId, createdById e agentId separadamente; novos anúncios não dependem da conta pessoal do proprietário para permanecer na imobiliária.

Na validação final, o build padrão com Turbopack passou em execuções anteriores, mas apresentou falha intermitente na geração das fontes do Google. O build final completo passou com `npm run build --workspace=apps/web -- --webpack`, sem alterar a configuração global ou substituir as fontes do projeto. O lint geral ainda aponta cinco erros preexistentes em HouseRules, PropertyPhotoViewer, MultiImageInput e lib/actions/push.ts; o lint das áreas reformuladas não apresentou erros.
