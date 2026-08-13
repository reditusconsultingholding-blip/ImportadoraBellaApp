// Datos reales de abril entregados por Fabrizio (planilla de rentabilidad por
// producto). Los acumulados quedan tal cual los pasó; las columnas "por
// pedido" (Ingreso x pedido, Gasto operativo, Margen sin publicidad,
// Publicidad) se calculan al vuelo en la API — ver src/app/api/profitability.
//
// "Mercadería acumulada" y "Cuánto quisiéramos ganar por pedido" no vinieron
// con datos: quedan como campos editables (merchandiseAccum /
// desiredProfitPerOrder) que cualquier OWNER/DIRECTOR puede cargar desde la
// tabla — no se inventan valores.
export type ProfitabilitySeedRow = {
  productName: string;
  orders: number;
  cpa: number;
  revenueAccum: number;
  adSpendAccum: number;
  operatingExpenseAccum: number;
  adminExpenseAccum: number;
  profitAccum: number;
};

export const PROFITABILITY_MONTH_ABRIL = "ABRIL";

export const PROFITABILITY_ABRIL_2026: ProfitabilitySeedRow[] = [
  { productName: "NIDA", orders: 679, cpa: 7.03, revenueAccum: 14601, adSpendAccum: 4772, operatingExpenseAccum: 2643, adminExpenseAccum: 2809, profitAccum: 3950 },
  { productName: "CREMA 345 DR ALTHEA", orders: 485, cpa: 7.45, revenueAccum: 10063, adSpendAccum: 3613, operatingExpenseAccum: 1920, adminExpenseAccum: 1140, profitAccum: 2493 },
  { productName: "COLLAR ABRAZO ETERNO MADRE E HIJO", orders: 112, cpa: 6.54, revenueAccum: 3390, adSpendAccum: 733, operatingExpenseAccum: 687, adminExpenseAccum: 2147, profitAccum: 1417 },
  { productName: "TRULY ACEITE AFTER SHAVE SOFT SERVE", orders: 225, cpa: 11.73, revenueAccum: 8197, adSpendAccum: 2639, operatingExpenseAccum: 1181, adminExpenseAccum: 331, profitAccum: 3244 },
  { productName: "JABONES DE CURCUMA", orders: 162, cpa: 8.63, revenueAccum: 2941, adSpendAccum: 1398, operatingExpenseAccum: 615, adminExpenseAccum: 349, profitAccum: 173 },
  { productName: "CYPERUS OIL", orders: 84, cpa: 7.99, revenueAccum: 1977, adSpendAccum: 671, operatingExpenseAccum: 377, adminExpenseAccum: 1577, profitAccum: 569 },
  { productName: "ACEITE ACONDICIONADOR DE CABELLO", orders: 137, cpa: 8.96, revenueAccum: 2683, adSpendAccum: 1228, operatingExpenseAccum: 456, adminExpenseAccum: 441, profitAccum: 368 },
  { productName: "KAHI", orders: 321, cpa: 5.92, revenueAccum: 8558, adSpendAccum: 1900, operatingExpenseAccum: 1487, adminExpenseAccum: 1151, profitAccum: 3714 },
  { productName: "BAKUCHIOL", orders: 43, cpa: 10.88, revenueAccum: 953, adSpendAccum: 468, operatingExpenseAccum: 171, adminExpenseAccum: 56, profitAccum: 123 },
  { productName: "LIFTING PRO DUO", orders: 294, cpa: 4.97, revenueAccum: 3389, adSpendAccum: 1462, operatingExpenseAccum: 10462, adminExpenseAccum: 423, profitAccum: 742 },
  { productName: "SNOWY", orders: 272, cpa: 8.84, revenueAccum: 6410, adSpendAccum: 2405, operatingExpenseAccum: 1378, adminExpenseAccum: 883, profitAccum: 1327 },
  { productName: "SIMPLY VITAL", orders: 142, cpa: 8.91, revenueAccum: 2931, adSpendAccum: 1265, operatingExpenseAccum: 503, adminExpenseAccum: 481, profitAccum: 450 },
  { productName: "CREMA CONTORNO DE OJOS PAPA FEEL", orders: 568, cpa: 6.13, revenueAccum: 10140, adSpendAccum: 3480, operatingExpenseAccum: 2093, adminExpenseAccum: 3307, profitAccum: 2188 },
  { productName: "DEEP COLLAGEN POWER BOOSTING SERUM", orders: 26, cpa: 18.62, revenueAccum: 1907, adSpendAccum: 484, operatingExpenseAccum: 312, adminExpenseAccum: 95, profitAccum: 851 },
  { productName: "BOOSTER PRO DUO", orders: 7, cpa: 22.71, revenueAccum: 638, adSpendAccum: 159, operatingExpenseAccum: 41, adminExpenseAccum: 121, profitAccum: 387 },
  { productName: "PETER CREMA FACIAL", orders: 53, cpa: 12.94, revenueAccum: 1309, adSpendAccum: 686, operatingExpenseAccum: 262, adminExpenseAccum: 248, profitAccum: 79 },
  { productName: "Shampoo Batana", orders: 524, cpa: 5.95, revenueAccum: 6167, adSpendAccum: 3120, operatingExpenseAccum: 1184, adminExpenseAccum: 1299, profitAccum: 1831 },
  { productName: "OCHEAL LILA", orders: 32, cpa: 8.09, revenueAccum: 1194, adSpendAccum: 259, operatingExpenseAccum: 202, adminExpenseAccum: 304, profitAccum: 599 },
  { productName: "BODY COMPRESOR", orders: 758, cpa: 3.84, revenueAccum: 11734, adSpendAccum: 2914, operatingExpenseAccum: 1799, adminExpenseAccum: 1555, profitAccum: 5220 },
  { productName: "COMBO BUCAL", orders: 123, cpa: 8.66, revenueAccum: 3066, adSpendAccum: 1065, operatingExpenseAccum: 496, adminExpenseAccum: 362, profitAccum: 945 },
  { productName: "Dr.melaxin Spray Exfoliante Corporal", orders: 474, cpa: 5.23, revenueAccum: 8419, adSpendAccum: 2477, operatingExpenseAccum: 1662, adminExpenseAccum: 0, profitAccum: 2829 },
  { productName: "KIT CELIMAX", orders: 21, cpa: 10.10, revenueAccum: 508, adSpendAccum: 212, operatingExpenseAccum: 100, adminExpenseAccum: 0, profitAccum: 96 },
  { productName: "FOOT PADS GOOD NIGHT", orders: 123, cpa: 6.07, revenueAccum: 1683, adSpendAccum: 746, operatingExpenseAccum: 336, adminExpenseAccum: 536, profitAccum: 103 },
  { productName: "RIZADOR INALAMBRICO", orders: 7, cpa: 14.86, revenueAccum: 202, adSpendAccum: 104, operatingExpenseAccum: 35, adminExpenseAccum: 97, profitAccum: -2 },
  { productName: "Set de 3 Tablas de Acero Inoxidable", orders: 78, cpa: 7.81, revenueAccum: 2707, adSpendAccum: 609, operatingExpenseAccum: 379, adminExpenseAccum: 0, profitAccum: 1327 },
  { productName: "Te 18 flavors Yigan tea", orders: 60, cpa: 5.43, revenueAccum: 905, adSpendAccum: 326, operatingExpenseAccum: 170, adminExpenseAccum: 357, profitAccum: 164 },
  { productName: "Té Adelgazante Apple Rose & Lotus Leaf", orders: 188, cpa: 5.39, revenueAccum: 3492, adSpendAccum: 1013, operatingExpenseAccum: 684, adminExpenseAccum: 905, profitAccum: 1062 },
  { productName: "Te Ginseng para los riñones", orders: 130, cpa: 5.37, revenueAccum: 2299, adSpendAccum: 698, operatingExpenseAccum: 431, adminExpenseAccum: 2163, profitAccum: 708 },
  { productName: "KIT DE PESTAÑAS", orders: 3, cpa: 6.00, revenueAccum: 78, adSpendAccum: 18, operatingExpenseAccum: 18, adminExpenseAccum: 166, profitAccum: 17 },
  { productName: "VT COMBO PDRN", orders: 2, cpa: 23.50, revenueAccum: 50, adSpendAccum: 47, operatingExpenseAccum: 6, adminExpenseAccum: 0, profitAccum: -9 },
  { productName: "ROSA METÁLICA", orders: 13, cpa: 14.08, revenueAccum: 84, adSpendAccum: 183, operatingExpenseAccum: 15, adminExpenseAccum: 80, profitAccum: -195 },
  { productName: "MEDICUBE EXOSOME", orders: 6, cpa: 14.50, revenueAccum: 226, adSpendAccum: 87, operatingExpenseAccum: 49, adminExpenseAccum: 0, profitAccum: 53 },
  { productName: "FORTHIQ", orders: 2, cpa: 14.00, revenueAccum: 127, adSpendAccum: 28, operatingExpenseAccum: 9, adminExpenseAccum: 166, profitAccum: 54 },
  { productName: "TE FEMENINO", orders: 17, cpa: 6.65, revenueAccum: 50, adSpendAccum: 113, operatingExpenseAccum: 9, adminExpenseAccum: 77, profitAccum: -157 },
  { productName: "COMBO CELIMAX", orders: 99, cpa: 8.55, revenueAccum: 242, adSpendAccum: 846, operatingExpenseAccum: 38, adminExpenseAccum: 1038, profitAccum: -931 },
  { productName: "ACEITE CELULITIS", orders: 26, cpa: 11.54, revenueAccum: 751, adSpendAccum: 300, operatingExpenseAccum: 115, adminExpenseAccum: 232, profitAccum: 389 },
  { productName: "ACEITE DE BATANA", orders: 64, cpa: 7.53, revenueAccum: 2088, adSpendAccum: 482, operatingExpenseAccum: 357, adminExpenseAccum: 0, profitAccum: 901 },
  { productName: "MADECA", orders: 7, cpa: 19.00, revenueAccum: 211, adSpendAccum: 133, operatingExpenseAccum: 36, adminExpenseAccum: 134, profitAccum: 7 },
  { productName: "MAKE UP BOOK", orders: 8, cpa: 42.25, revenueAccum: 465, adSpendAccum: 338, operatingExpenseAccum: 82, adminExpenseAccum: 146, profitAccum: 306 },
  { productName: "MASCARILLA PDRN", orders: 3, cpa: 18.67, revenueAccum: 0, adSpendAccum: 56, operatingExpenseAccum: 0, adminExpenseAccum: 32, profitAccum: -96 },
  { productName: "VT PDRN", orders: 3, cpa: 16.33, revenueAccum: 405, adSpendAccum: 49, operatingExpenseAccum: 37, adminExpenseAccum: 28, profitAccum: 253 },
];

// Fila TOTAL tal como la pasó Fabrizio — se muestra para verificar que la
// suma de filas cuadre con lo que él ya tenía en su planilla.
export const PROFITABILITY_ABRIL_2026_TOTAL = {
  orders: 6381,
  cpa: 6.83,
  revenueAccum: 127236,
  adSpendAccum: 43586,
  operatingExpenseAccum: 32837,
  adminExpenseAccum: 25235,
  profitAccum: 37548,
};
