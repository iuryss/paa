import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { AccessibilityProvider } from "./accessibility-provider";
import { PreferencesPanel } from "./preferences-panel";

function setup(persist = jest.fn().mockResolvedValue({ ok: true })) {
  const utils = render(
    <AccessibilityProvider initial={DEFAULT_PREFERENCES} persist={persist}>
      <PreferencesPanel />
    </AccessibilityProvider>,
  );
  return { persist, ...utils };
}

describe("PreferencesPanel", () => {
  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("agrupa as opções em fieldsets com legenda", () => {
    setup();
    expect(screen.getByRole("group", { name: "Cores" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Como mostrar" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Letra" })).toBeInTheDocument();
  });

  it("marca o tema atual", () => {
    setup();
    expect(screen.getByRole("radio", { name: /Baixo Estímulo/ })).toBeChecked();
  });

  it("troca o tema só com o teclado e persiste", async () => {
    const { persist } = setup();
    const user = userEvent.setup();
    await user.tab(); // entra no grupo de cores (rádio selecionado)
    expect(screen.getByRole("radio", { name: /Baixo Estímulo/ })).toHaveFocus();
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("radio", { name: /Foco Alto/ })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe("foco");
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ theme: "foco" }));
  });

  it("alterna modo pictográfico e movimento", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /PECS/ }));
    expect(document.documentElement.dataset.mode).toBe("pictografico");

    const motion = screen.getByRole("checkbox", { name: /Sem movimento/ });
    expect(motion).toBeChecked();
    await user.click(motion);
    expect(document.documentElement.dataset.motion).toBe("auto");
  });

  it("avisa com gentileza quando não consegue salvar", async () => {
    setup(jest.fn().mockResolvedValue({ ok: false }));
    await userEvent.click(screen.getByRole("radio", { name: /Foco Alto/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Quase!");
  });
});
