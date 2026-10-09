import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { TERMS_VERSION } from "@/lib/terms";
import { AssignActivityForm } from "./assign-activity-form";
import { NewStudentForm } from "./new-student-form";
import { PeriodNav } from "./period-nav";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = jest.fn();
beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const reply = (status: number, body: unknown = {}) =>
  fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => body });

describe("NewStudentForm", () => {
  it("exige consentimento e explica que só pede apelido", async () => {
    render(<NewStudentForm />);
    expect(screen.getByText(/Não cadastramos nome completo, e-mail nem data de nascimento/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /consentimento do responsável/ })).toBeRequired();
    expect(screen.getByLabelText("Apelido")).toBeRequired();
  });

  it("cadastra, mostra código e PIN uma vez e atualiza a lista", async () => {
    reply(201, { id: "x", displayName: "Lua", studentCode: "ABCD-2345", pin: "4821" });
    render(<NewStudentForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Apelido"), "Lua");
    await user.click(screen.getByRole("checkbox", { name: /consentimento/ }));
    await user.click(screen.getByRole("button", { name: "Cadastrar" }));

    expect(await screen.findByText(/Lua foi cadastrado/)).toBeInTheDocument();
    expect(screen.getByText("ABCD-2345")).toBeInTheDocument();
    expect(screen.getByText("4821")).toBeInTheDocument();
    expect(screen.getByText(/o PIN não aparece de novo/)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/professor/alunos");
    expect(JSON.parse(init.body)).toEqual({
      displayName: "Lua",
      guardianConsent: true,
      termsVersion: TERMS_VERSION,
    });
    expect(screen.getByLabelText("Apelido")).toHaveValue("");
  });

  it("mostra mensagem gentil quando a API recusa ou falha", async () => {
    reply(422);
    render(<NewStudentForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Apelido"), "ana@mail.com");
    await user.click(screen.getByRole("checkbox", { name: /consentimento/ }));
    await user.click(screen.getByRole("button", { name: "Cadastrar" }));
    expect(await screen.findByText(/sem e-mail/)).toBeInTheDocument();

    fetchMock.mockRejectedValue(new Error("rede"));
    await user.click(screen.getByRole("button", { name: "Cadastrar" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Não foi possível cadastrar agora"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("passa no axe", async () => {
    const { container } = render(<NewStudentForm />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("AssignActivityForm", () => {
  const options = [
    { id: "seed-grafia", title: "Letras", moduleLabel: "Grafia" },
    { id: "seed-matematica", title: "Contas", moduleLabel: "Matemática" },
  ];

  it("atribui a atividade escolhida ao aluno", async () => {
    reply(201, { id: "as1" });
    render(<AssignActivityForm studentId="stu12345" options={options} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Atividade"), "seed-matematica");
    await user.click(screen.getByRole("button", { name: "Atribuir" }));

    expect(await screen.findByText("Atividade atribuída.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      activityId: "seed-matematica",
      studentId: "stu12345",
    });
  });

  it("avisa com gentileza quando não consegue", async () => {
    reply(403);
    render(<AssignActivityForm studentId="stu12345" options={options} />);
    await userEvent.click(screen.getByRole("button", { name: "Atribuir" }));
    expect(await screen.findByText("Não foi possível atribuir agora.")).toBeInTheDocument();
  });

  it("sem atividades disponíveis, explica em vez de mostrar formulário vazio", () => {
    render(<AssignActivityForm studentId="stu12345" options={[]} />);
    expect(screen.queryByRole("button", { name: "Atribuir" })).not.toBeInTheDocument();
    expect(screen.getByText(/já foram atribuídas/)).toBeInTheDocument();
  });

  it("passa no axe", async () => {
    const { container } = render(<AssignActivityForm studentId="stu12345" options={options} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("PeriodNav", () => {
  it("marca o período atual e linka os outros preservando a página", () => {
    render(<PeriodNav current={30} basePath="/professor" />);
    expect(screen.getByRole("link", { name: "30 dias" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "7 dias" })).toHaveAttribute("href", "/professor?dias=7");
    expect(screen.getByRole("link", { name: "90 dias" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("navigation", { name: "Período" })).toBeInTheDocument();
  });
});
