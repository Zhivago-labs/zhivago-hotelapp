import nodemailer from 'nodemailer';
import { WEB_URL } from './env.js';

// Instância singleton do transportador Nodemailer para reaproveitar conexões TCP
let transporter: nodemailer.Transporter | null = null;

async function getTransporter() {
  if (transporter) return transporter;

  if (process.env['SMTP_HOST'] && process.env['SMTP_USER'] && process.env['SMTP_PASS']) {
    // Configuração de SMTP de Produção/Homologação
    transporter = nodemailer.createTransport({
      host: process.env['SMTP_HOST'],
      port: Number(process.env['SMTP_PORT']) || 587,
      auth: {
        user: process.env['SMTP_USER'],
        pass: process.env['SMTP_PASS'],
      },
    });
  } else {
    // Modo de Desenvolvimento Local: Cria conta fictícia no Ethereal.email instantaneamente
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false, // true para porta 465 (SSL)
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('📧 Ethereal Email gerado para testes locais:', testAccount.user);
  }

  return transporter;
}

/**
 * Envia o e-mail com código numérico (token) de 6 dígitos para o usuário.
 */
export async function sendResetPasswordEmail(to: string, token: string) {
  const t = await getTransporter();
  
  const info = await t.sendMail({
    from: `"Equipe Zhivago" <${process.env['SMTP_USER'] || 'no-reply@zhivago.com'}>`,
    to,
    subject: 'Recuperação de Senha - Zhivago',
    text: `Você solicitou a recuperação de senha. Seu código é: ${token}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Recuperação de Senha</h2>
        <p>Você solicitou a redefinição da sua senha no Zhivago.</p>
        <p>Utilize o código abaixo no aplicativo para criar uma nova senha:</p>
        <h1 style="color: #ff385c; letter-spacing: 5px;">${token}</h1>
        <p><small>Este código é válido por 1 hora.</small></p>
        <br/>
        <p>Se você não solicitou isso, ignore este e-mail.</p>
      </div>
    `,
  });

  console.log('✅ E-mail de recuperação enviado!');
  
  // Exibe um link público no console para que o desenvolvedor possa visualizar o layout do 
  // e-mail exatamente como o usuário veria na inbox, sem precisar de fato receber o e-mail real.
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) {
    console.log('🔗 Link para ver o E-mail (DEV):', preview);
  }
}

const ORG_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  BROKER: 'Corretor',
};

/**
 * Convite para ingressar numa organização (CRM B2B) — mesmo padrão de transporte do e-mail de
 * reset de senha, ver docs/crm-b2b-organizacoes-leads.md.
 */
export async function sendOrganizationInviteEmail(
  to: string,
  organizationName: string,
  role: string,
  token: string
) {
  const t = await getTransporter();
  const roleLabel = ORG_ROLE_LABELS[role] ?? role;
  const acceptUrl = `${WEB_URL}/equipe/convite/${token}`;

  const info = await t.sendMail({
    from: `"Equipe Zhivago" <${process.env['SMTP_USER'] || 'no-reply@zhivago.com'}>`,
    to,
    subject: `Convite para ${organizationName} no Zhivago`,
    text: `Você foi convidado para ${organizationName} como ${roleLabel}. Acesse ${acceptUrl} para aceitar.`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Convite para ${organizationName}</h2>
        <p>Você foi convidado para fazer parte de <strong>${organizationName}</strong> no Zhivago como
        <strong>${roleLabel}</strong>.</p>
        <p><a href="${acceptUrl}" style="color: #ff385c;">Aceitar convite</a></p>
        <p><small>Este convite é válido por 7 dias. Se você não esperava este e-mail, ignore-o.</small></p>
      </div>
    `,
  });

  console.log('✅ E-mail de convite de organização enviado!');
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) {
    console.log('🔗 Link para ver o E-mail (DEV):', preview);
  }
}
