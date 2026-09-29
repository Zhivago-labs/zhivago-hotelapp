import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ensureLead, getCurrentAssignment } from '../lib/leads.js';
import {
  proposeRound,
  respondToRound,
  listConversationNegotiations,
  type RoundAction,
} from '../lib/negotiations.js';

// Negociação de valor no chat — toda a regra vive em lib/negotiations.ts; aqui só HTTP.

const roundSchema = z.object({
  value: z.number().positive(),
  paymentMethod: z.string().max(60).optional().nullable(),
});

/** POST /conversations/:id/negotiations/rounds — proposta nova ou contraproposta. */
export async function createNegotiationRound(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId } = request.user as { id: string };
  const { id: conversationId } = request.params as { id: string };

  const parsed = roundSchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: 'Informe um valor válido.' });

  try {
    const { status, body } = await proposeRound({ actorId: userId, conversationId, ...parsed.data });
    return reply.status(status).send(body);
  } catch (error) {
    console.error('Negotiation Round Error:', error);
    return reply.status(500).send({ error: 'Erro ao enviar proposta.' });
  }
}

/** GET /conversations/:id/negotiations — estado atual pros cards do chat. */
export async function getConversationNegotiations(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId, role } = request.user as { id: string; role: string };
  const { id: conversationId } = request.params as { id: string };
  try {
    const { status, body } = await listConversationNegotiations(userId, role, conversationId);
    return reply.status(status).send(body);
  } catch (error) {
    console.error('List Negotiations Error:', error);
    return reply.status(500).send({ error: 'Erro ao carregar negociações.' });
  }
}

function roundActionHandler(action: RoundAction) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { id: userId } = request.user as { id: string };
    const { id: offerId } = request.params as { id: string };
    try {
      const { status, body } = await respondToRound({ actorId: userId, offerId, action });
      return reply.status(status).send(body);
    } catch (error) {
      console.error(`Negotiation ${action} Error:`, error);
      return reply.status(500).send({ error: 'Erro ao responder a proposta.' });
    }
  };
}

export const acceptOffer = roundActionHandler('ACCEPT');
export const rejectOffer = roundActionHandler('REJECT');
export const withdrawOffer = roundActionHandler('WITHDRAW');

/**
 * POST /listings/:id/offers — rota do fluxo antigo de "proposta de compra", ainda usada pelo app
 * mobile. Garante a conversa do cliente com o responsável (mesma regra de sempre: dono na pessoa
 * física, corretor do Lead na organização) e delega pra `proposeRound`.
 */
export async function createOffer(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId } = request.user as { id: string };
  const { id: listingId } = request.params as { id: string };

  const parsed = roundSchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: 'Informe um valor válido.' });

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });

  try {
    let leadId: string | null = null;
    if (listing.organizationId) {
      const lead = await ensureLead({ userId, listingId, organizationId: listing.organizationId, source: 'OFFER' });
      leadId = lead.id;
    }

    let contactId: string | null = listing.ownerId;
    if (leadId) {
      const currentAssignment = await getCurrentAssignment(leadId);
      if (currentAssignment) {
        const broker = await prisma.organizationMember.findUnique({ where: { id: currentAssignment.brokerId } });
        contactId = broker?.userId ?? null;
      }
    }
    if (!contactId || contactId === userId) {
      return reply.status(400).send({ error: 'Não há um responsável disponível para receber a proposta.' });
    }

    // Busca só pelo cliente (não pelo par) — o responsável muda com a (re)atribuição do Lead.
    let conversation = await prisma.conversation.findFirst({
      where: { propertyId: listingId, participants: { some: { id: userId } } },
    });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { propertyId: listingId, leadId, participants: { connect: [{ id: userId }, { id: contactId }] } },
      });
    }

    const { status, body } = await proposeRound({ actorId: userId, conversationId: conversation.id, ...parsed.data });
    if (status >= 300) return reply.status(status).send(body);
    return reply.status(201).send({ ...(body as object), conversationId: conversation.id });
  } catch (error) {
    console.error('Offer Creation Error:', error);
    return reply.status(500).send({ error: 'Erro ao criar proposta.' });
  }
}
