import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import type { SystemCheck } from "@/lib/system-checks";
import { SystemChecksCard } from "./system-checks-card";
import { TestEmailButton } from "./test-email-button";

const checks: SystemCheck[] = [
  { id: "db", label: "Banco de dados", status: "ok", detail: "Conectado." },
  { id: "rate-limit", label: "Limite de tentativas de login", status: "warn", detail: "Em memória. Configure o Redis." },
];

describe("SystemChecksCard", () => {
  it("mostra cada verificação com palavra + ícone (cor nunca sozinha)", () => {
    const { container } = render(<SystemChecksCard checks={checks} />);
    expect(screen.getByText(/Banco de dados:/)).toHaveTextContent("ok");
    expect(screen.getByText(/Limite de tentativas de login:/)).toHaveTextContent("atenção");
    expect(container.querySelectorAll("li svg")).toHaveLength(2);
    expect(screen.getByText("1 ponto precisa de atenção. Nenhum segredo é exibido aqui.", { exact: false })).toBeInTheDocument();
  });

  it("tudo ok mostra 'Tudo certo.'", () => {
    render(<SystemChecksCard checks={[checks[0]!]} />);
    expect(screen.getByText(/Tudo certo\./)).toBeInTheDocument();
  });

  it("passa no axe", async () => {
    const { container } = render(<SystemChecksCard checks={checks} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("TestEmailButton", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  const reply = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => body });

  it("envio real: confirma o destino mascarado e lembra do spam", async () => {
    reply(200, { ok: true, to: "a***@escola.com", provider: "gmail" });
    render(<TestEmailButton />);
    await userEvent.click(screen.getByRole("button", { name: "Enviar e-mail de teste para mim" }));
    expect(await screen.findByText("Enviado!")).toBeInTheDocument();
    expect(screen.getByText(/a\*\*\*@escola\.com/)).toBeInTheDocument();
    expect(screen.getByText(/spam/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/conta/email-teste", { method: "POST" });
  });

  it("modo terminal: avisa que nada foi enviado de verdade", async () => {
    reply(200, { ok: true, provider: "console", to: "a***@escola.com" });
    render(<TestEmailButton />);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("Simulado")).toBeInTheDocument();
    expect(screen.getByText(/Nada foi enviado de verdade/)).toBeInTheDocument();
  });

  it("falha do provedor mostra a dica de correção", async () => {
    reply(502, { ok: false, code: "forbidden", hint: "Confirme que o domínio do EMAIL_FROM está VERIFICADO." });
    render(<TestEmailButton />);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText(/domínio do EMAIL_FROM está VERIFICADO/)).toBeInTheDocument();
  });

  it("limite de 3 testes por hora", async () => {
    reply(429, { ok: false, code: "rate_limited" });
    render(<TestEmailButton />);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText(/3 testes na última hora/)).toBeInTheDocument();
  });

  it("erro de rede tem mensagem gentil", async () => {
    fetchMock.mockRejectedValue(new Error("rede"));
    render(<TestEmailButton />);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("Não foi possível enviar agora.")).toBeInTheDocument();
  });

  it("passa no axe", async () => {
    const { container } = render(<TestEmailButton />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
