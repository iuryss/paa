import type { EmailMessage } from "./send";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(title: string, paragraphs: string[], link: string, buttonLabel: string, footer: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("");
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#334155">
<div style="max-width:520px;margin:0 auto;background:#f8fafc;border:2px solid #64748b;border-radius:20px;padding:32px">
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(title)}</h1>${body}
<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#bae6fd;color:#0c4a6e;border:2px solid #0369a1;border-radius:16px;padding:14px 24px;font-weight:bold;text-decoration:none">${escapeHtml(buttonLabel)}</a></p>
<p style="margin:0 0 8px;font-size:14px">Se o botão não funcionar, copie este endereço no navegador:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
<p style="margin:16px 0 0;font-size:14px;color:#475569">${escapeHtml(footer)}</p>
</div></body></html>`;
}

export function passwordResetEmail(args: { to: string; name: string; link: string; minutes: number }): EmailMessage {
  const subject = "Redefinir sua senha - Plataforma TEA";
  const intro = `Olá, ${args.name}. Recebemos um pedido para redefinir a sua senha.`;
  const validity = `O link vale por ${args.minutes} minutos e só pode ser usado uma vez.`;
  const footer = "Se você não pediu isso, ignore este e-mail: a sua senha continua a mesma.";
  return {
    to: args.to,
    subject,
    text: `${intro}\n\nCrie uma nova senha neste endereço:\n${args.link}\n\n${validity}\n\n${footer}\n`,
    html: layout("Redefinir senha", [intro, validity], args.link, "Criar nova senha", footer),
  };
}

export function invitationEmail(args: {
  to: string;
  name: string;
  inviterName: string;
  link: string;
  days: number;
}): EmailMessage {
  const subject = "Você foi convidado(a) para a Plataforma TEA";
  const intro = `Olá, ${args.name}. ${args.inviterName} convidou você para a Plataforma TEA.`;
  const validity = `Crie a sua senha pelo link abaixo. Ele vale por ${args.days} dias e só pode ser usado uma vez.`;
  const footer = "Se você não esperava este convite, pode ignorar este e-mail.";
  return {
    to: args.to,
    subject,
    text: `${intro}\n\n${validity}\n${args.link}\n\n${footer}\n`,
    html: layout("Você foi convidado(a)", [intro, validity], args.link, "Criar minha conta", footer),
  };
}

export function testEmail(args: { to: string; name: string }): EmailMessage {
  const subject = "Teste de e-mail - Plataforma TEA";
  const body = `Olá, ${args.name}. Se você está lendo isto, o envio de e-mails da Plataforma TEA está funcionando.`;
  return {
    to: args.to,
    subject,
    text: `${body}

Nenhuma ação é necessária.
`,
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#334155"><div style="max-width:520px;margin:0 auto;background:#f8fafc;border:2px solid #64748b;border-radius:20px;padding:32px"><h1 style="margin:0 0 16px;font-size:22px">Teste de e-mail</h1><p style="margin:0 0 16px">${escapeHtml(body)}</p><p style="margin:0;font-size:14px;color:#475569">Nenhuma ação é necessária.</p></div></body></html>`,
  };
}
