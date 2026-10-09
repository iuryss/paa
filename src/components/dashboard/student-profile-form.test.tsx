import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { StudentProfileForm } from "./student-profile-form";

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  document.documentElement.removeAttribute("data-theme");
});
const reply = (status: number) => fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => ({}) });

const setup = () => render(<StudentProfileForm studentId="stu12345" displayName="Sol" initial={DEFAULT_PREFERENCES} />);

describe("StudentProfileForm", () => {
  it("mostra o perfil atual do aluno", () => {
    setup();
    expect(screen.getByRole("radio", { name: /Baixo Estímulo/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Textual/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Sem movimento/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Sons/ })).not.toBeChecked();
  });

  it("salva o perfil completo do ALUNO via PUT", async () => {
    reply(200);
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /Alto Contraste/ }));
    await user.click(screen.getByRole("radio", { name: /PECS/ }));
    await user.click(screen.getByRole("radio", { name: /leitura fácil/ }));
    await user.click(screen.getByRole("checkbox", { name: /Sons/ }));
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));

    expect(await screen.findByText(/O perfil de Sol foi salvo/)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/professor/alunos/stu12345/perfil");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      theme: "contraste",
      contentMode: "pictografico",
      font: "leitura",
      reducedMotion: true,
      soundEnabled: true,
    });
  });

  it("NÃO muda o tema da tela do próprio adulto", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: /Alto Contraste/ }));
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("avisa com gentileza se não conseguir salvar", async () => {
    reply(404);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Salvar perfil" }));
    expect(await screen.findByText(/Não foi possível salvar agora/)).toBeInTheDocument();
  });

  it("limpa o aviso de sucesso ao mexer de novo", async () => {
    reply(200);
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
    await screen.findByText(/foi salvo/);
    await user.click(screen.getByRole("radio", { name: /Foco Alto/ }));
    expect(screen.queryByText(/foi salvo/)).not.toBeInTheDocument();
  });

  it("passa no axe", async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});
