import Esqueleto from "@/app/dashboard/esqueleto";

// Se muestra mientras el servidor arma esta pantalla. Sin esto, cambiar de
// sección deja la anterior congelada y parece que la app no respondió.
export default function Cargando() {
  return <Esqueleto />;
}
