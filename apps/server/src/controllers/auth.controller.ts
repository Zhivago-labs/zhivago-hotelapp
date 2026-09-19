import type { FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import sharp from 'sharp';
import { prisma } from '../lib/prisma.js';
import { saveUpload } from '../lib/storage.js';

// ─── REGISTER ────────────────────────────────────────────────────────────────

export async function register(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const schema = z
    .object({
      name: z.string().min(2, 'Nome muito curto'),
      email: z.string().email('E-mail inválido'),
      password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
      phone: z.string().optional(),
      accountType: z.enum(['INDIVIDUAL', 'AGENCY']).default('INDIVIDUAL'),
      document: z.string().optional(),
      creci: z.string().optional(),
      companyName: z.string().optional(),
    })
    .refine((data) => data.accountType !== 'AGENCY' || !!data.document, {
      message: 'Informe o CNPJ (ou CPF) da imobiliária.',
      path: ['document'],
    });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.errors });
  }

  const { name, email, password, phone, accountType, document, creci, companyName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return reply.status(409).send({ error: 'E-mail já cadastrado.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const isAgency = accountType === 'AGENCY';

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      phone: phone ?? null,
      accountType,
      document: isAgency ? document ?? null : null,
      creci: isAgency ? creci ?? null : null,
      companyName: isAgency ? companyName ?? null : null,
      verified: false,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      accountType: true,
      document: true,
      creci: true,
      companyName: true,
      verified: true,
      tokenVersion: true,
    },
  });

  // tokenVersion no payload garante que o middleware authenticate.ts pode
  // invalidar este token se o usuário trocar senha, for banido, etc.
  const token = await reply.jwtSign(
    { id: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion },
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
    { id: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion },
    { expiresIn: '7d' }
  );

  return reply.send({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      accountType: user.accountType,
      document: user.document,
      creci: user.creci,
      companyName: user.companyName,
      verified: user.verified,
    },
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
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      avatar: true,
      role: true,
      status: true,
      createdAt: true,
      accountType: true,
      document: true,
      creci: true,
      companyName: true,
      logoUrl: true,
      verified: true,
    },
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
    creci: z.string().max(20).optional(),
    companyName: z.string().max(120).optional(),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.errors });
  }

  const { creci, companyName, ...rest } = parsed.data;

  // exactOptionalPropertyTypes não deixa passar `{ name: undefined }` pro Prisma — filtra as
  // chaves não enviadas em vez de repassar o objeto do zod (que mantém `| undefined` explícito).
  const updateData: Record<string, string> = {};
  for (const [key, val] of Object.entries(rest)) {
    if (val !== undefined) updateData[key] = val;
  }

  // CRECI e nome fantasia só existem pra conta Imobiliária — a mesma regra usada no cadastro
  // (auth.controller.ts, `register`) evita que uma conta INDIVIDUAL grave um "nome fantasia" que
  // passaria a substituir o próprio nome na vitrine pública.
  const requester = await prisma.user.findUnique({ where: { id }, select: { accountType: true } });
  const isAgency = requester?.accountType === 'AGENCY';

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...updateData,
      ...(isAgency && creci !== undefined ? { creci } : {}),
      ...(isAgency && companyName !== undefined ? { companyName } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      avatar: true,
      role: true,
      creci: true,
      companyName: true,
    },
  });

  return reply.send(user);
}

// ─── UPDATE AVATAR ───────────────────────────────────────────────────────────

export async function updateAvatar(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.user as { id: string };

  const file = await request.file();
  if (!file) {
    return reply.status(400).send({ error: 'Nenhuma imagem enviada.' });
  }

  const buffer = await file.toBuffer();
  const filename = `avatar-${id}-${Date.now()}.webp`;

  let avatarUrl: string;
  try {
    const processed = await sharp(buffer).resize({ width: 400, height: 400, fit: 'cover' }).webp({ quality: 85 }).toBuffer();
    avatarUrl = await saveUpload(processed, filename, 'image/webp');
  } catch {
    return reply.status(400).send({ error: 'Não foi possível processar a imagem enviada.' });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { avatar: avatarUrl },
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

  // Incrementa tokenVersion para invalidar todas as outras sessões ativas
  await prisma.user.update({
    where: { id },
    data: { passwordHash, tokenVersion: { increment: 1 } },
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
    /**
     * EVITANDO ENUMERAÇÃO DE USUÁRIOS (SEGURANÇA):
     * Retornamos resposta idêntica independente de o e-mail existir ou não.
     */
    return reply.send({ message: 'Se o e-mail estiver cadastrado, as instruções foram enviadas.' });
  }

  // Gera token numérico de 6 dígitos
  const token = Math.floor(100000 + Math.random() * 900000).toString();

  // Hash do token antes de armazenar — se o banco for comprometido,
  // os tokens de reset não são utilizáveis diretamente.
  const tokenHash = await bcrypt.hash(token, 10);

  // Expiração reduzida para 15 minutos (era 1h) — janela menor de ataque
  const expiry = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken: tokenHash,
      resetTokenExpiry: expiry,
      resetAttempts: 0, // Reseta contador de tentativas para o novo token
    },
  });

  // Importação dinâmica do serviço de e-mail para evitar carregá-lo na inicialização
  const { sendResetPasswordEmail } = await import('../lib/mail.js');
  await sendResetPasswordEmail(user.email, token); // Envia token em texto plano por e-mail

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

  // Valida existência do token e da janela de expiração
  if (!user || !user.resetToken || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    return reply.status(400).send({ error: 'Token inválido ou expirado.' });
  }

  // Proteção contra brute-force: bloqueia após 5 tentativas erradas
  if (user.resetAttempts >= 5) {
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: null, resetTokenExpiry: null, resetAttempts: 0 },
    });
    return reply.status(429).send({ error: 'Muitas tentativas. Solicite um novo código.' });
  }

  // Compara o token informado com o hash armazenado no banco
  const tokenValid = await bcrypt.compare(token, user.resetToken);
  if (!tokenValid) {
    await prisma.user.update({
      where: { id: user.id },
      data: { resetAttempts: { increment: 1 } },
    });
    return reply.status(400).send({ error: 'Token inválido ou expirado.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  // Limpa token, reseta tentativas e incrementa tokenVersion para invalidar sessões anteriores
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetToken: null,
      resetTokenExpiry: null,
      resetAttempts: 0,
      tokenVersion: { increment: 1 },
    },
  });

  return reply.send({ message: 'Senha redefinida com sucesso. Você já pode fazer login.' });
}
