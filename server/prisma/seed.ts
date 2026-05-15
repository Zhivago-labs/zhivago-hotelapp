import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'fabiodemelo123s@outlook.com';
  const password = 'eusoulost11';
  const name = 'Fábio de Melo';

  // Verifica se já existe
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Se já existe, garante que é ADMIN
    await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN', status: 'ACTIVE' },
    });
    console.log('✅ Usuário já existia — role atualizado para ADMIN.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log(`✅ Superusuário criado com sucesso!`);
  console.log(`   ID:    ${user.id}`);
  console.log(`   Nome:  ${user.name}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Role:  ${user.role}`);
}

main()
  .catch(e => {
    console.error('❌ Erro ao criar superusuário:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
