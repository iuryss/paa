import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdultLoginForm, StudentLoginForm } from "./login-forms";

describe("StudentLoginForm", () => {
  it("tem campos rotulados e operáveis por teclado", async () => {
    const action = jest.fn().mockResolvedValue({ error: null });
    render(<StudentLoginForm action={action} />);

    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByLabelText("Meu código")).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Meu PIN")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Entrar" })).toHaveFocus();
  });

  it("envia os dados e mostra a mensagem gentil quando não dá certo", async () => {
    const action = jest.fn().mockResolvedValue({ error: "Não deu certo. Tente de novo." });
    render(<StudentLoginForm action={action} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Meu código"), "DEMO-2345");
    await user.type(screen.getByLabelText("Meu PIN"), "1234");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Não deu certo. Tente de novo.")).toBeInTheDocument();
    const formData = action.mock.calls[0]?.[1] as FormData;
    expect(formData.get("studentCode")).toBe("DEMO-2345");
    expect(formData.get("pin")).toBe("1234");
  });

  it("o campo de PIN esconde os dígitos", () => {
    render(<StudentLoginForm action={jest.fn()} />);
    expect(screen.getByLabelText("Meu PIN")).toHaveAttribute("type", "password");
  });
});

describe("AdultLoginForm", () => {
  it("usa autocomplete correto e anuncia o erro em região live", async () => {
    const action = jest.fn().mockResolvedValue({ error: "Não foi possível entrar." });
    render(<AdultLoginForm action={action} />);

    expect(screen.getByLabelText("E-mail")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Senha")).toHaveAttribute("autocomplete", "current-password");

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "prof@escola.com");
    await user.type(screen.getByLabelText("Senha"), "x");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Não foi possível entrar.");
  });
});
