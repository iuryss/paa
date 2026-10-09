import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import {
  AccessibilityProvider,
  applyPreferences,
  useAccessibility,
} from "./accessibility-provider";

function Probe() {
  const { prefs, update, saveFailed } = useAccessibility();
  return (
    <div>
      <p data-testid="theme">{prefs.theme}</p>
      <p data-testid="failed">{String(saveFailed)}</p>
      <button onClick={() => update({ theme: "contraste", reducedMotion: false })}>mudar</button>
    </div>
  );
}

describe("AccessibilityProvider", () => {
  it("aplica as preferências iniciais no <html>", () => {
    render(
      <AccessibilityProvider initial={{ ...DEFAULT_PREFERENCES, theme: "foco", font: "leitura" }}>
        <Probe />
      </AccessibilityProvider>,
    );
    const html = document.documentElement;
    expect(html.dataset.theme).toBe("foco");
    expect(html.dataset.font).toBe("leitura");
    expect(html.dataset.motion).toBe("reduce");
    expect(html.dataset.mode).toBe("textual");
  });

  it("atualiza o <html> e persiste ao mudar", async () => {
    const persist = jest.fn().mockResolvedValue({ ok: true });
    render(
      <AccessibilityProvider initial={DEFAULT_PREFERENCES} persist={persist}>
        <Probe />
      </AccessibilityProvider>,
    );
    await userEvent.click(screen.getByText("mudar"));

    expect(screen.getByTestId("theme")).toHaveTextContent("contraste");
    expect(document.documentElement.dataset.theme).toBe("contraste");
    expect(document.documentElement.dataset.motion).toBe("auto");
    expect(persist).toHaveBeenCalledWith({
      ...DEFAULT_PREFERENCES,
      theme: "contraste",
      reducedMotion: false,
    });
    expect(screen.getByTestId("failed")).toHaveTextContent("false");
  });

  it("mantém a mudança na tela e sinaliza quando o servidor recusa ou falha", async () => {
    const persist = jest.fn().mockResolvedValue({ ok: false });
    render(
      <AccessibilityProvider initial={DEFAULT_PREFERENCES} persist={persist}>
        <Probe />
      </AccessibilityProvider>,
    );
    await userEvent.click(screen.getByText("mudar"));
    expect(screen.getByTestId("theme")).toHaveTextContent("contraste");
    expect(screen.getByTestId("failed")).toHaveTextContent("true");
  });

  it("sinaliza quando a chamada ao servidor lança erro", async () => {
    const persist = jest.fn().mockRejectedValue(new Error("rede"));
    render(
      <AccessibilityProvider initial={DEFAULT_PREFERENCES} persist={persist}>
        <Probe />
      </AccessibilityProvider>,
    );
    await userEvent.click(screen.getByText("mudar"));
    await waitFor(() => expect(screen.getByTestId("failed")).toHaveTextContent("true"));
  });

  it("o hook falha com mensagem clara fora do provider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/AccessibilityProvider/);
    spy.mockRestore();
  });
});

describe("applyPreferences", () => {
  it("grava os quatro atributos de dados", () => {
    const el = document.createElement("html");
    applyPreferences(el, { ...DEFAULT_PREFERENCES, contentMode: "pictografico", reducedMotion: false });
    expect(el.dataset).toMatchObject({
      theme: "calmo",
      mode: "pictografico",
      font: "sans",
      motion: "auto",
    });
  });
});
