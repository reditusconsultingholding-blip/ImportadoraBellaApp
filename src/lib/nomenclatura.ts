// La nomenclatura de un lote de contenido: {código del producto}-{número de
// lote}, por ejemplo "134142-1", "134142-2"...
//
// Es la clave que conecta tres cosas que hoy viven separadas: quién hizo el
// lote (Ronda.responsableId), qué piezas trae (Requirement.rondaId) y qué
// campaña salió de él (Campaign, una vez que el editor pega esta nomenclatura
// en el nombre al lanzarla en Meta o TikTok). Sin esto, "quién hizo esta
// campaña" es una pregunta que solo se puede responder preguntando.

/** El texto que el editor copia y pega al nombrar la campaña. */
export function nomenclaturaDeRonda(code: string, numero: number): string {
  return `${code}-${numero}`;
}

export type NomenclaturaEncontrada = {
  code: string;
  lote: number;
};

/**
 * Busca la nomenclatura "{código}-{número de lote}" dentro del nombre de una
 * campaña. Distinto de parseCampaignRef (que lee "CÓDIGO / NOMBRE / TESTEO"):
 * acá el sufijo puede aparecer en cualquier segmento separado por "/", " ",
 * "_" o "-", porque el equipo no siempre respeta el mismo separador al armar
 * el nombre en Meta o TikTok.
 */
export function parseNomenclatura(nombreCampana: string): NomenclaturaEncontrada | null {
  const match = nombreCampana.match(/\b(\d{3,8})-(\d{1,3})\b/);
  if (!match) return null;
  return { code: match[1], lote: Number(match[2]) };
}
