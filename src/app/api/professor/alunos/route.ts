import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guard } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { hashSecret } from "@/lib/password";
import { ADULT_ROLES } from "@/lib/rbac";
import { generatePin, generateStudentCode } from "@/lib/student-credentials";
import { createStudentSchema } from "@/lib/validation/auth";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const access = await guard(ADULT_ROLES);
  if (!access.ok) {
    return NextResponse.json({ error: access.code }, { status: access.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createStudentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const pin = generatePin();
  const pinHash = await hashSecret(pin);

  // Código aleatório pode colidir (raro): tenta algumas vezes.
  for (let attempt = 0; attempt < 3; attempt++) {
    const studentCode = generateStudentCode();
    try {
      const student = await prisma.user.create({
        data: {
          role: "STUDENT",
          displayName: parsed.data.displayName,
          studentCode,
          pinHash,
          sensoryProfile: { create: {} },
          guidances: { create: { adultId: access.user.id } },
          consents: {
            create: { grantedBy: access.user.id, termsVersion: parsed.data.termsVersion },
          },
        },
        select: { id: true, displayName: true },
      });
      await prisma.auditLog.create({
        data: { actorId: access.user.id, action: "student.create", targetId: student.id },
      });
      // PIN e código só são exibidos agora; no banco fica apenas o hash do PIN.
      return NextResponse.json(
        { id: student.id, displayName: student.displayName, studentCode, pin },
        { status: 201, headers: NO_STORE },
      );
    } catch (error) {
      const collision =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!collision) {
        logger.error("student.create_failed");
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
