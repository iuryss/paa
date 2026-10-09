import { TERMS_VERSION } from "@/lib/terms";
import { legalContext, privacySections, termsSections } from "./legal";

const flat = (sections: ReturnType<typeof privacySections>) =>
  sections.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.items ?? [])]).join("\n");

describe("legalContext", () => {
  it("sem configuração usa textos neutros e marca como NÃO revisado", () => {
    expect(legalContext({})).toEqual({
      controller: "a escola responsável por esta plataforma",
      contact: "pela secretaria da escola",
      reviewed: false,
      version: TERMS_VERSION,
    });
  });

  it("usa o controlador e o e-mail do encarregado da configuração", () => {
    const c = legalContext({
      LEGAL_CONTROLLER_NAME: " Escola Girassol ",
      LEGAL_DPO_EMAIL: "privacidade@girassol.edu.br",
      LEGAL_REVIEWED: "true",
    });
    expect(c).toMatchObject({ controller: "Escola Girassol", contact: "pelo e-mail privacidade@girassol.edu.br", reviewed: true });
  });

  it("só considera revisado com o valor exato 'true'", () => {
    expect(legalContext({ LEGAL_REVIEWED: "sim" }).reviewed).toBe(false);
    expect(legalContext({ LEGAL_REVIEWED: "" }).reviewed).toBe(false);
  });
});

describe("política de privacidade", () => {
  const text = flat(privacySections(legalContext({ LEGAL_CONTROLLER_NAME: "Escola Girassol", LEGAL_DPO_EMAIL: "dpo@girassol.edu.br" })));

  it("cobre o que a LGPD exige informar", () => {
    for (const heading of [
      "Quem somos",
      "Quais dados coletamos",
      "Para que usamos os dados",
      "Base legal",
      "Quem pode ver os dados",
      "Por quanto tempo guardamos",
      "Seus direitos",
      "Como exercer seus direitos",
    ]) {
      expect(text).toContain(heading);
    }
  });

  it("descreve fielmente o que o sistema faz (dados mínimos, sem rastreamento)", () => {
    expect(text).toMatch(/apelido/);
    expect(text).toMatch(/não coletamos nome completo, e-mail, data de nascimento/i);
    expect(text).toMatch(/nenhum serviço de estatísticas, publicidade ou rastreamento/i);
    expect(text).toMatch(/PIN .* criptografada/);
    expect(text).toMatch(/um único cookie/i);
    expect(text).toMatch(/art\. 14/);
  });

  it("explica revogação e exclusão e diz como falar com o encarregado", () => {
    expect(text).toMatch(/revogar o consentimento, sem qualquer prejuízo/i);
    expect(text).toMatch(/exclusão definitiva é feita a pedido/i);
    expect(text).toContain("Escola Girassol");
    expect(text).toContain("dpo@girassol.edu.br");
  });

  it("cita a versão vigente do termo", () => {
    expect(text).toContain(`versão ${TERMS_VERSION}`);
  });
});

describe("termo de consentimento", () => {
  const text = flat(termsSections(legalContext({ LEGAL_DPO_EMAIL: "dpo@girassol.edu.br" })));

  it("lista os dados, a finalidade, quem vê, a duração e o direito de revogar sem prejuízo", () => {
    expect(text).toMatch(/Quais dados da criança/);
    expect(text).toMatch(/não serão usados para publicidade nem vendidos/i);
    expect(text).toMatch(/Apenas os professores e terapeutas vinculados/);
    expect(text).toMatch(/revogar este consentimento quando quiser, sem prejuízo ao atendimento/i);
    expect(text).toContain("dpo@girassol.edu.br");
  });

  it("termina com a declaração do responsável e a versão", () => {
    expect(text).toMatch(/Declaro que sou o responsável legal/);
    expect(text).toContain(`Versão do termo: ${TERMS_VERSION}`);
  });
});
