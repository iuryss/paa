import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { StudentPrivacyCard } from "./student-privacy-card";

const push = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const fetchMock = jest.fn();
beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
const reply = (status: number) => fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => ({}) });

const setup = (over: Partial<React.ComponentProps<typeof StudentPrivacyCard>> = {}) =>
  render(<StudentPrivacyCard studentId="stu12345" displayName="Sol" active otherAdults={0} {...over} />);

describe("exportar", () => {
  it("é um link de download para a rota de exportação (sem carregar o JSON na tela)", () => {
    setup();
    const link = screen.getByRole("link", { name: "Baixar cópia dos dados" });
    expect(link).toHaveAttribute("href", "/api/professor/alunos/stu12345/exportar");
    expect(link).toHaveAttribute("download");
  });
});

describe("revogar consentimento", () => {
  it("explica o efeito e só age depois de confirmar", async () => {
    reply(200);
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Revogar consentimento" }));
    expect(screen.getByText(/Sol perde o acesso agora e some dos painéis/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Sim, revogar" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/professor/alunos/stu12345/consentimento");
    expect(JSON.parse(init.body)).toEqual({ action: "revogar" });
  });

  it("cancelar não chama a API", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Revogar consentimento" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: /Confirmar revogação/ })).not.toBeInTheDocument();
  });

  it("aluno com acesso ativo não oferece 'novo consentimento'", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Registrar novo consentimento" })).not.toBeInTheDocument();
  });
});

describe("aluno desativado: novo consentimento", () => {
  it("só habilita depois de marcar a declaração e registra a reativação", async () => {
    reply(200);
    setup({ active: false });
    const user = userEvent.setup();
    expect(screen.queryByRole("button", { name: "Revogar consentimento" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Registrar novo consentimento" }));
    const confirm = screen.getByRole("button", { name: "Registrar e reativar" });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /consentimento do responsável legal/ }));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ action: "registrar" });
  });
});

describe("excluir definitivamente", () => {
  it("exige digitar o apelido; o botão só habilita quando confere", async () => {
    reply(200);
    setup({ displayName: "Sol Lua" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Excluir definitivamente" }));
    expect(screen.getByText("Isso não pode ser desfeito")).toBeInTheDocument();

    const del = screen.getByRole("button", { name: "Excluir para sempre" });
    expect(del).toBeDisabled();
    await user.type(screen.getByLabelText(/Para confirmar, digite o apelido/), "sol");
    expect(del).toBeDisabled();
    await user.clear(screen.getByLabelText(/Para confirmar/));
    await user.type(screen.getByLabelText(/Para confirmar/), "  sol   lua ");
    expect(del).toBeEnabled();

    await user.click(del);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/professor"));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/professor/alunos/stu12345");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({ confirm: "  sol   lua " });
  });

  it("avisa quando outros profissionais também perdem o acesso", async () => {
    setup({ otherAdults: 2 });
    await userEvent.click(screen.getByRole("button", { name: "Excluir definitivamente" }));
    expect(screen.getByText(/Outros 2 profissionais também acompanham este aluno/)).toBeInTheDocument();
  });

  it("não menciona outros profissionais quando não há", async () => {
    setup({ otherAdults: 0 });
    await userEvent.click(screen.getByRole("button", { name: "Excluir definitivamente" }));
    expect(screen.queryByText(/também acompanha/)).not.toBeInTheDocument();
  });

  it("falha mostra mensagem gentil e não navega", async () => {
    reply(500);
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Excluir definitivamente" }));
    await user.type(screen.getByLabelText(/Para confirmar/), "Sol");
    await user.click(screen.getByRole("button", { name: "Excluir para sempre" }));
    expect(await screen.findByText(/Não foi possível concluir agora/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

it("passa no axe (fechado e com a exclusão aberta)", async () => {
  const { container } = setup();
  expect(await axe(container)).toHaveNoViolations();
  await userEvent.click(screen.getByRole("button", { name: "Excluir definitivamente" }));
  expect(await axe(container)).toHaveNoViolations();
});
