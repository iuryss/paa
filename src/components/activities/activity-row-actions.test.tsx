import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ActivityRowActions } from "./activity-row-actions";

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
const reply = (status: number, body: unknown = {}) =>
  fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => body });

const setup = (over: Partial<React.ComponentProps<typeof ActivityRowActions>> = {}) =>
  render(<ActivityRowActions id="act1234567" title="Letras" mine published={false} hasSessions={false} {...over} />);

describe("ActivityRowActions", () => {
  it("autor: editar (link), publicar, duplicar e excluir, todos com nome acessível", () => {
    setup();
    expect(screen.getByRole("link", { name: "Editar Letras" })).toHaveAttribute("href", "/professor/atividades/act1234567");
    expect(screen.getByRole("button", { name: "Publicar Letras" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicar Letras" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir Letras" })).toBeInTheDocument();
  });

  it("colega: só duplicar (não edita, publica nem exclui atividade alheia)", () => {
    setup({ mine: false, published: true });
    expect(screen.getByRole("button", { name: "Duplicar Letras" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publicar|Despublicar|Excluir/ })).not.toBeInTheDocument();
  });

  it("publicada mostra 'Despublicar' e alterna via PATCH", async () => {
    reply(200, { ok: true });
    setup({ published: true });
    await userEvent.click(screen.getByRole("button", { name: "Despublicar Letras" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/professor/atividades/act1234567");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ published: false });
  });

  it("duplicar abre a cópia", async () => {
    reply(201, { id: "copia12345" });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Duplicar Letras" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/professor/atividades/copia12345"));
  });

  it("excluir pede confirmação e permite cancelar sem chamar a API", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Excluir Letras" }));
    expect(screen.getByText(/Excluir “Letras”\? Isso não pode ser desfeito\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText(/Isso não pode ser desfeito/)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("confirmar exclui via DELETE e atualiza a lista", async () => {
    reply(200, { ok: true });
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Excluir Letras" }));
    await user.click(screen.getByRole("button", { name: "Sim, excluir" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![1].method).toBe("DELETE");
  });

  it("com sessões de alunos não oferece excluir", () => {
    setup({ hasSessions: true });
    expect(screen.queryByRole("button", { name: /Excluir/ })).not.toBeInTheDocument();
  });

  it("falha mostra mensagem gentil", async () => {
    reply(500);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Publicar Letras" }));
    expect(await screen.findByText(/Não foi possível concluir agora/)).toBeInTheDocument();
  });

  it("passa no axe", async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});
