import { forgotPasswordSchema } from "@/lib/validation/accounts";
import { pickFields } from "./form-data";

function form(entries: Record<string, string | Blob>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("pickFields", () => {
  it("devolve só os campos pedidos", () => {
    expect(pickFields(form({ email: "a@b.com", outro: "x" }), ["email"])).toEqual({ email: "a@b.com" });
  });

  it("ignora os campos internos que o React acrescenta quando o formulário é enviado antes do JavaScript carregar", () => {
    const data = form({
      email: "ana@escola.com",
      $ACTION_REF_1: "",
      "$ACTION_1:0": '{"id":"abc","bound":"$@1"}',
      "$ACTION_1:1": "[]",
      $ACTION_KEY: "k123",
    });
    const picked = pickFields(data, ["email"]);
    expect(picked).toEqual({ email: "ana@escola.com" });
    // Regressão: com o formulário cru, o esquema ESTRITO recusava e a pessoa via "Unrecognized key(s)...".
    expect(forgotPasswordSchema.safeParse(Object.fromEntries(data)).success).toBe(false);
    expect(forgotPasswordSchema.safeParse(picked).success).toBe(true);
  });

  it("campo ausente ou arquivo vira undefined (nunca lança)", () => {
    const data = form({ doc: new Blob(["x"]) });
    expect(pickFields(data, ["email", "doc"])).toEqual({ email: undefined, doc: undefined });
  });
});
