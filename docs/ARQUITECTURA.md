# Arquitectura y contrato de datos

## Capas

```
                         ┌─> mock-engine.js ──> catalog.js      (modo simulado)
index.html ──> app.js ───┤
                         └─> real-engine.js ──> /api/… ──> server/   (modo real)
                   │
                   └────────> reporters.js

server/server.js ──> recolector.js   (git clone + observaciones reales)
                 └─> analisis.js ──> zai.js ──> API de Z.AI (GLM)
```

### Navegador

- **catalog.js** — datos estáticos: controles, verificaciones, campos y formatos de evidencia y
  plantillas de hallazgo. No contiene lógica.
- **mock-engine.js** — normalización de repositorios, generación determinista de resultados y
  **composición de resultados compartida** (`componerResultadoRepo`, `componerEjecucion`): la
  puntuación y el veredicto se calculan igual en ambos modos.
- **real-engine.js** — cliente del servidor local. Envía un repositorio por petición, de modo que el
  indicador de progreso avanza repositorio a repositorio igual que en el modo simulado.
- **reporters.js** — transforma un objeto de ejecución en evidencia (Markdown, JSON, CSV, resumen).
- **app.js** — interfaz: formulario, validación, progreso, filtros, historial y descargas.

### Servidor (solo modo real)

- **server.js** — sirve los estáticos y expone el API. Carga `.env`, protege contra salida de
  directorio en el servido de ficheros y desactiva los timeouts de petición (clonar y consultar al
  modelo lleva minutos).
- **recolector.js** — clona el repositorio y produce **observaciones**: hechos verificables
  numerados (`OBS-001`, `OBS-002`, …). No emite juicios.
- **zai.js** — cliente HTTP del API de Z.AI. Único punto donde se usa `ZAI_API_KEY`; propaga los
  errores del proveedor sin reinterpretarlos.
- **analisis.js** — construye el prompt, interpreta la respuesta y **ancla cada hallazgo a la
  observación citada**.

No hay bundler ni dependencias: los scripts se cargan como scripts clásicos y comparten el espacio
de nombres global `window.CRO`, de modo que el modo simulado funciona también abierto con `file://`.
El modo real requiere que la página se sirva desde el servidor local (necesita el mismo origen para
llamar a `/api/…`); si se detecta `file://`, la opción queda deshabilitada con la explicación.

El servidor usa exclusivamente la biblioteca estándar de Node (≥ 18, por `fetch` global).

## Objeto de configuración (entrada)

```js
{
  repos: [                       // resultado de CRO.engine.parsearRepos()
    { entrada, host, org, nombre, etiqueta, id, valido }
  ],
  rama: 'main',
  profundidad: 'completa' | 'superficial',
  controlId: 'CTRL-SEC-001',
  checks: ['SEC-001.1', 'SEC-001.2'],
  objetivo: 'texto libre',
  prompt: 'texto libre con el enfoque de la prueba',
  formatoEvidencia: 'markdown' | 'json' | 'csv' | 'ejecutivo',
  camposEvidencia: ['ubicacion', 'commit', 'snippet', ...],
  criterioAceptacion: 'texto libre',
  semilla: '',                   // opcional, fija la aleatoriedad del mock
  modo: 'mock' | 'real'
}
```

## Objeto de ejecución (salida)

```js
{
  id: 'EJ-20260915125252',
  fecha: '2026-09-15T12:52:52.000Z',
  modo: 'mock' | 'real',
  simulado: true,                // false en modo real
  modelo: 'glm-5.2' | null,      // modelo que resolvió el análisis
  config: { ...configuración... },
  control: { id, nombre, marco, descripcion },
  checks: ['SEC-001.1', ...],
  plan: 'texto markdown con el plan de ejecución',
  resultados: [
    {
      repo: { ... },
      hallazgos: [ {
        id, titulo, severidad,           // critica | alta | media | baja | info
        control, check, checkNombre, repo,
        archivo, linea, commit, autor, fecha, rama,
        snippet, impacto, recomendacion, referencia, cvss,
        estado, confianza,
        // solo en modo real:
        origen,                  // 'observación OBS-004' | 'ausencia de control'
        verificado,              // false si citó una observación inexistente
        justificacion,           // por qué la observación sustenta el hallazgo
        commitRelacion,          // p. ej. 'último commit que modificó el fichero'
        advertencia              // texto si el hallazgo no es verificable
      } ],
      // solo en modo real:
      error,                     // motivo si el repositorio no pudo analizarse
      observaciones: [ { id, tipo, descripcion, ruta, linea } ],
      analisis: { modelo, valoracionGlobal, descartados, limitaciones },
      checks:   [ { id, nombre, hallazgos, estado } ],
      conteo:   { critica, alta, media, baja, info },
      puntuacion: 0..100,
      veredicto: 'conforme' | 'parcial' | 'no-conforme',
      metricas: { ficherosAnalizados, commitsRevisados, duracionMs, ultimoCommit }
    }
  ],
  resumen: {
    repos, hallazgos, conteo, conformes, parciales, noConformes,
    errores,                     // repositorios que no pudieron analizarse
    noVerificados,               // hallazgos sin evidencia verificable
    puntuacionMedia, duracionMs
  }
}
```

La puntuación es `100 − Σ(peso de severidad)` acotada a 0, con pesos
`crítica 25 · alta 15 · media 8 · baja 3 · informativa 1`.

## API del servidor

| Método y ruta | Devuelve |
| --- | --- |
| `GET /api/estado` | Si el modo real está disponible, modelo y endpoint configurados, y huella de la clave (nunca la clave). |
| `POST /api/comprobar` | Resultado de una llamada mínima al modelo: sirve para validar clave, modelo y conectividad. |
| `POST /api/analizar-repo` | Analiza **un** repositorio: `{ repo, config, control, checks }` → bloque de resultado. |

`POST /api/analizar-repo` responde `200` con `{ error }` cuando el repositorio no se puede clonar
(para que el resto de la ejecución continúe) y `502` cuando falla el modelo, propagando el cuerpo del
error del proveedor.

## Anclaje de los hallazgos a la evidencia

El modelo recibe las observaciones numeradas y debe citar una en cada hallazgo. Al materializar la
respuesta (`materializarHallazgos`):

| Campo del hallazgo | De dónde sale |
| --- | --- |
| `archivo`, `linea`, `snippet` | De la observación citada. **Nunca** del texto del modelo. |
| `commit`, `autor`, `fecha` | Del `git log` del fichero de la observación. |
| `titulo`, `severidad`, `impacto`, `recomendacion`, `cvss` | Criterio del modelo. |
| `verificado` | `false` si la observación citada no existe. |

Un hallazgo puede no citar observación si declara `"tipo": "ausencia"` (la ausencia de un control no
tiene fichero asociado). Cualquier otra cita inexistente se marca y se cuenta en
`resumen.noVerificados`.

## Enmascarado de material sensible

`recolector.js` clasifica sus patrones en sensibles (claves, tokens, JWT, URLs con credenciales,
asignaciones de secretos) y estructurales (permisos de CI, CIDR abiertos, contenedores
privilegiados…). Solo los primeros se enmascaran, dejando visibles 4 caracteres: al modelo, al
informe y a la pantalla llega el secreto truncado. Los estructurales se muestran íntegros porque sin
el valor no se pueden valorar.

## Cambiar de proveedor de modelo

`zai.js` habla el formato `chat/completions` de OpenAI. Para usar otro proveedor compatible basta con
`ZAI_BASE_URL` y `ZAI_MODEL`; para uno incompatible, se reimplementa `chat()` manteniendo la firma
`(mensajes, opciones) → { texto, modelo, uso, razonFin, duracionMs }`.

## Consideraciones pendientes para uso en producción

- **Concurrencia**: hoy se analiza un repositorio por petición, en serie. Para listados grandes
  conviene una cola de trabajos con persistencia.
- **Aislamiento**: clonar código no confiable debería ocurrir en un contenedor efímero sin red.
- **Credenciales de repositorio**: los repos privados necesitarán un mecanismo de credenciales que
  no pase por el navegador.
- **Retención**: definir cuánto se conservan los informes y quién puede leerlos; contienen rutas,
  autores y fragmentos de código.
