import { generatePin, generateStudentCode } from "./student-credentials";
import { STUDENT_CODE_REGEX } from "./validation/auth";

describe("student-credentials", () => {
  it("gera códigos no formato aceito pelo login, sem caracteres ambíguos", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateStudentCode();
      expect(code).toMatch(STUDENT_CODE_REGEX);
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it("gera PIN de 4 dígitos (com zeros à esquerda)", () => {
    for (let i = 0; i < 200; i++) expect(generatePin()).toMatch(/^\d{4}$/);
  });
});
