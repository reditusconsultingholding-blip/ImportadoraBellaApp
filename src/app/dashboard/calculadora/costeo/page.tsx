import { redirect } from "next/navigation";

// "Costeo y utilidad" se fundió en la Calculadora de precios (septiembre de
// 2026). Esta dirección queda para los enlaces que alguien haya guardado.
export default function CosteoPage() {
  redirect("/dashboard/calculadora");
}
