import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'fabiodemelo123s@outlook.com';
  const password = 'eusoulost11';
  const name = 'Fábio de Melo';

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

  // 2. Limpa todas as listings
  await prisma.listing.deleteMany();
  console.log('🧹 Todas as listings foram removidas do banco de dados.');
}

main()
  .catch(e => {
    console.error('❌ Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
