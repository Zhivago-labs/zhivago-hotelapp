import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { parse as parseCsv } from 'csv-parse/sync';

import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { saveUpload } from '../lib/storage.js';
import { sendNotification } from '../services/notification.service.js';
import sharp from 'sharp';

const MAX_LISTING_IMAGES = 10;
const MAX_IMPORT_ROWS = 500;

// ─── LISTAR IMÓVEIS (público) ─────────────────────────────────────────────────

export async function getListings(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const listings = await prisma.listing.findMany({
      where: {
        status: { in: ['APPROVED', 'SOLD'] }
      },
      orderBy: { createdAt: 'desc' },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            avatar: true,
            accountType: true,
            companyName: true,
            creci: true,
            verified: true,
          },
        },
        // Sem isto, imóveis de organização (owner null) não carregavam o selo de
        // verificação na listagem pública — só na página de detalhe (que já inclui).
        organization: { select: { id: true, name: true, logo: true, verified: true } },
        images: { orderBy: { order: 'asc' } },
      },
    });
    return reply.send(listings);
  } catch {
    return reply.status(500).send({ error: 'Erro ao buscar imóveis.' });
  }
}

// ─── OBTER UM IMÓVEL (público) ────────────────────────────────────────────────

export async function getListingById(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  try {
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            avatar: true,
            email: true,
            phone: true,
            accountType: true,
            companyName: true,
            creci: true,
            verified: true,
          },
        },
        organization: { select: { id: true, name: true, logo: true, verified: true } },
        agent: { select: { id: true, name: true, avatar: true } },
        images: { orderBy: { order: 'asc' } },
      },
    });

    if (!listing) {
      return reply.status(404).send({ error: 'Imóvel não encontrado.' });
    }

    // JWT opcional: tenta identificar o requisitante tanto pra checar acesso a status não-públicos
    // quanto pra não contar a própria visita do dono como "visualização" da métrica.
    let requesterId: string | null = null;
    let requesterRole: string | null = null;
    try {
      await request.jwtVerify();
      const user = request.user as { id: string; role: string };
      requesterId = user.id;
      requesterRole = user.role;
    } catch {
      // sem token válido — segue como visitante anônimo
    }

    const isPublicStatus = ['APPROVED', 'SOLD'].includes(listing.status);
    const isAdmin = requesterRole === 'ADMIN';

    // Anúncio de organização (B2B): "dono" é o corretor responsável ou quem gerencia a
    // organização dona do anúncio (OWNER/ADMIN) — ownerId fica null nesse caso, então a checagem
    // por ownerId sozinha não basta.
    let isOwner = requesterId !== null && listing.ownerId === requesterId;
    if (!isOwner && requesterId !== null && listing.organizationId) {
      if (listing.agentId === requesterId) {
        isOwner = true;
      } else {
        const membership = await prisma.organizationMember.findUnique({ where: { userId: requesterId } });
        isOwner =
          membership?.organizationId === listing.organizationId &&
          (membership.role === 'OWNER' || membership.role === 'ADMIN');
      }
    }

    if (!isPublicStatus) {
      // Rascunhos e imóveis em moderação não devem vazar por link direto — só o
      // dono ou um admin pode visualizá-los fora dos status públicos.
      if (!isOwner && !isAdmin) {
        return reply.status(404).send({ error: 'Imóvel não encontrado.' });
      }
    } else if (!isOwner) {
      // Métrica simples de visualizações — não conta o dono olhando o próprio anúncio.
      // Fire-and-forget: não atrasa a resposta nem falha a request se der erro.
      prisma.listing.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {});
    }

    return reply.send(listing);
  } catch {
    return reply.status(500).send({ error: 'Erro ao buscar imóvel.' });
  }
}

// ─── CRIAR IMÓVEL (requer auth) ───────────────────────────────────────────────

export async function createListing(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId, role } = request.user as { id: string; role: string };
  if (role === 'ADMIN') {
    return reply.status(403).send({ error: 'Administradores não podem criar anúncios.' });
  }
  const parts = request.parts();
  const imageUrls: string[] = [];
  const formData: Record<string, string> = {};

  try {
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'images') {
        // Sempre drena o stream do arquivo, mesmo além do limite, para não travar
        // as próximas parts do multipart (busboy exige que cada file part seja consumida).
        const buffer = await part.toBuffer();
        if (imageUrls.length >= MAX_LISTING_IMAGES) continue;

        const filename = `${Date.now()}-${imageUrls.length}-${path.parse(part.filename).name}.webp`;
        const processed = await sharp(buffer)
          .resize({ width: 1200, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();

        imageUrls.push(await saveUpload(processed, filename, 'image/webp'));
      } else if (part.type === 'field') {
        formData[part.fieldname] = part.value as string;
      }
    }

    if (imageUrls.length === 0) {
      return reply.status(400).send({ error: 'Envie ao menos uma imagem para o anúncio.' });
    }

    const schema = z.object({
      name: z.string(),
      description: z.string().optional(),
      price: z.coerce.number(),
      type: z.string(),
      category: z.string(),
      billingCycle: z.string().optional(),
      location: z.string(),
      bedrooms: z.coerce.number(),
      bathrooms: z.coerce.number(),
      parking: z.coerce.number(),
      amenities: z.string().optional(),
      checkInTime: z.string().optional(),
      checkOutTime: z.string().optional(),
      customMaxGuests: z.coerce.number().optional(),
      houseRules: z.string().optional(),
      safetyItems: z.string().optional(),
      cancellationPolicy: z.string().optional(),
      status: z.enum(['DRAFT', 'PENDING']).default('PENDING'),
    });

    const { status, ...data } = schema.parse(formData);

    // B2B (Organization/OrganizationMember): quem pertence a uma organização cria o anúncio em
    // nome dela — organizationId no lugar de ownerId, agentId é quem criou, nunca os dois campos
    // preenchidos.
    const membership = await prisma.organizationMember.findUnique({ where: { userId } });

    // Conta normal (sem organização): moderação automática — não passa por análise, publica direto.
    // Conta de imobiliária (organização): continua indo pra "PENDING", aprovado depois por
    // OWNER/ADMIN da própria organização (ver approveOrgListing/rejectOrgListing).
    const finalStatus = !membership && status === 'PENDING' ? 'APPROVED' : status;

    const newListing = await prisma.listing.create({
      data: {
        ...data,
        description: data.description ?? null,
        billingCycle: data.billingCycle ?? null,
        amenities: data.amenities ?? null,
        checkInTime: data.checkInTime ?? "15:00",
        checkOutTime: data.checkOutTime ?? "11:00",
        customMaxGuests: data.customMaxGuests ?? null,
        houseRules: data.houseRules ?? null,
        safetyItems: data.safetyItems ?? null,
        cancellationPolicy: data.cancellationPolicy ?? "FLEXIBLE",
        ownerId: membership ? null : userId,
        organizationId: membership ? membership.organizationId : null,
        agentId: membership ? userId : null,
        status: finalStatus,
        images: {
          create: imageUrls.map((url, order) => ({ url, order })),
        },
      },
      include: { images: { orderBy: { order: 'asc' } } },
    });

    return reply.status(201).send(newListing);
  } catch (error) {
    console.error(error);
    return reply.status(400).send({
      error: 'Dados inválidos ou erro no banco.',
      details: error instanceof z.ZodError ? error.errors : String(error),
    });
  }
}

// ─── MEUS IMÓVEIS (requer auth) ───────────────────────────────────────────────

export async function getMyListings(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };

  // Imóvel de organização (B2B) não tem ownerId preenchido (fica null, ver createListing) — quem
  // gerencia a organização (OWNER/ADMIN) precisa ver todo o portfólio dela; MANAGER/BROKER só o
  // que foi atribuído a si (MANAGER não cria/edita imóvel, então essa lista tende a vir vazia
  // pra ele — a visão dele é `getOrganizationListings`, não esta). Pessoa física (sem
  // membership) continua vendo pelo ownerId, como antes.
  const membership = await prisma.organizationMember.findUnique({ where: { userId } });
  const where = membership
    ? membership.role === 'OWNER' || membership.role === 'ADMIN'
      ? { organizationId: membership.organizationId }
      : { agentId: userId }
    : { ownerId: userId };

  const listings = await prisma.listing.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      images: { orderBy: { order: 'asc' } },
      // "Contatos recebidos" (Fase 4, item 2) é o nº de conversas abertas pro anúncio — não precisa
      // de contador próprio, já é dado que existe.
      _count: { select: { conversations: true } },
    },
  });

  return reply.send(listings);
}

// ─── PERMISSÃO SOBRE UM IMÓVEL DE ORGANIZAÇÃO (B2B) ──────────────────────────

/**
 * `OWNER`/`ADMIN` gerenciam qualquer imóvel da própria organização; `BROKER` só o que está
 * atribuído a ele (`agentId`) — mesma regra pra editar e duplicar. `MANAGER` não cria/edita
 * imóvel (só visualiza, ver matriz de permissões em docs/crm-b2b-organizacoes-leads.md). Não
 * usada para deletar: deletar fica restrito a `OWNER`/`ADMIN` (ver `deleteListing`).
 */
export async function canManageOrgListing(
  userId: string,
  listing: { organizationId: string | null; agentId: string | null }
): Promise<boolean> {
  if (!listing.organizationId) return false;
  const membership = await prisma.organizationMember.findUnique({ where: { userId } });
  if (!membership || membership.organizationId !== listing.organizationId) return false;
  if (membership.role === 'OWNER' || membership.role === 'ADMIN') return true;
  return membership.role === 'BROKER' && listing.agentId === userId;
}

// ─── EDITAR IMÓVEL (requer auth + ser dono, ou OWNER/ADMIN/BROKER responsável da organização) ─

export async function updateListing(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id } = request.params as { id: string };

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });

  const isOwner = listing.ownerId === userId;
  if (!isOwner && !(await canManageOrgListing(userId, listing))) {
    return reply.status(403).send({ error: 'Sem permissão para editar este imóvel.' });
  }

  const schema = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    price: z.coerce.number().optional(),
    originalPrice: z.coerce.number().nullable().optional(),
    type: z.string().optional(),
    category: z.string().optional(),
    billingCycle: z.string().optional(),
    location: z.string().optional(),
    bedrooms: z.coerce.number().optional(),
    bathrooms: z.coerce.number().optional(),
    parking: z.coerce.number().optional(),
    amenities: z.string().optional(),
    checkInTime: z.string().optional(),
    checkOutTime: z.string().optional(),
    customMaxGuests: z.coerce.number().optional(),
    houseRules: z.string().optional(),
    safetyItems: z.string().optional(),
    cancellationPolicy: z.string().optional(),
    status: z.enum(['DRAFT', 'PENDING']).optional(),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const updateData: Record<string, any> = {};
  for (const [key, val] of Object.entries(parsed.data)) {
    if (val !== undefined) updateData[key] = val;
  }

  // Mesma regra de moderação automática da criação: imóvel de pessoa física (sem organização)
  // que está sendo enviado pra análise (ex.: publicar um rascunho) já nasce aprovado.
  if (updateData.status === 'PENDING' && !listing.organizationId) {
    updateData.status = 'APPROVED';
    updateData.rejectReason = null;
  }

  const updated = await prisma.listing.update({ where: { id }, data: updateData });
  return reply.send(updated);
}

// ─── REATRIBUIR CORRETOR RESPONSÁVEL (requer auth + ser OWNER/ADMIN da organização dona do imóvel) ─

export async function reassignListingAgent(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id } = request.params as { id: string };

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });
  if (!listing.organizationId) {
    return reply.status(400).send({ error: 'Este imóvel não pertence a uma organização.' });
  }

  const membership = await prisma.organizationMember.findUnique({ where: { userId } });
  if (
    !membership ||
    membership.organizationId !== listing.organizationId ||
    (membership.role !== 'OWNER' && membership.role !== 'ADMIN')
  ) {
    return reply.status(403).send({ error: 'Apenas quem gerencia a organização pode reatribuir o corretor responsável.' });
  }

  const schema = z.object({ agentId: z.string() });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const newAgentMembership = await prisma.organizationMember.findFirst({
    where: { userId: parsed.data.agentId, organizationId: listing.organizationId },
  });
  if (!newAgentMembership) {
    return reply.status(400).send({ error: 'O corretor precisa ser membro da mesma organização.' });
  }

  const updated = await prisma.listing.update({
    where: { id },
    data: { agentId: parsed.data.agentId },
  });

  return reply.send(updated);
}

// ─── APROVAR/REJEITAR IMÓVEL DE ORGANIZAÇÃO (requer OWNER/ADMIN da própria organização) ──────

/**
 * Moderação de imóvel de organização não passa pelo admin da plataforma — quem aprova é o
 * próprio cargo mais alto da imobiliária (OWNER/ADMIN), igual à regra de "gerenciar organização"
 * já usada em `reassignListingAgent`. Imóvel de pessoa física nunca chega aqui: nasce aprovado
 * automaticamente (ver `createListing`/`updateListing`).
 */
async function requireOrgListingManager(
  userId: string,
  listing: { organizationId: string | null; status: string }
): Promise<{ error: string; code: number } | null> {
  if (!listing.organizationId) {
    return { error: 'Este imóvel não pertence a uma organização.', code: 400 };
  }
  const membership = await prisma.organizationMember.findUnique({ where: { userId } });
  if (!membership || membership.organizationId !== listing.organizationId) {
    return { error: 'Sem permissão sobre este imóvel.', code: 403 };
  }
  if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
    return { error: 'Apenas quem gerencia a organização pode moderar este imóvel.', code: 403 };
  }
  if (listing.status !== 'PENDING') {
    return { error: 'Este imóvel não está aguardando aprovação.', code: 400 };
  }
  return null;
}

export async function approveOrgListing(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id } = request.params as { id: string };

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });

  const denied = await requireOrgListingManager(userId, listing);
  if (denied) return reply.status(denied.code).send({ error: denied.error });

  const updated = await prisma.listing.update({
    where: { id },
    data: { status: 'APPROVED', rejectReason: null },
  });

  if (updated.agentId) {
    await sendNotification({
      userId: updated.agentId,
      title: 'Anúncio Aprovado! 🎉',
      message: `Seu imóvel "${updated.name}" foi aprovado pela sua imobiliária e já está público no aplicativo.`,
      type: 'SYSTEM',
    });
  }

  return reply.send(updated);
}

export async function rejectOrgListing(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id } = request.params as { id: string };

  const schema = z.object({ reason: z.string().min(5) });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });

  const denied = await requireOrgListingManager(userId, listing);
  if (denied) return reply.status(denied.code).send({ error: denied.error });

  const updated = await prisma.listing.update({
    where: { id },
    data: { status: 'REJECTED', rejectReason: parsed.data.reason },
  });

  if (updated.agentId) {
    await sendNotification({
      userId: updated.agentId,
      title: 'Anúncio Rejeitado ❌',
      message: `Seu imóvel "${updated.name}" foi rejeitado pela sua imobiliária. Motivo: ${parsed.data.reason}`,
      type: 'SYSTEM',
    });
  }

  return reply.send(updated);
}

// ─── DUPLICAR IMÓVEL (requer auth + ser dono, OWNER/AGENT da empresa, OU admin) ──────────────

export async function duplicateListing(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId, role } = request.user as { id: string; role: string };
  const { id } = request.params as { id: string };

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { images: { orderBy: { order: 'asc' } } },
  });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });

  const isOwner = listing.ownerId === userId;
  const isAdmin = role === 'ADMIN';
  if (!isOwner && !isAdmin && !(await canManageOrgListing(userId, listing))) {
    return reply.status(403).send({ error: 'Sem permissão para duplicar este imóvel.' });
  }

  // Imóvel de organização: a cópia continua da organização, com quem duplicou como novo
  // corretor responsável (mesma lógica de criação); pessoa física mantém o dono original.
  const duplicate = await prisma.listing.create({
    data: {
      name: `${listing.name} (cópia)`,
      description: listing.description,
      price: listing.price,
      type: listing.type,
      category: listing.category,
      billingCycle: listing.billingCycle,
      location: listing.location,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      parking: listing.parking,
      ownerId: listing.organizationId ? null : listing.ownerId,
      organizationId: listing.organizationId,
      agentId: listing.organizationId ? userId : null,
      status: 'DRAFT',
      images: {
        create: listing.images.map((img) => ({ url: img.url, order: img.order })),
      },
    },
    include: { images: { orderBy: { order: 'asc' } } },
  });

  return reply.status(201).send(duplicate);
}

// ─── IMPORTAR IMÓVEIS EM LOTE VIA CSV (requer auth + conta Imobiliária) ──────

/**
 * Cada linha vira um anúncio em rascunho (`DRAFT`) — não fica público até o dono revisar
 * e publicar manualmente, mesmo espírito do recurso de rascunho da criação individual.
 *
 * Imagem continua obrigatória (mesma regra da criação manual), mas aqui não há upload de
 * arquivo: a coluna `imagens` traz uma ou mais URLs (separadas por `|`) que já precisam
 * estar hospedadas em algum lugar — as URLs são gravadas como estão, sem novo processamento
 * (mesmo padrão que `duplicateListing` já usa para copiar `ListingImage.url`).
 */
const importRowSchema = z
  .object({
    nome: z.string({ required_error: 'Nome é obrigatório' }).trim().min(1, 'Nome é obrigatório'),
    descricao: z.string().trim().optional(),
    preco: z.coerce.number({ invalid_type_error: 'Preço inválido' }).positive('Preço deve ser maior que zero'),
    tipo: z.enum(['casa', 'apartamento'], {
      errorMap: () => ({ message: 'Tipo deve ser "casa" ou "apartamento"' }),
    }),
    categoria: z.enum(['aluguel', 'venda'], {
      errorMap: () => ({ message: 'Categoria deve ser "aluguel" ou "venda"' }),
    }),
    ciclo_cobranca: z
      .enum(['noite', 'mês'], { errorMap: () => ({ message: 'Ciclo de cobrança deve ser "noite" ou "mês"' }) })
      .optional(),
    localizacao: z.string({ required_error: 'Localização é obrigatória' }).trim().min(1, 'Localização é obrigatória'),
    quartos: z.coerce.number({ invalid_type_error: 'Quartos inválido' }).int().min(0).default(0),
    banheiros: z.coerce.number({ invalid_type_error: 'Banheiros inválido' }).int().min(0).default(0),
    vagas: z.coerce.number({ invalid_type_error: 'Vagas inválido' }).int().min(0).default(0),
    imagens: z
      .string({ required_error: 'Informe ao menos uma URL de imagem (separe várias com "|")' })
      .trim()
      .min(1, 'Informe ao menos uma URL de imagem (separe várias com "|")'),
  })
  .refine((data) => data.categoria !== 'aluguel' || !!data.ciclo_cobranca, {
    message: 'Ciclo de cobrança é obrigatório para categoria "aluguel" (use "noite" ou "mês")',
    path: ['ciclo_cobranca'],
  });

export async function importListings(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: ownerId } = request.user as { id: string };

  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { accountType: true } });
  if (!owner || owner.accountType !== 'AGENCY') {
    return reply.status(403).send({ error: 'Importação em lote é exclusiva para contas Imobiliária.' });
  }

  let csvBuffer: Buffer | null = null;
  for await (const part of request.parts()) {
    if (part.type === 'file' && part.fieldname === 'file') {
      csvBuffer = await part.toBuffer();
    }
  }

  if (!csvBuffer) {
    return reply.status(400).send({ error: 'Envie um arquivo CSV.' });
  }

  let text = csvBuffer.toString('utf-8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // remove BOM do Excel, se presente

  // Excel em pt-BR costuma exportar CSV com ";" (vírgula já é o separador decimal do locale) —
  // detecta pelo separador mais frequente na linha de cabeçalho.
  const headerLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (headerLine.match(/;/g)?.length ?? 0) > (headerLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  let rows: Record<string, string>[];
  try {
    rows = parseCsv(text, {
      columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
      delimiter,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    return reply.status(400).send({ error: 'Não foi possível ler o arquivo CSV. Verifique o formato.' });
  }

  if (rows.length === 0) {
    return reply.status(400).send({ error: 'O arquivo não tem linhas de dados.' });
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return reply.status(400).send({
      error: `Máximo de ${MAX_IMPORT_ROWS} anúncios por importação (o arquivo tem ${rows.length}).`,
    });
  }

  const toCreate: Array<{
    data: {
      name: string; description: string | null; price: number; type: string; category: string;
      billingCycle: string | null; location: string; bedrooms: number; bathrooms: number; parking: number;
    };
    imageUrls: string[];
  }> = [];
  const rowErrors: Array<{ row: number; messages: string[] }> = [];

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2; // +1 pelo cabeçalho, +1 porque a linha 1 é a primeira linha de dados

    const normalized: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(rawRow)) {
      normalized[key] = value === '' ? undefined : value;
    }

    const parsed = importRowSchema.safeParse(normalized);
    if (!parsed.success) {
      rowErrors.push({ row: rowNumber, messages: parsed.error.errors.map((e) => e.message) });
      return;
    }

    const imageUrls = parsed.data.imagens.split('|').map((url) => url.trim()).filter(Boolean);
    if (imageUrls.length === 0) {
      rowErrors.push({ row: rowNumber, messages: ['Informe ao menos uma URL de imagem.'] });
      return;
    }
    if (imageUrls.length > MAX_LISTING_IMAGES) {
      rowErrors.push({ row: rowNumber, messages: [`Máximo de ${MAX_LISTING_IMAGES} imagens por anúncio.`] });
      return;
    }
    const invalidUrl = imageUrls.find((url) => !z.string().url().safeParse(url).success);
    if (invalidUrl) {
      rowErrors.push({ row: rowNumber, messages: [`URL de imagem inválida: ${invalidUrl}`] });
      return;
    }

    toCreate.push({
      data: {
        name: parsed.data.nome,
        description: parsed.data.descricao ?? null,
        price: parsed.data.preco,
        type: parsed.data.tipo,
        category: parsed.data.categoria,
        billingCycle: parsed.data.ciclo_cobranca ?? null,
        location: parsed.data.localizacao,
        bedrooms: parsed.data.quartos,
        bathrooms: parsed.data.banheiros,
        parking: parsed.data.vagas,
      },
      imageUrls,
    });
  });

  const created = toCreate.length
    ? await prisma.$transaction(
        toCreate.map(({ data, imageUrls }) =>
          prisma.listing.create({
            data: {
              ...data,
              ownerId,
              status: 'DRAFT',
              images: { create: imageUrls.map((url, order) => ({ url, order })) },
            },
            include: { images: { orderBy: { order: 'asc' } } },
          })
        )
      )
    : [];

  return reply.status(200).send({
    createdCount: created.length,
    listings: created,
    errors: rowErrors,
  });
}

// ─── DELETAR IMÓVEL (requer auth + ser dono OU admin) ────────────────────────

export async function deleteListing(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId, role } = request.user as { id: string; role: string };
  const { id } = request.params as { id: string };

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });

  const isOwner = listing.ownerId === userId;
  const isAdmin = role === 'ADMIN';

  // Remover não está entre as ações de BROKER/MANAGER (só criar/editar/duplicar o que lhe foi
  // atribuído) — só quem gerencia a organização (OWNER/ADMIN) pode remover um imóvel da equipe.
  let canManageOrgHere = false;
  if (!isOwner && !isAdmin && listing.organizationId) {
    const membership = await prisma.organizationMember.findUnique({ where: { userId } });
    canManageOrgHere =
      membership?.organizationId === listing.organizationId &&
      (membership.role === 'OWNER' || membership.role === 'ADMIN');
  }

  if (!isOwner && !isAdmin && !canManageOrgHere) {
    return reply.status(403).send({ error: 'Sem permissão para remover este imóvel.' });
  }

  await prisma.listing.delete({ where: { id } });
  return reply.status(204).send();
}
