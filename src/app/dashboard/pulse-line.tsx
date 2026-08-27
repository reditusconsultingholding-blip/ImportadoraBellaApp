// El trazo del pulso: la serie diaria real del producto, dibujada como un
// electro. No es decoración — cada vértice es un día de gasto, así que la
// forma dice algo. Si fuera un dibujo fijo sería peor que no ponerlo.

const TONO = {
  SANO: "var(--good)",
  VIGILAR: "var(--warning)",
  RIESGO: "var(--critical)",
  SIN_DATOS: "var(--chart-muted)",
} as const;

export type PulseTone = keyof typeof TONO;

export default function PulseLine({
  serie,
  state,
  width = 96,
  height = 26,
  className = "",
}: {
  serie: number[];
  state: PulseTone;
  width?: number;
  height?: number;
  className?: string;
}) {
  const color = TONO[state];

  // Con menos de dos puntos no hay línea que trazar: se dibuja una base plana
  // en vez de inventar una curva.
  if (serie.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-hidden
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.35}
        />
      </svg>
    );
  }

  const max = Math.max(...serie);
  const min = Math.min(...serie);
  const rango = max - min || 1;
  const pad = 3;
  const alto = height - pad * 2;

  const puntos = serie.map((v, i) => {
    const x = (i / (serie.length - 1)) * width;
    const y = pad + alto - ((v - min) / rango) * alto;
    return [x, y] as const;
  });

  const d = puntos.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${d} L${width},${height} L0,${height} Z`;
  const [ux, uy] = puntos[puntos.length - 1];
  const gradId = `pulso-${state}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* El último día, marcado: es el que importa. */}
      <circle cx={ux} cy={uy} r={2.75} fill={color} />
      <circle cx={ux} cy={uy} r={2.75} fill="none" stroke="var(--surface)" strokeWidth={1.25} />
    </svg>
  );
}
