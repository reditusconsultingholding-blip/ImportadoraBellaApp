# Referencia — sistema en producción (Railway/FastAPI)

Extraído de `calculadora-marketing-rd.zip` (entregado 2026-08-14), que a su
vez viene del sistema real en producción de Importadora Bella:
`app-production-0d44.up.railway.app` (app de Shopify: **"Jarvin Panal"**).
Esto **no es el código de este repo** — es la referencia de lo que ya
funciona en el otro sistema, para portar los patrones probados (ver
`DECISIONES.md`, sección "Consolidación de sistemas").

## Stack del sistema de referencia
FastAPI + PostgreSQL (`asyncpg`) en Railway. Frontend sin frameworks (HTML +
CSS + JS plano). Auth: login usuario + PIN → JWT con rol, guardado por
`Depends(requiere_rol(...))` en cada endpoint.

## Auth contra Shopify (client credentials grant)

Variables de entorno usadas (ya configuradas en Railway):
```
SHOPIFY_SHOP           dominio *.myshopify.com de la tienda
SHOPIFY_CLIENT_ID      app "Jarvin Panal" del Dev Dashboard
SHOPIFY_CLIENT_SECRET  secreto de esa app
SHOPIFY_API_VERSION    version de la Admin API (por defecto 2025-04)
```

Dos formas soportadas (usa la que esté seteada):
1. `SHOPIFY_ADMIN_TOKEN` fijo (app personalizada) — se usa tal cual si existe.
2. `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` → pide un token temporal
   (~24h) a `https://{SHOPIFY_SHOP}/admin/oauth/access_token`, lo cachea en
   memoria y lo renueva 10 minutos antes de expirar.

Esto es más robusto que el token fijo simple que usa hoy
`src/lib/integrations/shopify.ts` en este repo — vale la pena portarlo.

## Catálogo de productos en vivo (GraphQL)

```graphql
query($cursor: String) {
  products(first: 250, after: $cursor, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      title
      variants(first: 1) {
        nodes { price inventoryItem { unitCost { amount } } }
      }
    }
  }
}
```
Trae título, precio y **costo unitario real** (`unitCost`) por producto —
esto es lo que autocompleta el costo en la calculadora sin que alguien lo
tipee a mano. Se cachea 10 minutos en memoria; si Shopify falla, cae a un
catálogo local de respaldo (`calc_products.json`, 399 productos).

## Persistencia de ajustes (compartida entre todo el equipo, no localStorage)

```sql
CREATE TABLE IF NOT EXISTS calc_ajustes (
  producto   TEXT PRIMARY KEY,        -- nombre exacto del producto (titulo de Shopify)
  data       JSONB NOT NULL,          -- {aov, cogs, flete, cpa, admin, conf, dev, ord}
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Endpoints:
| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/calc/productos` | Catálogo (Shopify o respaldo) + ajustes guardados. `?refrescar=1` fuerza releer Shopify |
| POST | `/calc/ajustes` | Guarda `{name, data}` (upsert, compartido para todo el equipo) |

Acceso: todo `/calc/*` exige JWT con rol `marketing` o `admin`.

## Las fórmulas de rentabilidad (más completas que la calculadora actual de este repo)

Variables de entrada por producto:
- `aov` — precio de venta / ticket promedio
- `cogs` — costo del producto
- `flete` — costo de envío por paquete DESPACHADO
- `cpa` — costo publicitario por checkout (Meta)
- `admin` — gasto administrativo (se reparte por pedido ENTREGADO)
- `c` — tasa de confirmación (0–1)
- `r` — tasa de devolución (0–1)
- `orders` — checkouts por día

Cálculo por checkout:
```
entregados por checkout:   delivered = c × (1 − r)
                           (solo se cobra lo que se confirma Y no se devuelve)

contribución por checkout: contrib = aov·delivered        <- ingreso real
                                   − cogs·delivered       <- producto solo sobre lo entregado
                                   − flete·c              <- flete sobre TODO lo despachado
                                                             (confirmado, se devuelva o no)
                                   − cpa                  <- publicidad por checkout
                                   − admin·delivered      <- admin por pedido entregado
```

Del día completo:
```
entregas/día              = orders × delivered
utilidad diaria            = orders × contrib
inversión en ads           = orders × cpa
costo real x venta (eCPA)  = cpa ÷ delivered      <- lo que de verdad cuesta UNA venta cobrada
ROAS                       = (aov × entregas/día) ÷ inversión en ads
```

Breakeven (el número que más usa marketing):
```
CPA breakeven = aov·delivered − cogs·delivered − flete·c − admin·delivered
CPA ideal     = breakeven − (utilidad objetivo % × aov × delivered)
```
Si el CPA real de Meta está por debajo del breakeven se gana; por encima se
pierde. La página muestra además 4 escenarios comparativos: actual, +10pts
de confirmación, packs (AOV +40% / costo +60%), y CPA −20%.

**Nota importante:** esto es más sofisticado que el modelo actual de
`/dashboard/calculadora` en este repo (que asume 100% confirmación y 0%
devolución). Al portarlo, agregar los inputs de tasa de confirmación y
tasa de devolución, y el cálculo de `delivered` como base de todo lo demás.

## Modelo de acceso por rol (extracto)

```python
class CalcAjusteIn(BaseModel):
    name: str    # nombre del producto (tal como viene de Shopify)
    data: dict   # ajustes: {aov, cogs, flete, cpa, admin, conf, dev, ord}

# security.py (resumen)
# def requiere_rol(*roles):
#     async def checker(user = Depends(usuario_actual)):  # decodifica el JWT
#         if user["rol"] not in roles:
#             raise HTTPException(403, "No autorizado")
#         return user
#     return checker
```

## Qué falta para portar esto de verdad

Este documento es solo lo que vino en el ZIP de referencia. Para portar el
resto del sistema (login completo, el resto de rutas, cualquier otro
módulo que tenga) hace falta acceso al repositorio completo — ver
`DECISIONES.md`, sección "Pendiente de confirmar".
