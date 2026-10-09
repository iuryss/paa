import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { legalContext, privacySections } from "@/content/legal";
import { TERMS_VERSION } from "@/lib/terms";
import { LegalDocument } from "./legal-document";

const render_ = (env: Record<string, string>) => {
  const context = legalContext(env);
  return render(
    <LegalDocument title="Política de privacidade" subtitle="Como cuidamos" context={context} sections={privacySections(context)} />,
  );
};

describe("LegalDocument", () => {
  it("mostra título, versão e todas as seções com títulos hierárquicos", () => {
    render_({});
    expect(screen.getByRole("heading", { level: 1, name: "Política de privacidade" })).toBeInTheDocument();
    expect(screen.getByText(`Versão ${TERMS_VERSION}`)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThanOrEqual(10);
    expect(screen.getByRole("heading", { level: 2, name: "Seus direitos" })).toBeInTheDocument();
  });

  it("enquanto o jurídico não revisou, avisa que é versão de trabalho", () => {
    render_({});
    expect(screen.getByRole("status")).toHaveTextContent("Versão de trabalho");
    expect(screen.getByRole("status")).toHaveTextContent("ainda será revisado pelo jurídico");
  });

  it("depois de revisado (LEGAL_REVIEWED=true) o aviso some", () => {
    render_({ LEGAL_REVIEWED: "true" });
    expect(screen.queryByText("Versão de trabalho")).not.toBeInTheDocument();
  });

  it("passa no axe", async () => {
    const { container } = render_({});
    expect(await axe(container)).toHaveNoViolations();
  });
});
