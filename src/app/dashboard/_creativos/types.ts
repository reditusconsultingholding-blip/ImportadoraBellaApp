export type RequirementRow = {
  id: string;
  date: string;
  productId: string | null;
  product: { code: string; name: string } | null;
  adName: string;
  externalId1: string | null;
  externalId2: string | null;
  adType: string;
  phase: string;
  visualFormat: string;
  angle: string;
  awarenessLevel: string;
  marketOrigin: string;
  ownerId: string | null;
  owner: { id: string; name: string } | null;
  status: string;
  // Qué está haciendo la pieza EN LA PAUTA, y a qué ronda de cuatro pertenece.
  // Las dos ya existían en la base y la API ya las dejaba editar; faltaban en
  // este tipo, y por eso el panel de detalle no las mostraba.
  estado: string | null;
  ronda: string | null;
  originalVideoLink: string | null;
  tiktokPostLink: string | null;
  fbPostLink: string | null;
  hookRate: number | null;
  ctr: number | null;
  holdRate: number | null;
  purchases: number | null;
  cpa: number | null;
  frequency: number | null;
  cpm: number | null;
  nextAction: string | null;
  notes: string | null;
  dueDate: string | null;
  thumbnailUrl: string | null;
};

export type ProductOption = { id: string; code: string; name: string };
export type UserOption = { id: string; name: string; role: string };
