"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { pickFields } from "@/lib/form-data";
import { adultLoginSchema, studentLoginSchema } from "@/lib/validation/auth";

export interface LoginState {
  error: string | null;
}

const ADULT_ERROR = "Não foi possível entrar. Confira o e-mail e a senha e tente de novo.";
const STUDENT_ERROR = "Não deu certo. Confira o código e o PIN e tente de novo.";

export async function loginAdultAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = adultLoginSchema.safeParse(pickFields(formData, ["email", "password"]));
  if (!parsed.success) return { error: ADULT_ERROR };
  try {
    await signIn("adult", { ...parsed.data, redirectTo: "/professor" });
    return { error: null };
  } catch (error) {
    if (error instanceof AuthError) return { error: ADULT_ERROR };
    throw error; // redirecionamento do Next precisa propagar
  }
}

export async function loginStudentAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = studentLoginSchema.safeParse(pickFields(formData, ["studentCode", "pin"]));
  if (!parsed.success) return { error: STUDENT_ERROR };
  try {
    await signIn("student", { ...parsed.data, redirectTo: "/aluno" });
    return { error: null };
  } catch (error) {
    if (error instanceof AuthError) return { error: STUDENT_ERROR };
    throw error;
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/entrar" });
}
