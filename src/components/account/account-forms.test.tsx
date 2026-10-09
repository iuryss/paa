import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ResetPinCard } from "@/components/dashboard/reset-pin-card";
import { AcceptInvitationForm } from "./accept-invitation-form";
import { ChangePasswordForm } from "./change-password-form";
import { InviteForm } from "./invite-form";

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const reply = (status: number, body: unknown = {}) =>
  fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => body });

describe("ResetPinCard", () => {
  const setup = () => render(<ResetPinCard studentId="stu12345" displayName="Sol" />);

  it("pede confirmação antes de gerar e permite cancelar sem chamar a API", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Gerar novo PIN" }));
    expect(screen.getByText("Gerar um novo PIN para Sol?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Gerar novo PIN" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gera o PIN e mostra código e PIN uma vez", async () => {
    reply(200, { pin: "4821", studentCode: "DEMO-2345", displayName: "Sol" });
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Gerar novo PIN" }));
    await user.click(screen.getByRole("button", { name: "Sim, gerar" }));

    expect(await screen.findByText("Novo PIN gerado!")).toBeInTheDocument();
    expect(screen.getByText("4821")).toBeInTheDocument();
    expect(screen.getByText("DEMO-2345")).toBeInTheDocument();
    expect(screen.getByText(/o PIN não aparece de novo/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/professor/alunos/stu12345/pin", { method: "POST" });
    // volta ao estado inicial, sem deixar o botão de confirmação aberto
    expect(screen.getByRole("button", { name: "Gerar novo PIN" })).toBeInTheDocument();
  });

  it("mostra mensagem gentil quando falha", async () => {
    reply(404);
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Gerar novo PIN" }));
    await user.click(screen.getByRole("button", { name: "Sim, gerar" }));
    expect(await screen.findByText(/Não foi possível gerar o PIN agora/)).toBeInTheDocument();
  });

  it("passa no axe", async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("ChangePasswordForm", () => {
  async function fill(current: string, next: string, confirm = next) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Senha atual"), current);
    await user.type(screen.getByLabelText("Nova senha"), next);
    await user.type(screen.getByLabelText("Repita a nova senha"), confirm);
    await user.click(screen.getByRole("button", { name: "Salvar" }));
  }

  it("troca a senha e limpa o formulário", async () => {
    reply(200, { ok: true });
    render(<ChangePasswordForm />);
    await fill("senha-atual-123", "cavalo-azul-72");

    expect(await screen.findByText("Senha alterada.")).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      currentPassword: "senha-atual-123",
      newPassword: "cavalo-azul-72",
    });
    expect(screen.getByLabelText("Senha atual")).toHaveValue("");
  });

  it("não chama a API se as senhas novas forem diferentes", async () => {
    render(<ChangePasswordForm />);
    await fill("senha-atual-123", "cavalo-azul-72", "cavalo-azul-73");
    expect(await screen.findByText("As senhas novas não são iguais.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [400, "A senha atual não confere."],
    [429, "Muitas tentativas. Aguarde alguns minutos e tente de novo."],
    [500, "Não foi possível alterar agora."],
  ])("trata resposta %i", async (status, text) => {
    reply(status);
    render(<ChangePasswordForm />);
    await fill("senha-atual-123", "cavalo-azul-72");
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("mostra a mensagem de validação vinda da API (422)", async () => {
    reply(422, { message: "Essa senha é muito comum. Escolha outra." });
    render(<ChangePasswordForm />);
    await fill("senha-atual-123", "cavalo-azul-72");
    expect(await screen.findByText("Essa senha é muito comum. Escolha outra.")).toBeInTheDocument();
  });

  it("campos de senha usam autocomplete correto (gerenciador de senhas) e passam no axe", async () => {
    const { container } = render(<ChangePasswordForm />);
    expect(screen.getByLabelText("Senha atual")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByLabelText("Nova senha")).toHaveAttribute("autocomplete", "new-password");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("InviteForm", () => {
  async function submit(name = "Ana Souza", email = "ana@escola.com") {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Nome"), name);
    await user.type(screen.getByLabelText("E-mail"), email);
    await user.selectOptions(screen.getByLabelText("Função"), "THERAPIST");
    await user.click(screen.getByRole("button", { name: "Criar convite" }));
  }

  it("cria o convite e mostra o link para copiar", async () => {
    reply(201, { link: "https://app.exemplo.com/convite/abc", expiresAt: "2026-10-15T00:00:00Z" });
    render(<InviteForm />);
    await submit();

    expect(await screen.findByLabelText("Link do convite")).toHaveValue("https://app.exemplo.com/convite/abc");
    expect(screen.getByText(/não aparece de novo/)).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      email: "ana@escola.com",
      displayName: "Ana Souza",
      role: "THERAPIST",
    });
  });

  it("quando o e-mail foi enviado, avisa e mantém o link como cópia", async () => {
    reply(201, { link: "https://app.exemplo.com/convite/abc", emailSent: true });
    render(<InviteForm />);
    await submit();
    expect(await screen.findByText("Convite enviado!")).toBeInTheDocument();
    expect(screen.getByText(/Enviamos um e-mail para ana@escola.com/)).toBeInTheDocument();
    expect(screen.getByLabelText("Link do convite")).toHaveValue("https://app.exemplo.com/convite/abc");
  });

  it("quando o e-mail falhou, avisa que é preciso enviar o link manualmente", async () => {
    reply(201, { link: "https://app.exemplo.com/convite/abc", emailSent: false });
    render(<InviteForm />);
    await submit();
    expect(await screen.findByText("Convite criado!")).toBeInTheDocument();
    expect(screen.getByText(/Não conseguimos enviar o e-mail/)).toBeInTheDocument();
  });

  it("copia o link para a área de transferência", async () => {
    reply(201, { link: "https://app.exemplo.com/convite/abc" });
    const user = userEvent.setup();
    render(<InviteForm />); // userEvent.setup() instala um clipboard de teste
    await user.type(screen.getByLabelText("Nome"), "Ana");
    await user.type(screen.getByLabelText("E-mail"), "ana@escola.com");
    await user.click(screen.getByRole("button", { name: "Criar convite" }));
    await screen.findByLabelText("Link do convite");

    await user.click(screen.getByRole("button", { name: "Copiar" }));
    expect(await screen.findByRole("button", { name: "Copiado" })).toBeInTheDocument();
    await expect(navigator.clipboard.readText()).resolves.toBe("https://app.exemplo.com/convite/abc");
  });

  it("avisa quando o e-mail já tem conta", async () => {
    reply(409);
    render(<InviteForm />);
    await submit();
    expect(await screen.findByText("Já existe uma conta com este e-mail.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Link do convite")).not.toBeInTheDocument();
  });

  it("só oferece professor e terapeuta (nunca aluno)", () => {
    render(<InviteForm />);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Professor(a)", "Terapeuta"]);
  });

  it("passa no axe", async () => {
    const { container } = render(<InviteForm />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("AcceptInvitationForm", () => {
  it("envia as senhas e mostra o erro devolvido pela ação", async () => {
    const action = jest.fn().mockResolvedValue({ error: "As senhas não são iguais." });
    render(<AcceptInvitationForm action={action} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Crie uma senha"), "cavalo-azul-72");
    await user.type(screen.getByLabelText("Repita a senha"), "cavalo-azul-73");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("As senhas não são iguais.")).toBeInTheDocument();
    const formData = action.mock.calls[0]?.[1] as FormData;
    expect(formData.get("password")).toBe("cavalo-azul-72");
    expect(formData.get("confirm")).toBe("cavalo-azul-73");
  });

  it("usa autocomplete new-password e passa no axe", async () => {
    const { container } = render(<AcceptInvitationForm action={jest.fn()} />);
    expect(screen.getByLabelText("Crie uma senha")).toHaveAttribute("autocomplete", "new-password");
    await waitFor(async () => expect(await axe(container)).toHaveNoViolations());
  });
});
