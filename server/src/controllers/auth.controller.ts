import type { FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

// ─── REGISTER ────────────────────────────────────────────────────────────────

export async function register(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const schema = z.object({
    name: z.string().min(2, 'Nome muito curto'),
    email: z.string().email('E-mail inválido'),
    password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
    phone: z.string().optional(),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.errors });
  }

  const { name, email, password, phone } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return reply.status(409).send({ error: 'E-mail já cadastrado.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { name, email, passwordHash, phone: phone ?? null },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  const token = await reply.jwtSign(
    { id: user.id, email: user.email, role: user.role },
    { expiresIn: '7d' }
  );

  return reply.status(201).send({ user, token });
}

// ─── LOGIN ───────────────────────────────────────────────────────────────────

export async function login(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const schema = z.object({
    email: z.string().email(),
    password: z.string(),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.errors });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return reply.status(401).send({ error: 'E-mail ou senha inválidos.' });
  }

  if (user.status !== 'ACTIVE') {
    return reply.status(403).send({ error: 'Conta suspensa ou banida. Entre em contato com o suporte.' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return reply.status(401).send({ error: 'E-mail ou senha inválidos.' });
  }

  const token = await reply.jwtSign(
    { id: user.id, email: user.email, role: user.role },
    { expiresIn: '7d' }
  );

  return reply.send({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    token,
  });
}

// ─── ME (perfil do usuário logado) ───────────────────────────────────────────

export async function me(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.user as { id: string };

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, phone: true, avatar: true, role: true, status: true, createdAt: true },
  });

  if (!user) {
    return reply.status(404).send({ error: 'Usuário não encontrado.' });
  }

  return reply.send(user);
}

// ─── UPDATE ME ───────────────────────────────────────────────────────────────

export async function updateMe(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.user as { id: string };

  const schema = z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.errors });
  }

  const user = await prisma.user.update({
    where: { id },
    data: parsed.data,
    select: { id: true, name: true, email: true, phone: true, avatar: true, role: true },
  });

  return reply.send(user);
}

// ─── UPDATE PASSWORD ─────────────────────────────────────────────────────────

export async function updatePassword(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.user as { id: string };

  const schema = z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(6, 'A nova senha deve ter no mínimo 6 caracteres'),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.errors });
  }

  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return reply.status(404).send({ error: 'Usuário não encontrado.' });
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return reply.status(401).send({ error: 'Senha atual incorreta.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id },
    data: { passwordHash },
  });

  return reply.send({ message: 'Senha atualizada com sucesso.' });
}

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────

export async function forgotPassword(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const schema = z.object({
    email: z.string().email(),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.errors });
  }

  const { email } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Não revelar se o email existe ou não por segurança
    return reply.send({ message: 'Se o e-mail estiver cadastrado, as instruções foram enviadas.' });
  }

  // Gera token de 6 dígitos
  const token = Math.floor(100000 + Math.random() * 900000).toString();
  // Expira em 1 hora
  const expiry = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: token, resetTokenExpiry: expiry },
  });

  const { sendResetPasswordEmail } = await import('../lib/mail.js');
  await sendResetPasswordEmail(user.email, token);

  return reply.send({ message: 'Se o e-mail estiver cadastrado, as instruções foram enviadas.' });
}

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────

export async function resetPassword(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const schema = z.object({
    email: z.string().email(),
    token: z.string().length(6),
    newPassword: z.string().min(6, 'A nova senha deve ter no mínimo 6 caracteres'),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.errors });
  }

  const { email, token, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.resetToken !== token || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    return reply.status(400).send({ error: 'Token inválido ou expirado.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { 
      passwordHash,
      resetToken: null,
      resetTokenExpiry: null
    },
  });

  return reply.send({ message: 'Senha redefinida com sucesso. Você já pode fazer login.' });
}

