import nodemailer from 'nodemailer';

// Cria um transportador. Para testes, vamos usar um serviço mock (Ethereal) ou logs locais se não houver SMTP configurado.
// Em produção, você deve usar SendGrid, AWS SES, ou Gmail com SMTP.

let transporter: nodemailer.Transporter | null = null;

async function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Modo de Desenvolvimento: Ethereal Email (gera conta na hora)
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false, // true para port 465
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('📧 Ethereal Email gerado para testes locais:', testAccount.user);
  }

  return transporter;
}

export async function sendResetPasswordEmail(to: string, token: string) {
  const t = await getTransporter();
  
  const info = await t.sendMail({
    from: `"Equipe Zhivago" <${process.env.SMTP_USER || 'no-reply@zhivago.com'}>`,
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
  // Ethereal url para visualizar o e-mail no navegador (só em dev)
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) {
    console.log('🔗 Link para ver o E-mail (DEV):', preview);
  }
}
