import { render, screen } from "@testing-library/react";
import { Map } from "lucide-react";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { AccessibilityProvider } from "./accessibility-provider";
import { AdaptiveLabel } from "./adaptive-label";

function renderWith(contentMode: "textual" | "pictografico") {
  return render(
    <AccessibilityProvider initial={{ ...DEFAULT_PREFERENCES, contentMode }}>
      <AdaptiveLabel text="Onde fica?" icon={<Map />} />
    </AccessibilityProvider>,
  );
}

describe("AdaptiveLabel", () => {
  it("modo textual: só o texto", () => {
    renderWith("textual");
    expect(screen.getByText("Onde fica?")).toBeInTheDocument();
    expect(screen.queryByTestId("pictogram-label")).not.toBeInTheDocument();
  });

  it("modo pictográfico: pictograma + palavra curta", () => {
    renderWith("pictografico");
    const label = screen.getByTestId("pictogram-label");
    expect(label.querySelector("svg")).toBeInTheDocument();
    expect(label.querySelector("svg")?.closest("[aria-hidden='true']")).not.toBeNull();
    expect(label).toHaveTextContent("Onde fica?");
  });
});
