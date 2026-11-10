import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getMembership } from '../lib/organizations.js';
import { sendNotification } from '../services/notification.service.js';

// ─── CÓDIGO DE CONVITE DA IMOBILIÁRIA ────────────────────────────────────────────────────────
// Cada imobiliária (Organization.type AGENCY) tem um código curto que o dono compartilha com a
// equipe. Digitar o código NÃO dá acesso: cria um pedido que OWNER/ADMIN precisa aprovar. Assim um
// código vazado não expõe dados de clientes — e o dono pode gerar outro a qualquer momento.

// Sem 0/O, 1/I/L: fácil de ditar e digitar no celular. 31^8 ≈ 8,5×10^11 combinações.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatJoinCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

async function assignNewCode(organizationId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      await prisma.organization.update({ where: { id: organizationId }, data: { joinCode: code } });
      return code;
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error; // colisão de código único: tenta outro
    }
  }
  throw new Error('Não foi possível gerar um código único.');
}

type OrgMembership = { organizationId: string; role: string; userId: string };
const membershipOf = (request: FastifyRequest) => (request as FastifyRequest & { orgMembership: OrgMembership }).orgMembership;

/** GET /organizations/join-code — código atual (gerado na primeira vez). OWNER/ADMIN. */
export async function getJoinCode(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { organizationId } = membershipOf(request);
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { type: true, joinCode: true } });
  if (!organization) return reply.status(404).send({ error: 'Imobiliária não encontrada.' });
  if (organization.type !== 'AGENCY') return reply.status(403).send({ error: 'O código de convite é exclusivo para imobiliárias.' });
  const code = organization.joinCode ?? (await assignNewCode(organizationId));
  return reply.send({ code: formatJoinCode(code) });
}

/** POST /organizations/join-code/regenerate — troca o código; o anterior para de funcionar. OWNER/ADMIN. */
export async function regenerateJoinCode(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { organizationId } = membershipOf(request);
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { type: true } });
  if (!organization) return reply.status(404).send({ error: 'Imobiliária não encontrada.' });
  if (organization.type !== 'AGENCY') return reply.status(403).send({ error: 'O código de convite é exclusivo para imobiliárias.' });
  return reply.send({ code: formatJoinCode(await assignNewCode(organizationId)) });
}

// ─── PEDIDOS PARA ENTRAR (lado de quem digita o código) ──────────────────────────────────────

const requestSelect = {
  id: true,
  status: true,
  createdAt: true,
  organization: { select: { id: true, name: true, logo: true } },
} as const;

/** POST /organizations/join-requests { code } — pede para entrar. Rate limit próprio na rota. */
export async function createJoinRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const parsed = z.object({ code: z.string().max(40) }).safeParse(request.body);
  const code = parsed.success ? normalizeJoinCode(parsed.data.code) : '';
  if (code.length !== CODE_LENGTH) return reply.status(400).send({ error: 'Digite o código com 8 letras e números, como ABCD-2345.' });

  const organization = await prisma.organization.findUnique({ where: { joinCode: code }, select: { id: true, name: true, type: true } });
  if (!organization || organization.type !== 'AGENCY') {
    return reply.status(404).send({ error: 'Código não encontrado. Confira com a sua imobiliária.' });
  }

  const membership = await getMembership(userId);
  if (membership?.status === 'ACTIVE') {
    return reply.status(409).send({ error: 'Você já faz parte de uma imobiliária.' });
  }
  // OrganizationMember.userId é único: quem foi removido de OUTRA imobiliária mantém a linha
  // (histórico do CRM) e não pode entrar numa nova. Voltar para a mesma é permitido (reativa).
  if (membership && membership.organizationId !== organization.id) {
    return reply.status(409).send({ error: 'Sua conta já esteve vinculada a outra imobiliária. Fale com o suporte para trocar.' });
  }

  const pending = await prisma.organizationJoinRequest.findFirst({ where: { userId, status: 'PENDING' }, select: { organizationId: true } });
  if (pending) {
    return reply.status(409).send({ error: pending.organizationId === organization.id
      ? 'Seu pedido para esta imobiliária já está aguardando aprovação.'
      : 'Você já tem um pedido aguardando aprovação. Cancele-o antes de pedir para entrar em outra imobiliária.' });
  }

  const [joinRequest] = await prisma.$transaction([
    prisma.organizationJoinRequest.create({ data: { userId, organizationId: organization.id }, select: requestSelect }),
    // Quem entra pelo código no primeiro acesso não passa pela escolha "pessoal/imobiliária":
    // conclui o onboarding como conta comum; vira AGENCY só quando o pedido for aprovado.
    prisma.user.updateMany({ where: { id: userId, onboardingCompleted: false }, data: { onboardingCompleted: true } }),
  ]);

  const managers = await prisma.organizationMember.findMany({
    where: { organizationId: organization.id, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
    select: { userId: true },
  });
  const requester = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  await Promise.all(managers.map((manager) => sendNotification({
    userId: manager.userId,
    title: 'Pedido para entrar na equipe',
    message: `${requester?.name ?? 'Uma pessoa'} usou o código da ${organization.name} e aguarda sua aprovação.`,
    type: 'INFO',
  })));

  return reply.status(201).send(joinRequest);
}

/** GET /organizations/join-requests/me — meu pedido mais recente (para mostrar o status). */
export async function getMyJoinRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const latest = await prisma.organizationJoinRequest.findFirst({
    where: { userId, status: { in: ['PENDING', 'REJECTED'] } },
    orderBy: { createdAt: 'desc' },
    select: requestSelect,
  });
  return reply.send(latest);
}

/** DELETE /organizations/join-requests/me — cancela o pedido pendente. */
export async function cancelMyJoinRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { count } = await prisma.organizationJoinRequest.updateMany({
    where: { userId, status: 'PENDING' },
    data: { status: 'CANCELLED', decidedAt: new Date() },
  });
  if (!count) return reply.status(404).send({ error: 'Você não tem pedido aguardando aprovação.' });
  return reply.status(204).send();
}

// ─── PEDIDOS PARA ENTRAR (lado do dono) ──────────────────────────────────────────────────────

/** GET /organizations/join-requests — pedidos pendentes da minha imobiliária. OWNER/ADMIN. */
export async function listJoinRequests(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { organizationId } = membershipOf(request);
  const items = await prisma.organizationJoinRequest.findMany({
    where: { organizationId, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true, user: { select: { id: true, name: true, email: true, avatar: true } } },
  });
  return reply.send(items);
}

async function findPendingForOrg(request: FastifyRequest) {
  const { organizationId } = membershipOf(request);
  const { id } = request.params as { id: string };
  return prisma.organizationJoinRequest.findFirst({
    where: { id, organizationId, status: 'PENDING' },
    select: { id: true, userId: true, organizationId: true, organization: { select: { name: true } } },
  });
}

/** POST /organizations/join-requests/:id/approve — vira corretor (BROKER). OWNER/ADMIN. */
export async function approveJoinRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { userId: deciderId } = membershipOf(request);
  const joinRequest = await findPendingForOrg(request);
  if (!joinRequest) return reply.status(404).send({ error: 'Pedido não encontrado ou já respondido.' });

  const membership = await getMembership(joinRequest.userId);
  if (membership && (membership.status === 'ACTIVE' || membership.organizationId !== joinRequest.organizationId)) {
    // Entrou em outro lugar (ex.: convite por e-mail) depois de pedir: o pedido perde o sentido.
    await prisma.organizationJoinRequest.update({ where: { id: joinRequest.id }, data: { status: 'CANCELLED', decidedAt: new Date() } });
    return reply.status(409).send({ error: 'Essa pessoa já faz parte de uma imobiliária.' });
  }

  const decided = { status: 'APPROVED', decidedBy: deciderId, decidedAt: new Date() };
  await prisma.$transaction([
    membership
      ? prisma.organizationMember.update({ where: { id: membership.id }, data: { status: 'ACTIVE', role: 'BROKER', receiveLeads: true } })
      : prisma.organizationMember.create({ data: { userId: joinRequest.userId, organizationId: joinRequest.organizationId, role: 'BROKER' } }),
    prisma.organizationJoinRequest.update({ where: { id: joinRequest.id }, data: decided }),
    prisma.user.update({ where: { id: joinRequest.userId }, data: { accountType: 'AGENCY', onboardingCompleted: true } }),
  ]);
  await sendNotification({
    userId: joinRequest.userId,
    title: 'Pedido aprovado',
    message: `Você agora faz parte da equipe da ${joinRequest.organization.name}.`,
    type: 'SUCCESS',
  });
  return reply.send({ status: 'APPROVED' });
}

/** POST /organizations/join-requests/:id/reject — recusa o pedido. OWNER/ADMIN. */
export async function rejectJoinRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { userId: deciderId } = membershipOf(request);
  const joinRequest = await findPendingForOrg(request);
  if (!joinRequest) return reply.status(404).send({ error: 'Pedido não encontrado ou já respondido.' });
  await prisma.organizationJoinRequest.update({ where: { id: joinRequest.id }, data: { status: 'REJECTED', decidedBy: deciderId, decidedAt: new Date() } });
  await sendNotification({
    userId: joinRequest.userId,
    title: 'Pedido não aprovado',
    message: `A ${joinRequest.organization.name} não aprovou seu pedido para entrar na equipe.`,
    type: 'INFO',
  });
  return reply.send({ status: 'REJECTED' });
}
