import { FORMATOS_ESTATICOS } from "@/lib/pipeline-options";

// Verifica que una ronda cumpla las reglas de diversidad.
//
// La idea de la ronda es medir cuatro cosas distintas a la vez. Si las cuatro
// piezas comparten formato y ángulo, compiten entre sí y la ronda entera
// termina midiendo una sola cosa — se gastó cuatro veces el presupuesto para
// aprender lo mismo.
//
// Por eso se revisa ANTES de producir, no después.

export type PiezaDeRonda = {
  id: string;
  adName: string;
  slot: number | null;
  visualFormat: string;
  angle: string;
  awarenessLevel: string;
};

export type Hallazgo = {
  regla: number;
  cumple: boolean;
  texto: string;
};

const AWARENESS_BAJO = ["L1", "L2"];

export function revisarRonda(piezas: PiezaDeRonda[]): {
  hallazgos: Hallazgo[];
  cumpleTodo: boolean;
  duplicadas: { a: string; b: string }[];
} {
  const llenas = piezas.filter((p) => p.visualFormat || p.angle || p.awarenessLevel);

  const formatos = llenas.map((p) => p.visualFormat).filter(Boolean);
  const angulos = llenas.map((p) => p.angle).filter(Boolean);

  const repetidos = (xs: string[]) => {
    const vistos = new Set<string>();
    const repes = new Set<string>();
    for (const x of xs) {
      if (vistos.has(x)) repes.add(x);
      vistos.add(x);
    }
    return [...repes];
  };

  const formatosRepetidos = repetidos(formatos);
  const angulosRepetidos = repetidos(angulos);

  const tieneBajo = llenas.some((p) =>
    AWARENESS_BAJO.some((n) => p.awarenessLevel.toUpperCase().startsWith(n))
  );
  const tieneEstatico = llenas.some(
    (p) => FORMATOS_ESTATICOS.includes(p.visualFormat) || /imagen/i.test(p.visualFormat)
  );

  // Regla 5: dos piezas con formato + ángulo + awareness idénticos cuentan como
  // una sola, así que producir las dos es tirar una a la basura.
  const duplicadas: { a: string; b: string }[] = [];
  for (let i = 0; i < llenas.length; i++) {
    for (let j = i + 1; j < llenas.length; j++) {
      const a = llenas[i];
      const b = llenas[j];
      if (
        a.visualFormat &&
        a.visualFormat === b.visualFormat &&
        a.angle === b.angle &&
        a.awarenessLevel === b.awarenessLevel
      ) {
        duplicadas.push({ a: a.adName, b: b.adName });
      }
    }
  }

  const hallazgos: Hallazgo[] = [
    {
      regla: 1,
      cumple: formatosRepetidos.length === 0,
      texto:
        formatosRepetidos.length === 0
          ? "Los formatos son todos distintos."
          : `Se repite el formato: ${formatosRepetidos.join(", ")}.`,
    },
    {
      regla: 2,
      cumple: angulosRepetidos.length === 0,
      texto:
        angulosRepetidos.length === 0
          ? "Los ángulos son todos distintos."
          : `Se repite el ángulo: ${angulosRepetidos.join(", ")}.`,
    },
    {
      regla: 3,
      cumple: tieneBajo,
      texto: tieneBajo
        ? "Hay al menos una pieza L1 o L2."
        : "Falta una pieza L1 o L2: sin eso el funnel se satura.",
    },
    {
      regla: 4,
      cumple: tieneEstatico,
      texto: tieneEstatico
        ? "Hay al menos una pieza estática o imagen."
        : "Son todas video: falta al menos una estática o imagen.",
    },
    {
      regla: 5,
      cumple: duplicadas.length === 0,
      texto:
        duplicadas.length === 0
          ? "Ninguna pieza es equivalente a otra."
          : `${duplicadas.length} par${duplicadas.length === 1 ? "" : "es"} comparte${
              duplicadas.length === 1 ? "" : "n"
            } formato, ángulo y awareness: Andromeda los agrupa como uno solo.`,
    },
  ];

  return {
    hallazgos,
    cumpleTodo: hallazgos.every((h) => h.cumple) && llenas.length >= 4,
    duplicadas,
  };
}
