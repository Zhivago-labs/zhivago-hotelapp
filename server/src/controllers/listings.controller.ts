import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
          select: { id: true, name: true, avatar: true },
        },
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
          select: { id: true, name: true, avatar: true, email: true, phone: true },
        },
      },
    });

    if (!listing) {
      return reply.status(404).send({ error: 'Imóvel não encontrado.' });
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
  const { id: ownerId } = request.user as { id: string };
  const parts = request.parts();
  let fileUrl = '';
  const formData: Record<string, string> = {};

  try {
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'image') {
        const filename = `${Date.now()}-${path.parse(part.filename).name}.webp`;
        const uploadPath = path.join(__dirname, '..', '..', 'uploads', filename);
        
        const buffer = await part.toBuffer();
        await sharp(buffer)
          .resize({ width: 1200, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(uploadPath);

        const host = request.headers['host'] ?? 'localhost:3333';
        const protocol = request.protocol ?? 'http';
        fileUrl = `${protocol}://${host}/uploads/${filename}`;
      } else if (part.type === 'field') {
        formData[part.fieldname] = part.value as string;
      }
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
    });

    const data = schema.parse(formData);

    const newListing = await prisma.listing.create({
      data: {
        ...data,
        image: fileUrl || (formData['image'] ?? ''),
        description: data.description ?? null,
        billingCycle: data.billingCycle ?? null,
        ownerId,
        status: 'APPROVED', // pode mudar para PENDING se quiser moderação
      },
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
  const { id: ownerId } = request.user as { id: string };

  const listings = await prisma.listing.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'desc' },
  });

  return reply.send(listings);
}

// ─── EDITAR IMÓVEL (requer auth + ser dono) ───────────────────────────────────

export async function updateListing(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id } = request.params as { id: string };

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });
  if (listing.ownerId !== userId) return reply.status(403).send({ error: 'Sem permissão para editar este imóvel.' });

  const schema = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    price: z.coerce.number().optional(),
    type: z.string().optional(),
    category: z.string().optional(),
    billingCycle: z.string().optional(),
    location: z.string().optional(),
    bedrooms: z.coerce.number().optional(),
    bathrooms: z.coerce.number().optional(),
    parking: z.coerce.number().optional(),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const updated = await prisma.listing.update({ where: { id }, data: parsed.data });
  return reply.send(updated);
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

  if (!isOwner && !isAdmin) {
    return reply.status(403).send({ error: 'Sem permissão para remover este imóvel.' });
  }

  await prisma.listing.delete({ where: { id } });
  return reply.status(204).send();
}
