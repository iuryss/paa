import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { AcceptInvitationForm } from "./accept-invitation-form";
import { ForgotPasswordForm } from "./forgot-password-form";

describe("ForgotPasswordForm", () => {
  it("envia o e-mail e mostra a mesma confirmação neutra", async () => {
    const action = jest.fn().mockResolvedValue({ done: true, error: null });
    render(<ForgotPasswordForm action={action} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "ana@escola.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    const status = await screen.findByText("Pedido recebido!");
    expect(status.closest("[role='status']")).toHaveTextContent("Se este e-mail tiver cadastro");
    expect((action.mock.calls[0]?.[1] as FormData).get("email")).toBe("ana@escola.com");
    // a mensagem não afirma que o e-mail existe
    expect(document.body.textContent).not.toMatch(/enviamos um e-mail para ana/i);
  });

  it("mostra erro de formato do e-mail", async () => {
    const action = jest.fn().mockResolvedValue({ done: false, error: "Informe um e-mail válido." });
    render(<ForgotPasswordForm action={action} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "ana@escola.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));
    expect(await screen.findByText("Informe um e-mail válido.")).toBeInTheDocument();
    expect(screen.queryByText("Pedido recebido!")).not.toBeInTheDocument();
  });

  it("passa no axe", async () => {
    const { container } = render(<ForgotPasswordForm action={jest.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("AcceptInvitationForm reaproveitado na redefinição", () => {
  it("aceita rótulos próprios de botão e de campo", () => {
    render(
      <AcceptInvitationForm action={jest.fn()} submitLabel="Salvar nova senha" passwordLabel="Nova senha" />,
    );
    expect(screen.getByRole("button", { name: "Salvar nova senha" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nova senha")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByRole("form", { name: "Salvar nova senha" })).toBeInTheDocument();
  });
});
