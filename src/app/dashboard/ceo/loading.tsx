import CargandoConLogo from "@/app/dashboard/cargando-con-logo";

// Lo que se ve mientras el servidor arma esta pantalla.
//
// Antes acá había bloques grises, o directamente nada: Sebastián lo describió
// como "se queda ahí en blanco cuando está cargando, y feo". Una pantalla en
// blanco y una pantalla rota se ven exactamente igual, y las doce secciones que
// no tenían `loading.tsx` dejaban congelada la pantalla ANTERIOR, que es peor
// todavía: parece que el clic no se registró.
//
// El detalle dice por qué tarda ESTA pantalla y no una frase genérica. Saber
// que se están cruzando catorce meses de datos convierte la espera de sospecha
// en paciencia.
export default function Cargando() {
  return (
    <CargandoConLogo
      detalle="La calidad pesa un poco: es año y medio de campañas puesto en una sola pantalla."
      alto="min-h-[60vh]"
    />
  );
}
