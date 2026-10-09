import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { invitationEmail } from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import { hashSecret } from "@/lib/password";
import { isAdultRole } from "@/lib/rbac";
import type { InviteInput } from "@/lib/validation/accounts";
import { generateToken, hashToken, TOKEN_REGEX } from "./tokens";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CreateInvitationResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; code: "email_in_use" };

/** Gera um convite de uso único. O token em texto puro só existe nesta resposta. */
export async function createInvitation(
  inviterId: string,
  input: InviteInput,
  now: Date = new Date(),
): Promise<CreateInvitationResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) return { ok: false, code: "email_in_use" };

  const { token, hash } = generateToken();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

  // Um convite pendente por e-mail: o novo invalida os anteriores.
  await prisma.invitation.deleteMany({ where: { email: input.email, usedAt: null } });
  await prisma.invitation.create({
    data: {
      tokenHash: hash,
      email: input.email,
      role: input.role,
      displayName: input.displayName,
      invitedById: inviterId,
      expiresAt,
    },
  });
  await prisma.auditLog.create({ data: { actorId: inviterId, action: "invitation.create" } });
  return { ok: true, token, expiresAt };
}

/** Envia o convite por e-mail. Falha de envio não derruba o convite: o link continua sendo mostrado. */
export async function emailInvitation(args: {
  inviterId: string;
  to: string;
  name: string;
  link: string;
}): Promise<boolean> {
  try {
    const inviter = await prisma.user.findUnique({
      where: { id: args.inviterId },
      select: { displayName: true },
    });
    await sendEmail(
      invitationEmail({
        to: args.to,
        name: args.name,
        inviterName: inviter?.displayName ?? "Um colega",
        link: args.link,
        days: INVITATION_TTL_MS / (24 * 60 * 60 * 1000),
      }),
    );
    return true;
  } catch {
    logger.error("invitation.email_failed");
    return false;
  }
}

/** Dados mostrados na página do convite. Qualquer problema (inexistente, usado, vencido) vira null. */
export async function getInvitationPreview(
  token: string,
  now: Date = new Date(),
): Promise<{ displayName: string; role: Role } | null> {
  if (!TOKEN_REGEX.test(token)) return null;
  const row = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { displayName: true, role: true, expiresAt: true, usedAt: true },
  });
  if (!row || row.usedAt || row.expiresAt <= now || !isAdultRole(row.role)) return null;
  return { displayName: row.displayName, role: row.role };
}

export type AcceptInvitationResult = { ok: true } | { ok: false; code: "invalid" };

/**
 * Cria a conta a partir do convite. O convite é "consumido" na mesma transação que cria o usuário:
 * dois cliques simultâneos no mesmo link não criam duas contas.
 */
export async function acceptInvitation(
  token: string,
  password: string,
  now: Date = new Date(),
): Promise<AcceptInvitationResult> {
  if (!TOKEN_REGEX.test(token)) return { ok: false, code: "invalid" };
  const passwordHash = await hashSecret(password); // custoso: fora da transação

  return prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invitation || invitation.usedAt || invitation.expiresAt <= now || !isAdultRole(invitation.role)) {
      return { ok: false, code: "invalid" } as const;
    }

    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return { ok: false, code: "invalid" } as const;

    const taken = await tx.user.findUnique({ where: { email: invitation.email }, select: { id: true } });
    if (taken) return { ok: false, code: "invalid" } as const;

    const user = await tx.user.create({
      data: {
        role: invitation.role,
        email: invitation.email,
        displayName: invitation.displayName,
        passwordHash,
        sensoryProfile: { create: {} },
      },
      select: { id: true },
    });
    await tx.auditLog.create({ data: { actorId: user.id, action: "invitation.accept" } });
    return { ok: true } as const;
  });
}
