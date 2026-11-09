import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { StudentTeamCard } from "./student-team-card";

const push = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const fetchMock = jest.fn();
const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });

const ANA = { id: "prof1", displayName: "Ana", role: "TEACHER" };
const BIA = { id: "prof2", displayName: "Bia", role: "THERAPIST" };

function setup(props: Partial<Parameters<typeof StudentTeamCard>[0]> = {}) {
  return render(
    <StudentTeamCard studentId="stu1" displayName="Sol" currentAdultId="prof1" team={[ANA, BIA]} active {...props} />,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  refresh.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("StudentTeamCard", () => {
  it("mostra quem acompanha, marca você e passa no axe", async () => {
    const { container } = setup();
    expect(screen.getByText("Ana (você)")).toBeInTheDocument();
    expect(screen.getByText("Terapeuta")).toBeInTheDocument();
    expect(screen.getByText(/mesmos poderes, inclusive excluir/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("adiciona um colega e atualiza a página", async () => {
    reply(201, { adult: { id: "prof3", displayName: "Caio" }, emailSent: true });
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText("E-mail do colega"), "caio@escola.test");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Caio agora acompanha Sol.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/professor/alunos/stu1/profissionais",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "caio@escola.test" }) }),
    );
    expect(screen.getByLabelText("E-mail do colega")).toHaveValue("");
    expect(refresh).toHaveBeenCalled();
  });

  it("avisa quando o e-mail não saiu, mas o vínculo foi feito", async () => {
    reply(201, { adult: { id: "prof3", displayName: "Caio" }, emailSent: false });
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText("E-mail do colega"), "caio@escola.test");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("avise a pessoa");
  });

  it("mostra o motivo quando o servidor recusa e mantém o e-mail digitado", async () => {
    reply(422, { error: "unknown_email", message: "Não encontramos um profissional com esse e-mail." });
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText("E-mail do colega"), "x@escola.test");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Não encontramos");
    expect(screen.getByLabelText("E-mail do colega")).toHaveValue("x@escola.test");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("remover pede confirmação e só então chama o servidor", async () => {
    reply(200, { ok: true });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Remover Bia" }));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sim, remover" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Bia não acompanha mais Sol.");
    expect(fetchMock).toHaveBeenCalledWith("/api/professor/alunos/stu1/profissionais/prof2", { method: "DELETE" });
    expect(refresh).toHaveBeenCalled();
  });

  it("cancelar a confirmação não remove ninguém", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Remover Bia" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("group", { name: /Confirmar/ })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sair do acompanhamento volta ao painel", async () => {
    reply(200, { ok: true });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Sair do acompanhamento" }));
    await user.click(screen.getByRole("button", { name: "Sim, sair" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/professor"));
  });

  it("sozinho, não há botão de sair nem de remover", () => {
    setup({ team: [ANA] });
    expect(screen.queryByRole("button", { name: "Sair do acompanhamento" })).not.toBeInTheDocument();
    expect(screen.getByText("Você é a única pessoa acompanhando Sol.")).toBeInTheDocument();
  });

  it("com o consentimento revogado, não dá para adicionar", () => {
    setup({ active: false });
    expect(screen.queryByLabelText("E-mail do colega")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover Bia" })).toBeInTheDocument();
  });
});
