# Onde subir cada modificação

Desde 9/11/2026 o Zhivago tem **um repositório para cada parte**. Não existe mais cópia de um para o outro:
cada mudança é feita e enviada direto no repositório da parte que foi mexida.

| Mexeu em... | Pasta no PC | Repositório no GitHub | Como vai para produção |
|---|---|---|---|
| **Site** (zhivago.com.br) | `C:\Users\Fábio de Melo\zhivago-web` | `Zhivago-labs/zhivago-web` | Push na `main` → a **Netlify publica sozinha** (3 a 8 min) |
| **Servidor / API** (api.zhivago.com.br) | `C:\Users\Fábio de Melo\hotelapp` | `Zhivago-labs/zhivago-hotelapp` | Push na `main` → rodar na VPS: `ssh root@177.7.45.213 /opt/zhivago/deploy/vps/atualizar.sh` |
| **App de celular** | `C:\Users\Fábio de Melo\zhivago-mobile` | `Zhivago-labs/zhivago-mobile` | Ainda não é publicado — só push na `main` |

## Passo a passo

### Site
1. Fazer a mudança em `zhivago-web`.
2. Conferir: `npx tsc --noEmit` dentro de `apps/web`.
3. Commit + push na `main` do `zhivago-web`.
4. Acompanhar em **app.netlify.com** → o site → **Deploys**.

### Servidor
1. Fazer a mudança em `hotelapp` (`apps/server`).
2. Conferir: `npx tsc --noEmit` dentro de `apps/server`.
3. Commit + push na `main` do `hotelapp`.
4. Atualizar a VPS: `ssh root@177.7.45.213 /opt/zhivago/deploy/vps/atualizar.sh`
   (faz backup, aplica migrations do banco e volta sozinho para a versão anterior se der erro).

### App
1. Fazer a mudança em `zhivago-mobile`.
2. Commit + push na `main` do `zhivago-mobile`.

## Atenção

- **Mudança que envolve site e servidor juntos** (ex.: uma rota nova na API que o site usa):
  suba **primeiro o servidor** (push no `hotelapp` + `atualizar.sh`), confira que a API responde,
  e **só depois** o site (push no `zhivago-web`). Assim o site nunca chama uma rota que ainda não existe.
- **`packages/shared`** (tipos compartilhados) existe em cada repositório separadamente. Se mudar um tipo
  usado pelo site e pelo servidor, altere **nos dois** (`hotelapp` e `zhivago-web`) — e no `zhivago-mobile`
  se o app também usar.
- Push no `hotelapp` **não publica o site**, e push no `zhivago-web` **não atualiza o servidor**.

Mais detalhes (variáveis de ambiente, banco, backup, logs): `docs/runbook-atualizacoes.md` no `hotelapp`.
