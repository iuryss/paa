import { NextResponse } from "next/server";
import { addAdultToStudent, emailStudentShared, teamLimiter } from "@/lib/accounts/student-team";
import { guard } from "@/lib/auth/guard";
import { ADULT_ROLES } from "@/lib/rbac";
import { firstIssue, addAdultSchema } from "@/lib/validation/accounts";
import { idSchema } from "@/lib/validation/activities";

const REFUSED = {
  student_inactive: { status: 409, message: "Com o consentimento revogado, não é possível adicionar ninguém." },
  unknown_email: {
    status: 422,
    message: "Não encontramos um profissional com esse e-mail. Convide a pessoa em Minha conta e adicione depois.",
  },
  already_linked: { status: 409, message: "Essa pessoa já acompanha este aluno." },
} as const;

/** Adiciona um colega ao acompanhamento do aluno. Sem vínculo, o aluno "não existe". */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await guard(ADULT_ROLES);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (await teamLimiter.isBlocked(access.user.id)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Muitas tentativas seguidas. Tente daqui a pouco." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = addAdultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", message: firstIssue(parsed.error) }, { status: 422 });
  }

  await teamLimiter.fail(access.user.id);
  const result = await addAdultToStudent(access.user.id, id.data, parsed.data.email);
  if (!result.ok) {
    if (result.code === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    const { status, message } = REFUSED[result.code];
    return NextResponse.json({ error: result.code, message }, { status });
  }

  // AUTH_URL = endereço público (atrás de proxy o origin da requisição seria o interno).
  const origin = (process.env.AUTH_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  const emailSent = await emailStudentShared({
    actorId: access.user.id,
    to: result.adult.email,
    name: result.adult.displayName,
    link: `${origin}/professor`,
  });

  return NextResponse.json(
    { adult: { id: result.adult.id, displayName: result.adult.displayName }, emailSent },
    { status: 201 },
  );
}
