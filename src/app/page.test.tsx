import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Home", () => {
  it("renderiza o título principal", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "Plataforma TEA" })).toBeInTheDocument();
  });
});
