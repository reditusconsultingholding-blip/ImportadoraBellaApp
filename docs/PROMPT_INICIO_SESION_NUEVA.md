# Cómo arrancar la sesión nueva de Claude para esto

## 1. Abrí Claude Code apuntando a este repo

En una terminal, en tu PC:
```bash
cd C:\Users\Usuario\Projects\jarvis-dashboard
claude
```
(Si usás la app de escritorio o claude.ai/code en vez de la terminal, abrí
un proyecto nuevo señalando esta misma carpeta:
`C:\Users\Usuario\Projects\jarvis-dashboard`.)

## 2. Pegá esto como tu primer mensaje

```
Retomamos el proyecto Jarvis (Importadora Bella). Antes de hacer nada, leé
en orden estos tres documentos en docs/:

1. docs/JARVIS_MASTER_REQUIREMENT_V2.md  — la especificación completa
2. docs/DECISIONES.md                     — decisiones ya tomadas, no las
                                             vuelvas a preguntar
3. docs/REFERENCIA_SISTEMA_RAILWAY.md     — código real a portar (auth de
                                             Shopify, fórmulas de rentabilidad)

También leé README.md para el estado actual del código (qué ya funciona en
demo) y CLAUDE.md si existe.

Después de leerlos, seguí el "Plan de integración sugerido" (sección 6 del
Master Requirement) EN ORDEN, empezando por el punto 1. Antes de arrancar
cada punto nuevo, decime en una frase qué vas a hacer y seguí — no hace
falta que me preguntes permiso para cada paso, las decisiones de diseño ya
están tomadas en DECISIONES.md. Si encontrás algo que contradice lo
documentado, avisame antes de improvisar.

Las preguntas que siguen sin responder están en la sección 7 del Master
Requirement — si las necesitás para avanzar, preguntámelas vos, si no,
seguí con lo que sí está resuelto.
```

## 3. Qué va a hacer con esto

La sesión nueva va a: leer los 3 documentos, entender qué ya existe vs. qué
falta, y arrancar por el punto 1 del plan de integración (confirmar acceso
al repo completo del sistema en Railway) — que probablemente te lo va a
preguntar a vos primero, ya que es información que solo vos tenés.

## 4. Si el sistema de Railway tiene su propio repo de código

Si conseguís acceso al repositorio completo del sistema en Railway (no solo
el ZIP de referencia), lo más simple es que se lo pases a esa misma sesión
nueva — puede clonarlo aparte o simplemente decirle la ruta si ya lo tenés
descargado, y desde ahí portar lo que haga falta con el código real
delante, en vez de los extractos de `REFERENCIA_SISTEMA_RAILWAY.md`.
