import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ArrowRight, Volume2 } from "lucide-react";
import { Button } from "./button";
import { Card } from "./card";
import { Feedback } from "./feedback";
import { Input, Label } from "./input";

describe("Button", () => {
  it("variante principal tem alvo grande e borda de contraste", () => {
    render(<Button variant="principal" icon={ArrowRight}>Continuar</Button>);
    const btn = screen.getByRole("button", { name: "Continuar" });
    expect(btn).toHaveClass("min-h-target-lg", "bg-primary", "text-on-primary", "border-primary-border");
  });

  it("variante ícone usa aria-label e não renderiza children", () => {
    render(<Button variant="icone" icon={Volume2} aria-label="Ouvir de novo" />);
    const btn = screen.getByRole("button", { name: "Ouvir de novo" });
    expect(btn).toHaveClass("size-16", "rounded-full");
  });

  it("o ícone é decorativo (aria-hidden) e não polui o nome acessível", () => {
    render(<Button icon={ArrowRight}>Voltar</Button>);
    expect(screen.getByRole("button", { name: "Voltar" }).querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("dispara onClick e é operável pelo teclado", async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Pronto</Button>);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("button")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("desabilitado não dispara ação", async () => {
    const onClick = jest.fn();
    render(<Button disabled onClick={onClick}>Pronto</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("tem type=button por padrão (não envia formulário sem querer)", () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});

describe("Feedback", () => {
  it("acerto: região status, palavra + ícone + cor de sucesso", () => {
    render(<Feedback tone="acerto" title="Isso!">A escola fica no Norte.</Feedback>);
    const box = screen.getByRole("status");
    expect(box).toHaveClass("bg-success-bg", "text-success-ink", "border-success-border");
    expect(box).toHaveTextContent("Isso!");
    expect(box.querySelector("svg")).toBeInTheDocument();
  });

  it("redirecionar: convite gentil, sem vermelho nem 'erro'", () => {
    render(<Feedback tone="redirecionar" title="Quase!">Tente perto da árvore.</Feedback>);
    const box = screen.getByRole("status");
    expect(box).toHaveClass("bg-retry-bg", "text-retry-ink", "border-retry-border");
    expect(box.className).not.toMatch(/red|destructive/);
    expect(box.textContent).not.toMatch(/erro|errado/i);
  });
});

describe("formulário base", () => {
  it("Label + Input + Card passam no axe", async () => {
    const { container } = render(
      <Card>
        <Label htmlFor="nome">Meu nome</Label>
        <Input id="nome" />
        <Button variant="principal">Continuar</Button>
      </Card>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
