"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Abre a impressão do navegador, que também oferece "Salvar como PDF". Some no papel. */
export function PrintButton() {
  return (
    <Button icon={Printer} onClick={() => window.print()} className="print:hidden">
      Imprimir ou salvar em PDF
    </Button>
  );
}
