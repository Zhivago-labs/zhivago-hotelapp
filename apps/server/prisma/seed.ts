import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // SEGURANÇA: credenciais lidas de variáveis de ambiente, nunca hardcoded.
  const email = process.env['SEED_ADMIN_EMAIL'];
  const password = process.env['SEED_ADMIN_PASSWORD'];

  if (!email || !password) {
    console.error('❌ Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no .env antes de rodar o seed.');
    process.exit(1);
  }

  const name = 'Administrador';

  // 1. Cria ou recupera o usuário administrador
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    const passwordHash = await bcrypt.hash(password, 10);
    user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    console.log(`✅ Superusuário criado com sucesso!`);
  } else {
    // Garante que é ADMIN
    user = await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN', status: 'ACTIVE' },
    });
    console.log('✅ Usuário já existia — role verificado como ADMIN.');
  }
}

main()
  .catch(e => {
    console.error('❌ Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
