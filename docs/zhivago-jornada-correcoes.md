# Jornada pública, autenticação e novo anúncio

Implementação e verificação local em 7/11/2026. Não houve migração de banco, alteração de registros ou publicação em produção.

## Componentes e causas encontradas

| Área | Código e constatação |
| --- | --- |
| Landing e catálogo | `app/page.tsx`, `landing/home-data.ts`, `LocationsSection`, `FeaturedListingsSection`; dados vêm de `GET /listings`. O filtro anterior considerava o status, sem distinguir demonstrações. |
| Autenticação | `LoginForm`, `RegisterForm`, `GoogleSignInButton`, `actions/auth.ts`, `session.ts`, `/boas-vindas`. `next` já era propagado no login/cadastro/Google; a validação aceitava barras invertidas e a conclusão do onboarding podia perder o destino. |
| Apple | A única entrada encontrada era um botão que executava `alert("Login via Apple em breve!")`. Removido. Nenhum provedor, vínculo, usuário ou implementação de backend foi removido. O login Firebase existente foi preservado; possíveis vínculos externos antigos não foram auditados no provedor. |
| Perfis e carregamento | O layout `(workspace)` consulta sessão e vínculo, e só cria `WorkspaceShell` quando há ambos. Pessoa Física já tinha o comportamento correto; isso foi mantido. O texto empresarial vinha do `loading.tsx` compartilhado. |
| Wizard | `NewListingForm`; título está na etapa 1, mas a validação anterior estava na 2. As abas marcavam etapas anteriores como concluídas pela posição. Fotos eram desmontadas ao trocar de etapa. |
| Servidor | `listings.controller.ts`; criação aceitava strings vazias e preço zero. A publicação de rascunho por `PUT` não validava o registro completo. Isso foi comprovado por leitura, sem publicar registros inválidos. |
| Aprovação | Pessoa Física é aprovada automaticamente pelo backend. Imobiliárias enviam para aprovação da própria equipe OWNER/ADMIN. O selo é administrado separadamente pelo Zhivago. Os textos foram corrigidos; a política de publicação não foi substituída. |
| Fotos | API: até 10 imagens, 20 MB por arquivo, decodificação com Sharp e conversão para WebP. O Next não tinha limite de Server Action configurado para esse volume. |

## Alterações

- `Listing.isDemo`, com migração aditiva e valor inicial `false`. Exclui demonstrações da lista pública, recomendações, portfólio público, sugestões de cidade e contagens. O detalhe por URL fica restrito ao dono/responsável/admin. Duplicar um exemplo preserva sua marca. Não há classificação por título ou preço.
- Imóveis em destaque precedem as cidades. Cidades viraram links compactos, sem preenchimento fictício. Cidades homônimas em UFs distintas não são somadas.
- Login contextual, e-mail/senha e Google mantidos. Destino validado por função comum, inclusive no onboarding. A seleção de Pessoa Física continua criando `INDIVIDUAL`; anunciar não cria uma imobiliária.
- Numeração visual derivada da lista filtrada: 1–5 para Pessoa Física; 1–6 para imobiliária, que possui a etapa adicional de CRM. IDs internos estáveis não são usados como números visuais.
- Etapa atual, visita e validade separados. Navegação livre continua permitida, com estados incompletos e pendências na revisão. Continuar valida a etapa e foca o primeiro problema; voltar permanece livre.
- Quantidades começam em zero e precisam ser confirmadas. Equipamentos de segurança começam como “Não informado”, com escolha explícita entre possuir e não possuir. Pets e negociação não vêm autorizados. Nenhum valor de imóvel existente foi migrado ou sobrescrito.
- Comodidades com checkboxes e rótulos associados, opções genéricas e equipamentos condicionados a temporada ou imóvel mobiliado. Pets, vagas e câmeras do novo anúncio têm uma única origem nas regras/características, evitando duplicação nas comodidades.
- Troca de modalidade mantém o preenchimento em memória/rascunho; somente dados aplicáveis são enviados. A revisão apresenta os campos efetivamente aplicáveis. O servidor também remove campos incompatíveis recebidos.
- Revisão com apresentação, modalidade, localização, características, valores, encargos, regras, segurança e fotos, atalhos de edição e pendências. Preço ausente não é exibido como R$ 0.
- Fotos persistem entre etapas, podem ser removidas, movidas para a esquerda e usadas como capa. Instruções mostram regras reais. Há seleção local, validação de quantidade/tamanho, estado de envio e erro retornado pelo servidor. O envio é indeterminado; não se inventa percentual de bytes enviados.
- Rascunho parcial disponível durante todo o preenchimento, com confirmação/erro e recuperação explícita na mesma página, inclusive arquivos e sua ordem. **O rascunho deste wizard é local, em IndexedDB, separado por conta: não sincroniza entre navegadores/dispositivos e depende do armazenamento do navegador.** Isso está informado na interface. Não substitui nem altera rascunhos já existentes no servidor. A API também aceita criação de DRAFT parcial; as exigências completas se aplicam à publicação.
- Mensagens integrado à barra de ações do novo anúncio; o botão flutuante é ocultado apenas nessa rota. A barra quebra em linhas e sua altura real reserva espaço no conteúdo. Foco, erros e estados de salvamento/envio têm comunicação acessível.
- Validação de publicação reutilizada na criação, atualização de registro público/publicação de rascunho e aprovações de organização/admin. Considera o registro resultante, incluindo fotos já salvas.

## Aplicação e marcação dos exemplos existentes

Antes de implantar a API atualizada, aplicar a migração conforme o processo de implantação existente e gerar o cliente Prisma:

```powershell
npx prisma migrate deploy --schema apps/server/prisma/schema.prisma
npx prisma generate --schema apps/server/prisma/schema.prisma
```

Os registros atuais só deixam o catálogo quando seus IDs forem marcados explicitamente. A migração não infere quais são fictícios. Um operador deve conferir no painel/banco quais registros correspondem aos exemplos Simpsons, Flintstones, Tony Stark e demais demonstrações e anotar os UUIDs corretos. O preço de R$ 1 bilhão, sozinho, não determina essa marcação.

O script abaixo consulta e mostra os registros informados; só grava com `--apply`:

```powershell
npx tsx apps/server/src/scripts/mark-demo-listings.ts UUID_REVISADO_1 UUID_REVISADO_2
npx tsx apps/server/src/scripts/mark-demo-listings.ts UUID_REVISADO_1 UUID_REVISADO_2 --apply
```

O script modifica exclusivamente `isDemo`, preservando os anúncios, status, proprietários, preços, fotos e demais informações. Não foi executado contra nenhum banco nesta revisão. Para reverter uma marcação incorreta, um operador autorizado pode ajustar exclusivamente `isDemo` para `false` pelo Prisma Studio/banco após conferir o ID.

## Testes reproduzíveis

Na raiz do repositório:

```powershell
node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p apps/server/tsconfig.json
node --import tsx --test apps/server/src/lib/listing-publication.test.ts apps/server/src/controllers/listings.journey.test.ts apps/web/src/lib/safe-redirect.test.ts apps/web/src/components/landing/home-data.test.ts
```

O teste de controladores usa um cliente de banco inteiramente simulado, instalado antes de carregar os controladores; não abre conexão com Postgres. Cobre filtros de demonstração, bloqueio do link público, rascunho parcial e rejeição da publicação de rascunho incompleto antes de qualquer escrita. Testes de funções cobrem preços, fotos, capacidade, segurança explícita, números negativos, campos por modalidade, cidades/UFs e redirecionamentos seguros.

Para repetir o navegador no Windows com Edge instalado, em terminais separados, sempre a partir da raiz:

```powershell
node apps/web/tests/journey/mock-api.cjs
```

```powershell
$env:API_URL = 'http://127.0.0.1:4333'
$env:NEXT_PUBLIC_API_URL = 'http://127.0.0.1:4333'
npm run dev:web -- --port 3100
```

```powershell
node apps/web/tests/journey/run.cjs
```

A API simulada rejeita qualquer publicação, mantém uma conta fictícia apenas em memória e não tem acesso a um banco. O navegador utiliza perfil isolado dentro de `.tmp`, sem extensões. Capturas ficam em `.tmp/journey-mobile.png`.

## Evidências e limites

- Verificados no Edge local: LP → Anunciar → Login → Cadastro Pessoa Física → retorno ao anúncio; login e senha com retorno; ausência de Apple; ausência de sidebar empresarial; erros e foco de título/preço; etapas 1–5; checkboxes; revisão e falta de foto; fotos e capa ao voltar; salvamento/recuperação parcial e com arquivos; comunicação de falha de envio; seções de venda, mensal e temporada e segurança inicialmente desconhecida.
- Geometria da barra e mensagens verificada em 1440×900, 390×844, 320×650 e 720×450, sem interseção entre Mensagens e Publicar e sem rolagem horizontal. 720×450 testa reflow com área reduzida; **zoom nativo do navegador não foi testado**.
- TypeScript web/servidor e ESLint dos arquivos web alterados verificados. Cliente Prisma gerado localmente. A migração não foi aplicada a Postgres.
- Não testados: OAuth real do Google, credenciais reais, vínculo externo Apple/Firebase, aprovação com banco real, publicação real bem-sucedida, upload de arquivos no limite de 20 MB, limites do proxy de produção, leitura com leitor de tela ou sincronização entre dispositivos. Não houve publicação de anúncio fictício em produção.
- A recuperação de rascunho local depende de IndexedDB e do navegador usado; limpeza de dados do site remove esse rascunho. Falhas de quota/permissão são comunicadas na interface.
