import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { BarList } from "./bar-list";
import { formatValue, LineChart, niceMax, type ChartPoint } from "./line-chart";

const points: ChartPoint[] = [
  { label: "01/10", detail: "01/10 · Letras", value: 0.33 },
  { label: "03/10", detail: "03/10 · Contas", value: 0.67 },
  { label: "05/10", detail: "05/10 · Onde fica?", value: 1 },
];

describe("formatValue / niceMax", () => {
  it("formata porcentagem e segundos", () => {
    expect(formatValue("percent", 0.5)).toBe("50%");
    expect(formatValue("seconds", 3.25)).toBe("3,3 s");
  });

  it("arredonda o teto do eixo", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(3.2)).toBe(5);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(12)).toBe(20);
  });
});

describe("LineChart", () => {
  const props = { title: "Autonomia por sessão", description: "Quanto mais alto, melhor.", unit: "percent" as const, points };

  it("nomeia o gráfico, descreve e mostra por padrão a última sessão", () => {
    render(<LineChart {...props} />);
    expect(screen.getByText("Autonomia por sessão")).toBeInTheDocument();
    expect(screen.getByText("Quanto mais alto, melhor.")).toBeInTheDocument();
    expect(document.querySelector("p[aria-live]")).toHaveTextContent("05/10 · Onde fica?: 100%");
  });

  it("cada ponto é focável por teclado, tem rótulo falado e atualiza a leitura", async () => {
    render(<LineChart {...props} />);
    const dots = screen.getAllByRole("img", { name: /: \d+%$/ });
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute("aria-label", "01/10 · Letras: 33%");

    const user = userEvent.setup();
    await user.tab(); // grupo rolável
    await user.tab(); // 1º ponto
    expect(dots[0]).toHaveFocus();
    expect(document.querySelector("p[aria-live]")).toHaveTextContent("01/10 · Letras: 33%");
  });

  it("marcas com 10px ou mais e linha de 2px", () => {
    const { container } = render(<LineChart {...props} />);
    expect(container.querySelector("path")).toHaveAttribute("stroke-width", "2");
    const marks = [...container.querySelectorAll("circle[pointer-events='none']")];
    expect(marks.length).toBeGreaterThan(0);
    expect(Number(marks[0]?.getAttribute("r")) * 2).toBeGreaterThanOrEqual(8);
  });

  it("oferece a mesma informação como tabela", () => {
    render(<LineChart {...props} />);
    const table = screen.getByRole("table", { hidden: true });
    expect(within(table).getAllByRole("row", { hidden: true })).toHaveLength(4);
    expect(within(table).getByText("67%", { exact: true })).toBeInTheDocument();
  });

  it("com uma só sessão desenha o ponto sem linha", () => {
    const { container } = render(<LineChart {...props} points={[points[0]!]} />);
    expect(container.querySelector("path")).toBeNull();
    expect(screen.getAllByRole("img", { name: /33%/ })).toHaveLength(1);
  });

  it("sem dados mostra mensagem em vez de gráfico vazio", () => {
    const { container } = render(<LineChart {...props} points={[]} />);
    expect(screen.getByText("Ainda não há sessões neste período.")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("não usa as cores de série como única fonte de informação: só uma série, sem legenda", () => {
    render(<LineChart {...props} />);
    expect(screen.queryByText(/legenda/i)).not.toBeInTheDocument();
  });

  it("passa no axe", async () => {
    const { container } = render(<LineChart {...props} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("os dados que vêm do servidor são JSON puro", () => {
    expect(JSON.parse(JSON.stringify(points))).toEqual(points);
  });
});

describe("BarList", () => {
  const items = [
    { label: "Sem ajuda", value: 5 },
    { label: "Dica escrita", value: 2 },
    { label: "Resposta destacada", value: 0 },
  ];

  it("mostra o valor direto em cada linha (número, não só barra)", () => {
    render(<BarList title="Nível de ajuda" description="Por sessão." items={items} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Sem ajuda");
    expect(rows[0]).toHaveTextContent("5");
    expect(rows[2]).toHaveTextContent("0");
  });

  it("barra proporcional ao maior valor, decorativa para leitor de tela", () => {
    const { container } = render(<BarList title="t" description="d" items={items} />);
    const fills = container.querySelectorAll("[aria-hidden='true'] > span");
    expect((fills[0] as HTMLElement).style.width).toBe("100%");
    expect((fills[1] as HTMLElement).style.width).toBe("40%");
  });

  it("sem dados mostra mensagem", () => {
    render(<BarList title="t" description="d" items={items.map((i) => ({ ...i, value: 0 }))} />);
    expect(screen.getByText("Ainda não há sessões neste período.")).toBeInTheDocument();
  });

  it("passa no axe", async () => {
    const { container } = render(<BarList title="t" description="d" items={items} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
