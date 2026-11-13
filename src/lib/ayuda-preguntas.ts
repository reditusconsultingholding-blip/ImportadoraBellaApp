import type { PreguntaFrecuente } from "@/lib/ayuda-busqueda";

// Las dudas que ya se sabe que van a llegar.
//
// Salen de lo que preguntaron Fabrizio y Emilia en las llamadas (la del
// 10-nov sobre todo) y de lo que el equipo reportó como error y era en
// realidad un paso que no conocía. Cada una apunta al paso de la capacitación
// que la explica: la burbuja muestra la respuesta corta y ofrece el video de
// ese paso y el botón para ir a la pantalla.
//
// La regla es la misma que la de la capacitación: no prometer nada que la
// pantalla no haga. Si una función cambia, se corrige acá.

export const PREGUNTAS: PreguntaFrecuente[] = [
  {
    id: "cpa-distinto-meta",
    pregunta: "¿Por qué el CPA de Jarvis no coincide con el de Meta o TikTok?",
    respuesta:
      "Porque Meta y TikTok se atribuyen más compras de las que llegan a Shopify. Jarvis divide el gasto entre los pedidos de Shopify, que es el CPA real, el mismo que da la Calculadora. En la pestaña «Shopify vs Ads» de Control publicitario se ven los dos lado a lado, día por día.",
    pasoId: "control-shopify-ads",
    sinonimos: ["administrador de anuncios", "plataforma", "real", "diferente", "no cuadra"],
  },
  {
    id: "que-es-factor",
    pregunta: "¿Qué quiere decir el factor?",
    respuesta:
      "Es lo que reporta la plataforma dividido lo que llegó a Shopify. 1,00 es que coinciden; 1,30 es que la plataforma reporta un 30 % de compras de más. Hasta un 10 % de diferencia está bien (verde), hasta 25 % hay que vigilarlo (ámbar), más es para revisar el píxel (rojo).",
    pasoId: "control-shopify-ads",
    sinonimos: ["porcentaje", "diferencia", "pixel", "duplicando eventos"],
  },
  {
    id: "poner-etiquetas",
    pregunta: "¿Cómo le pongo Testeo, Activo u Orgánico a un producto?",
    respuesta:
      "En Control publicitario › «Riesgo por producto» o en «Shopify vs Ads», cada producto tiene el botón de etiquetas: se marcan las que correspondan y se guardan solas. Se ven en todo el panel y en el buscador de la Calculadora.",
    pasoId: "control-riesgo",
    sinonimos: ["etiqueta", "testeo", "apagado", "permanente", "reimportar", "organico", "marcar"],
  },
  {
    id: "riesgo-como-se-calcula",
    pregunta: "¿Cómo decide Jarvis si un producto es de riesgo bajo, medio o alto?",
    respuesta:
      "Con la confirmación y el CPA real. Riesgo bajo: confirma 70 % o más y el CPA está dentro del objetivo. Riesgo alto: confirma menos de 55 % y el CPA no da, o pierde plata. Medio: una de las dos anda bien y la otra no. La confirmación y el objetivo salen de la Calculadora.",
    pasoId: "control-riesgo",
    sinonimos: ["top 10", "mejores productos", "confirmacion alta"],
  },
  {
    id: "donde-confirmacion",
    pregunta: "¿Dónde se actualiza la confirmación, el costo o el CPA objetivo?",
    respuesta:
      "En la Calculadora de precios. Todo sale de ahí: si se cambia la confirmación, el costo o el gasto operativo de un producto, Control publicitario y Riesgo por producto se actualizan solos.",
    pasoId: "calculadora",
    sinonimos: ["efectividad", "gasto operativo", "precio", "actualizar", "cambiar"],
  },
  {
    id: "buscar-sku",
    pregunta: "¿Cómo encuentro el producto correcto en la Calculadora?",
    respuesta:
      "Se busca por nombre o por SKU de Shopify. Los que tuvieron pauta en los últimos 15 días salen primero, marcados como activos, con sus etiquetas al lado.",
    pasoId: "calculadora",
    sinonimos: ["sku", "codigo", "activo", "repetido", "confundo"],
  },
  {
    id: "sin-pauta",
    pregunta: "¿Qué son los productos que venden sin pauta?",
    respuesta:
      "Productos con pedidos en Shopify y ningún gasto publicitario en el período: recompras y ventas orgánicas. No son un error. También aparecen ahí los marcados con la etiqueta Orgánico.",
    pasoId: "control-riesgo",
    sinonimos: ["organica", "recompra", "sin publicidad"],
  },
  {
    id: "pedidos-sin-enlazar",
    pregunta: "Un producto aparece con menos pedidos de los que tiene, ¿qué hago?",
    respuesta:
      "Casi siempre es un nombre de Shopify que no está enlazado a ningún producto (por ejemplo, cuando se cambia el nombre del producto en la tienda). Se arregla en Control publicitario › «Enlazar pedidos»: Jarvis sugiere el producto y se confirma.",
    pasoId: "control",
    sinonimos: ["enlazar", "faltan pedidos", "nombre", "no aparecen", "cpa alto"],
  },
  {
    id: "producto-nuevo",
    pregunta: "Llegó un producto nuevo y no aparece, ¿cómo lo agrego?",
    respuesta:
      "En Productos, con «Traer del catálogo», que lista lo que ya está en Shopify. Si todavía no está en la tienda, con «+ Nuevo producto». Al crearlo se ancla al producto de Shopify y a su campaña para que se le peguen las ventas y el gasto.",
    pasoId: "productos-gestion",
    sinonimos: ["nuevo", "contenedor", "dar de alta", "crear producto"],
  },
  {
    id: "campana-sin-producto",
    pregunta: "Hay gasto que no aparece en ningún producto, ¿dónde se arregla?",
    respuesta:
      "En Sin nomenclatura: ahí están las campañas sin producto y los nombres de Shopify sin producto. Se elige el producto y desde ese momento suma a su rentabilidad.",
    pasoId: "sin-nomenclatura",
    sinonimos: ["campana", "nomenclatura", "gasto perdido"],
  },
  {
    id: "datos-viejos",
    pregunta: "Los datos no se actualizan, ¿qué reviso?",
    respuesta:
      "Conexiones: casi siempre es una cuenta que se desconectó o un token que venció. Cada cuenta dice si está conectada y tiene «Sincronizar ahora».",
    pasoId: "conexiones",
    sinonimos: ["no actualiza", "desconectada", "windsor", "sincronizar"],
  },
];
