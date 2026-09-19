import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sendNotification } from '../services/notification.service.js';
import { logAdminAction } from '../lib/admin-log.js';

function adminId(request: FastifyRequest): string {
  return (request.user as { id: string }).id;
}

// ─── ESTATÍSTICAS DO SISTEMA ──────────────────────────────────────────────────

export async function getStats(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [
    totalUsers,
    totalListings,
    pendingListings,
    approvedListings,
    rejectedListings,
    recentBookings,
    casas,
    apartamentos,
    aluguel,
    venda
  ] = await Promise.all([
    prisma.user.count(),
    prisma.listing.count(),
    prisma.listing.count({ where: { status: 'PENDING' } }),
    prisma.listing.count({ where: { status: 'APPROVED' } }),
    prisma.listing.count({ where: { status: 'REJECTED' } }),
    prisma.booking.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true }
    }),
    prisma.listing.count({ where: { type: 'casa' } }),
    prisma.listing.count({ where: { type: 'apartamento' } }),
    prisma.listing.count({ where: { category: 'aluguel' } }),
    prisma.listing.count({ where: { category: 'venda' } }),
  ]);

  const bookingsByMonth = recentBookings.reduce((acc: Record<string, number>, booking) => {
    const month = booking.createdAt.toISOString().slice(0, 7);
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {});

  return reply.send({
    totalUsers,
    totalListings,
    listingsStatus: {
      pending: pendingListings,
      approved: approvedListings,
      rejected: rejectedListings,
    },
    listingsDistribution: {
      types: { casa: casas, apartamento: apartamentos },
      categories: { aluguel, venda },
    },
    bookingsByMonth
  });
}

// ─── LISTAR TODOS OS USUÁRIOS ─────────────────────────────────────────────────

export async function getAllUsers(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as {
    status?: string;
    role?: string;
    accountType?: string;
    verified?: string;
    search?: string;
    page?: string;
  };
  const page = Math.max(1, Number(query.page ?? '1'));
  const take = 20;
  const skip = (page - 1) * take;

  const where: Record<string, unknown> = {};
  if (query.status) where['status'] = query.status;
  if (query.role) where['role'] = query.role;
  if (query.accountType) where['accountType'] = query.accountType;
  if (query.verified === 'true' || query.verified === 'false') {
    where['verified'] = query.verified === 'true';
  }
  // Quem já é membro de uma Organization (B2B) tem sua verificação feita via
  // `Organization.verified` (aba "Organizações"), não aqui — mesmo que `accountType` tenha virado
  // "AGENCY" como efeito colateral de aceitar um convite (ver `acceptInvite`). Sem isso, todo
  // corretor/gerente de uma organização já verificada aparecia de novo aqui como se fosse dono de
  // uma imobiliária própria pendente de revisão.
  if (query.accountType === 'AGENCY') {
    where['organizationMembership'] = null;
  }
  if (query.search) {
    where['OR'] = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        accountType: true,
        document: true,
        creci: true,
        companyName: true,
        verified: true,
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.user.count({ where }),
  ]);

  return reply.send({ users, total, page, totalPages: Math.ceil(total / take) });
}

// ─── ATUALIZAR STATUS DO USUÁRIO ──────────────────────────────────────────────

export async function updateUserStatus(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const schema = z.object({
    status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return reply.status(404).send({ error: 'Usuário não encontrado.' });

  // Incrementa tokenVersion ao suspender/banir para invalidar todas as sessões ativas do usuário
  const updated = await prisma.user.update({
    where: { id },
    data: {
      status: parsed.data.status,
      ...(parsed.data.status !== 'ACTIVE' ? { tokenVersion: { increment: 1 } } : {}),
    },
    select: { id: true, name: true, email: true, role: true, status: true },
  });

  await logAdminAction({
    adminId: adminId(request),
    action: 'USER_STATUS_CHANGE',
    targetType: 'USER',
    targetId: id,
    metadata: { from: user.status, to: parsed.data.status },
  });

  return reply.send(updated);
}

// ─── ATUALIZAR ROLE DO USUÁRIO ────────────────────────────────────────────────

export async function updateUserRole(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const schema = z.object({
    role: z.enum(['USER', 'ADMIN']),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  // Incrementa tokenVersion para forçar re-login com novo role no JWT
  const updated = await prisma.user.update({
    where: { id },
    data: { role: parsed.data.role, tokenVersion: { increment: 1 } },
    select: { id: true, name: true, email: true, role: true },
  });

  await logAdminAction({
    adminId: adminId(request),
    action: 'USER_ROLE_CHANGE',
    targetType: 'USER',
    targetId: id,
    metadata: { to: parsed.data.role },
  });

  return reply.send(updated);
}

// ─── VERIFICAR/DESVERIFICAR CONTA DE IMOBILIÁRIA ─────────────────────────────

export async function verifyUser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const schema = z.object({
    verified: z.boolean(),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return reply.status(404).send({ error: 'Usuário não encontrado.' });

  const updated = await prisma.user.update({
    where: { id },
    data: { verified: parsed.data.verified },
    select: { id: true, name: true, email: true, accountType: true, companyName: true, verified: true },
  });

  await logAdminAction({
    adminId: adminId(request),
    action: 'USER_VERIFY',
    targetType: 'USER',
    targetId: id,
    metadata: { verified: parsed.data.verified },
  });

  return reply.send(updated);
}

// ─── LISTAR ORGANIZAÇÕES (B2B — evoluído da Fase B, corretores) ──────────────

/**
 * Segunda visão de "conta pra verificar" ao lado de `getAllUsers`/`verifyUser` (contas AGENCY
 * pessoa física, Fase A) — `Organization.verified` é independente de `User.verified`, ver
 * decisão 4 em `docs/web-mobile-e-imobiliarias.md` Parte 3.1 e `docs/crm-b2b-organizacoes-leads.md`.
 */
export async function getAllOrganizations(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as { verified?: string; page?: string };
  const page = Math.max(1, Number(query.page ?? '1'));
  const take = 20;
  const skip = (page - 1) * take;

  const where: Record<string, boolean> = {};
  if (query.verified === 'true' || query.verified === 'false') {
    where['verified'] = query.verified === 'true';
  }

  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        members: {
          where: { role: 'OWNER' },
          include: { user: { select: { id: true, name: true, email: true, phone: true } } },
        },
      },
      take,
      skip,
    }),
    prisma.organization.count({ where }),
  ]);

  return reply.send({ organizations, total, page, totalPages: Math.ceil(total / take) });
}

// ─── VERIFICAR/DESVERIFICAR ORGANIZAÇÃO ──────────────────────────────────────

export async function verifyOrganization(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const schema = z.object({ verified: z.boolean() });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const organization = await prisma.organization.findUnique({ where: { id } });
  if (!organization) return reply.status(404).send({ error: 'Organização não encontrada.' });

  const updated = await prisma.organization.update({
    where: { id },
    data: { verified: parsed.data.verified },
  });

  await logAdminAction({
    adminId: adminId(request),
    action: 'ORG_VERIFY',
    targetType: 'ORGANIZATION',
    targetId: id,
    metadata: { verified: parsed.data.verified },
  });

  return reply.send(updated);
}

// ─── LISTAR TODOS OS IMÓVEIS (com filtro de status) ──────────────────────────

export async function adminGetListings(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as { status?: string; page?: string };
  const page = Math.max(1, Number(query.page ?? '1'));
  const take = 20;
  const skip = (page - 1) * take;

  const where = query.status ? { status: query.status } : {};

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        images: { orderBy: { order: 'asc' } },
      },
      take,
      skip,
    }),
    prisma.listing.count({ where }),
  ]);

  return reply.send({ listings, total, page, totalPages: Math.ceil(total / take) });
}

// ─── APROVAR IMÓVEL ───────────────────────────────────────────────────────────

export async function approveListing(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });

  const updated = await prisma.listing.update({
    where: { id },
    data: { status: 'APPROVED', rejectReason: null },
  });

  if (updated.ownerId) {
    await sendNotification({
      userId: updated.ownerId,
      title: 'Anúncio Aprovado! 🎉',
      message: `Seu imóvel "${updated.name}" foi aprovado e já está público no aplicativo.`,
      type: 'SYSTEM',
    });
  }

  await logAdminAction({
    adminId: adminId(request),
    action: 'LISTING_APPROVE',
    targetType: 'LISTING',
    targetId: id,
  });

  return reply.send(updated);
}

// ─── VOLTAR PARA PENDENTE ─────────────────────────────────────────────────────

export async function pendingListing(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });

  const updated = await prisma.listing.update({
    where: { id },
    data: { status: 'PENDING', rejectReason: null },
  });

  if (updated.ownerId) {
    await sendNotification({
      userId: updated.ownerId,
      title: 'Anúncio em Análise ⏳',
      message: `Seu imóvel "${updated.name}" foi colocado em análise pela moderação e ficará temporariamente oculto nas buscas.`,
      type: 'SYSTEM',
    });
  }

  await logAdminAction({
    adminId: adminId(request),
    action: 'LISTING_PENDING',
    targetType: 'LISTING',
    targetId: id,
  });

  return reply.send(updated);
}

// ─── REJEITAR IMÓVEL ──────────────────────────────────────────────────────────

export async function rejectListing(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const schema = z.object({ reason: z.string().min(5) });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });

  const updated = await prisma.listing.update({
    where: { id },
    data: { status: 'REJECTED', rejectReason: parsed.data.reason },
  });

  if (updated.ownerId) {
    await sendNotification({
      userId: updated.ownerId,
      title: 'Anúncio Rejeitado ❌',
      message: `Seu imóvel "${updated.name}" foi rejeitado pela moderação. Motivo: ${parsed.data.reason}`,
      type: 'SYSTEM',
    });
  }

  await logAdminAction({
    adminId: adminId(request),
    action: 'LISTING_REJECT',
    targetType: 'LISTING',
    targetId: id,
    reason: parsed.data.reason,
  });

  return reply.send(updated);
}

// ─── REMOVER IMÓVEL (admin) ───────────────────────────────────────────────────

export async function adminDeleteListing(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });

  await prisma.listing.delete({ where: { id } });

  await logAdminAction({
    adminId: adminId(request),
    action: 'LISTING_DELETE',
    targetType: 'LISTING',
    targetId: id,
  });

  return reply.status(204).send();
}
