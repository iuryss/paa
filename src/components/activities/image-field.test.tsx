import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { useState } from "react";
import { ImagePrepareError } from "@/lib/images/compress";
import type { ImageRef } from "@/lib/validation/activities";
import { ImageField } from "./image-field";

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const library = [{ id: "cimgbola1234567890abcdef", alt: "Bola de basquete", width: 400, height: 400 }];
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

function Harness({ prepare = async (f: File) => f as Blob }: { prepare?: (f: File) => Promise<Blob> }) {
  const [value, setValue] = useState<ImageRef | null>(null);
  return (
    <>
      <ImageField id="campo" label="Imagem da resposta 1" value={value} onChange={setValue} prepare={prepare} />
      <span data-testid="valor">{value ? `${value.id}|${value.alt}` : "nada"}</span>
    </>
  );
}

const file = () => new File([new Uint8Array([1, 2, 3])], "cubo.png", { type: "image/png" });

describe("ImageField", () => {
  it("escolhe uma imagem já enviada (biblioteca do professor)", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { images: library }));
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Escolher imagem" }));
    await user.click(await screen.findByRole("button", { name: "Usar: Bola de basquete" }));
    expect(screen.getByTestId("valor")).toHaveTextContent("cimgbola1234567890abcdef|Bola de basquete");
    expect(screen.getByRole("img", { name: "Bola de basquete" })).toHaveAttribute("src", "/api/imagens/cimgbola1234567890abcdef");
    // A descrição pode ser ajustada para esta atividade; dá para tirar a imagem.
    await user.clear(screen.getByLabelText("Descrição da imagem (para quem não enxerga)"));
    await user.type(screen.getByLabelText("Descrição da imagem (para quem não enxerga)"), "Bola laranja");
    expect(screen.getByTestId("valor")).toHaveTextContent("|Bola laranja");
    await user.click(screen.getByRole("button", { name: "Tirar imagem" }));
    expect(screen.getByTestId("valor")).toHaveTextContent("nada");
  });

  it("envia nova imagem: exige descrição e a confirmação LGPD; manda o arquivo já preparado", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { images: [] }));
    const prepare = jest.fn(async () => new Blob([new Uint8Array([9, 9])], { type: "image/webp" }));
    const user = userEvent.setup();
    render(<Harness prepare={prepare} />);
    await user.click(screen.getByRole("button", { name: "Escolher imagem" }));
    expect(await screen.findByText("Você ainda não enviou imagens.")).toBeInTheDocument();
    expect(screen.getByText(/Não envie fotos de alunos/)).toBeInTheDocument();

    await user.upload(screen.getByLabelText("Arquivo (PNG, JPG ou WebP)"), file());
    await user.click(screen.getByRole("button", { name: "Enviar imagem" }));
    expect(screen.getByRole("status")).toHaveTextContent("Descreva a imagem em poucas palavras.");

    await user.type(screen.getByLabelText("Descrição da imagem (para quem não enxerga)"), "Cubo mágico");
    await user.click(screen.getByRole("button", { name: "Enviar imagem" }));
    expect(screen.getByRole("status")).toHaveTextContent("Confirme que a imagem não mostra alunos.");
    expect(prepare).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(json(201, { id: "cimgcubo1234567890abcdef", alt: "Cubo mágico", width: 300, height: 300 }));
    await user.click(screen.getByRole("checkbox", { name: /não mostra alunos/ }));
    await user.click(screen.getByRole("button", { name: "Enviar imagem" }));
    await waitFor(() => expect(screen.getByTestId("valor")).toHaveTextContent("cimgcubo1234567890abcdef|Cubo mágico"));

    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("/api/professor/imagens");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.get("alt")).toBe("Cubo mágico");
    expect(form.get("confirmo")).toBe("sim");
    expect((form.get("arquivo") as Blob).size).toBe(2); // o arquivo preparado (comprimido), não o original
  });

  it("mostra a mensagem do servidor ou do preparo quando a imagem é recusada", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { images: [] }));
    const prepare = jest.fn().mockRejectedValueOnce(new ImagePrepareError("animada"));
    const user = userEvent.setup();
    render(<Harness prepare={prepare} />);
    await user.click(screen.getByRole("button", { name: "Escolher imagem" }));
    await user.upload(await screen.findByLabelText("Arquivo (PNG, JPG ou WebP)"), file());
    await user.type(screen.getByLabelText("Descrição da imagem (para quem não enxerga)"), "Bola");
    await user.click(screen.getByRole("checkbox", { name: /não mostra alunos/ }));
    await user.click(screen.getByRole("button", { name: "Enviar imagem" }));
    expect(await screen.findByText(/Imagens animadas não são aceitas/)).toBeInTheDocument();

    prepare.mockResolvedValueOnce(new Blob([new Uint8Array([1])]));
    fetchMock.mockResolvedValueOnce(json(409, { error: "quota", message: "Você chegou ao limite de imagens." }));
    await user.click(screen.getByRole("button", { name: "Enviar imagem" }));
    expect(await screen.findByText("Você chegou ao limite de imagens.")).toBeInTheDocument();
    expect(screen.getByTestId("valor")).toHaveTextContent("nada");
  });

  it("sem violações de acessibilidade com o seletor aberto", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { images: library }));
    const { container } = render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Escolher imagem" }));
    await screen.findByRole("button", { name: "Usar: Bola de basquete" });
    expect(within(container).getByRole("region", { name: "Imagem da resposta 1: escolher" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
