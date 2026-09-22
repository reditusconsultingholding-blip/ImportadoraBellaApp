import { resolveRange } from "@/lib/date-range";
import { getOverview } from "@/lib/metrics";
import { getSalesOverview } from "@/lib/sales";
import { ventasEnElTiempo } from "@/lib/ventas-serie";
import { campanasSinProducto, productosSinCampana, resumenSinProducto } from "@/lib/sin-nomenclatura";
import { getPanelCeo } from "@/lib/ceo";
import { getRentabilidad } from "@/lib/rentabilidad";
import { serieDelPeriodo } from "@/lib/reporte-serie";
import { calcularAlertasDiarias } from "@/lib/alertas-diarias";
import { getDirectory } from "@/lib/product-directory";
import { getPatronesClientes } from "@/lib/clientes";
import { controlDelPeriodo, diaEcuador } from "@/lib/control-publicitario";
import { nombresSinEnlazar } from "@/lib/enlazar-pedidos";
import { proponerEnlaces } from "@/lib/enlace-shopify";
import { resolverPeriodo } from "@/lib/control-opciones";
import { ritmoDeVentas } from "@/lib/ritmo-ventas";
import { testeosDelPeriodo } from "@/lib/testeos";
import { origenPorVenta } from "@/lib/origen-pedidos";

// Deja calculadas las vistas por defecto de cada pantalla apenas termina un
// sync.
//
// La memoria de src/lib/memoria.ts se vacía con cada escritura, y el sync
// escribe cada 5 minutos: sin esto, la primera persona que abría el panel
// después de cada sync pagaba el cálculo entero (uno a tres segundos). Así lo
// paga el reloj, en segundo plano, y quien entra lo encuentra hecho.
//
// Solo las vistas por defecto (el rango con el que abre cada pantalla): un
// rango elegido a mano se calcula la primera vez que alguien lo pide y queda
// en memoria para el resto hasta el próximo sync.
//
// Va en serie y no todo en paralelo: son consultas pesadas y no tiene sentido
// competir con las personas que están usando la app en ese momento.
/**
 * @param soloLoPrimero Solo lo que se abre primero (el panel y el origen de las
 * ventas). Es lo que corre después de la vuelta rápida de cada dos minutos:
 * recalcular las veinte pantallas tan seguido sería cargar la base para cosas
 * que casi nadie abre en ese rato; esas las deja calculadas la vuelta lenta.
 */
export async function precalentarPantallas(organizationId: string, soloLoPrimero = false) {
  const inicio = Date.now();
  const r30 = resolveRange("30d");
  const rPanel = resolveRange(undefined);
  const control = resolverPeriodo({}, diaEcuador());

  const tareas: [string, () => Promise<unknown>][] = [
    ["panel META", () => getOverview(organizationId, "META", rPanel)],
    ["panel TIKTOK", () => getOverview(organizationId, "TIKTOK", rPanel)],
    ["panel ventas", () => getSalesOverview(organizationId, rPanel)],
    ["panel serie", () => ventasEnElTiempo(organizationId, rPanel, true)],
    ["panel serie sin cifras", () => ventasEnElTiempo(organizationId, rPanel, false)],
    ["panel sin producto", () => resumenSinProducto(organizationId, rPanel)],
    ["panel ritmo", () => ritmoDeVentas(organizationId, rPanel)],
    ["panel testeos", () => testeosDelPeriodo(organizationId, rPanel.fromInstant, rPanel.toInstant)],
    ["origen de las ventas", () => origenPorVenta(organizationId, resolveRange("ayer"))],
    ["panel cpa objetivo", () => origenPorVenta(organizationId, rPanel)],
    ["control", () => controlDelPeriodo(organizationId, { desde: control.desde, hasta: control.hasta, hora: 23, productIds: [] })],
    ["control enlazar", () => nombresSinEnlazar(organizationId, control.desde, control.hasta)],
    ["rentabilidad", () => getRentabilidad(organizationId, r30)],
    ["ceo", () => getPanelCeo(organizationId, r30)],
    ["reportes serie", () => serieDelPeriodo(organizationId, r30)],
    ["reportes ventas", () => getSalesOverview(organizationId, r30)],
    ["reportes alertas", () => calcularAlertasDiarias(organizationId)],
    ["productos", () => getDirectory(organizationId, r30, true)],
    ["productos sin cifras", () => getDirectory(organizationId, r30, false)],
    ["clientes", () => getPatronesClientes(organizationId, resolveRange("3m"))],
    ["sin nomenclatura", () => campanasSinProducto(organizationId, r30)],
    ["sin nomenclatura resumen", () => resumenSinProducto(organizationId, r30)],
    ["sin nomenclatura enlaces", () => proponerEnlaces(organizationId, r30)],
    ["sin nomenclatura productos", () => productosSinCampana(organizationId)],
  ];

  const fallas: string[] = [];
  const elegidas = soloLoPrimero ? tareas.filter(([n]) => n.startsWith("panel") || n.startsWith("control")) : tareas;
  for (const [nombre, fn] of elegidas) {
    try {
      await fn();
    } catch (err) {
      fallas.push(`${nombre}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const s = ((Date.now() - inicio) / 1000).toFixed(1);
  return fallas.length ? `${s}s, ${fallas.length} con error: ${fallas.join(" | ").slice(0, 300)}` : `${s}s`;
}
