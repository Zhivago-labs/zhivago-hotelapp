import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export async function logAdminAction(data: {
  adminId: string;
  action: string;
  targetType: string;
  targetId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.adminActionLog.create({
    data: {
      adminId: data.adminId,
      action: data.action,
      targetType: data.targetType,
      targetId: data.targetId ?? null,
      reason: data.reason ?? null,
      ...(data.metadata !== undefined ? { metadata: data.metadata as Prisma.InputJsonValue } : {}),
    },
  });
}
