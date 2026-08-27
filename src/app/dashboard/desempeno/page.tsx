import { redirect } from "next/navigation";

// El ranking de desempeño con premios ($100 / $50 / $30) se retiró de este
// proyecto: el pago del equipo se lleva en Nómina, con montos reales por
// persona. Esta ruta queda solo para que un enlace viejo no dé 404.
export default function DesempenoPage() {
  redirect("/dashboard");
}
