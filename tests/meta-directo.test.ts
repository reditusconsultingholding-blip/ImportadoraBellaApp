import test from "node:test";
import assert from "node:assert/strict";
import { aFilaComun, comprasDe, rangoDePreset } from "../src/lib/integrations/meta-directo";

// 15-nov-2026 a las 15:00 UTC = 10:00 en Ecuador.
const AHORA = Date.UTC(2026, 10, 15, 15, 0, 0);

test("los presets de Windsor dan el mismo rango de días", () => {
  assert.deepEqual(rangoDePreset("last_3dT", AHORA), { since: "2026-11-13", until: "2026-11-15" });
  assert.deepEqual(rangoDePreset("last_7dT", AHORA), { since: "2026-11-09", until: "2026-11-15" });
  // Sin T no entra hoy.
  assert.deepEqual(rangoDePreset("last_7d", AHORA), { since: "2026-11-08", until: "2026-11-14" });
});

test("el día es el de Ecuador, no el de UTC", () => {
  // 16-nov 02:00 UTC todavía es 15-nov en Ecuador.
  const madrugada = Date.UTC(2026, 10, 16, 2, 0, 0);
  assert.equal(rangoDePreset("last_3dT", madrugada).until, "2026-11-15");
});

test("la compra sale de `purchase`, y si no viene, de omni_purchase", () => {
  assert.equal(comprasDe([{ action_type: "link_click", value: "40" }, { action_type: "purchase", value: "7" }]), 7);
  assert.equal(comprasDe([{ action_type: "omni_purchase", value: "3" }]), 3);
  assert.equal(comprasDe(undefined), 0);
});

test("una fila de Meta queda con la forma que ya guarda Jarvis", () => {
  const f = aFilaComun(
    { id: "1229985899113009", nombre: "CP1 - Top Ventas" },
    {
      date_start: "2026-11-14",
      campaign_id: "120200",
      campaign_name: "134142 / TE GINSENG / ABO",
      spend: "212.40",
      impressions: "18000",
      clicks: "410",
      actions: [{ action_type: "purchase", value: "31" }],
      action_values: [{ action_type: "purchase", value: "865.3" }],
    },
  );
  assert.deepEqual(f, {
    date: "2026-11-14",
    account_id: "1229985899113009",
    account_name: "CP1 - Top Ventas",
    campaign: "134142 / TE GINSENG / ABO",
    campaign_id: "120200",
    spend: 212.4,
    impressions: 18000,
    clicks: 410,
    actions_purchase: 31,
    action_values_purchase: 865.3,
  });
});
