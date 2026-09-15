# Arquitectura y contrato de datos

## Capas

```
                         ┌─> mock-engine.js ──> catalog.js      (modo simulado)
index.html ──> app.js ───┤
                         └─> real-engine.js ──> /api/… ──> server/   (modo real)
                   │
                   └────────> reporters.js   (informe Markdown + renderizado)

server/server.js ──> recolector.js   (git clone + observaciones reales)
                 └─> analisis.js ──> zai.js ──> API de Z.AI (GLM)
```

### Navegador

- **catalog.js** — datos estáticos: requisitos, sus criterios de aceptación y el descriptivo de
  evidencia por defecto. No contiene lógica.
- **mock-engine.js** — normalización de repositorios, generación determinista de resultados y
  **composición compartida** (`componerResultadoRepo`, `componerEjecucion`, `veredictoDeCriterios`):
  el veredicto se calcula igual en ambos modos.
- **real-engine.js** — cliente del servidor local. Envía un repositorio por petición, de modo que el
  indicador de progreso avanza repositorio a repositorio igual que en el modo simulado.
- **reporters.js** — genera el informe en Markdown (`markdown()`) y lo renderiza para mostrarlo en
  pantalla (`aHtml()`).
- **app.js** — interfaz: formulario, ficha del requisito, validación, progreso, historial y descargas.

### Servidor (solo modo real)

- **server.js** — sirve los estáticos y expone el API. Carga `.env`, protege contra salida de
  directorio y desactiva los timeouts de petición (clonar y consultar al modelo lleva minutos).
- **recolector.js** — clona el repositorio y produce **observaciones**: hechos verificables
  numerados (`OBS-001`, `OBS-002`, …). No emite juicios.
- **zai.js** — cliente HTTP del API de Z.AI. Único punto donde se usa `ZAI_API_KEY`; propaga los
  errores del proveedor sin reinterpretarlos.
- **analisis.js** — construye el prompt, interpreta la respuesta, **ancla cada evidencia a la
  observación citada** y alinea la valoración con los criterios del requisito.

No hay bundler ni dependencias: los scripts se cargan como scripts clásicos y comparten el espacio
de nombres global `window.CRO`, de modo que el modo simulado funciona también abierto con `file://`.
El modo real requiere que la página se sirva desde el servidor local; si se detecta `file://`, la
opción queda deshabilitada con la explicación.

El servidor usa exclusivamente la biblioteca estándar de Node (≥ 18, por `fetch` global).

## Requisito del catálogo

```js
{
  id: 'R.010',
  desplegable: true,             // si aparece en el desplegable por defecto
  enunciado: '…',                // texto del requisito
  objetivo: '…',                 // qué hay que demostrar
  explicacion: '…',              // qué evidencia espera el catálogo
  criterios: ['…', '…', '…'],    // PROPUESTOS, pendientes de validación
  evidenciaPorDefecto: '…'       // PROPUESTO, precarga el campo editable
}
```

## Objeto de configuración (entrada)

```js
{
  modo: 'mock' | 'real',
  repos: [                       // resultado de CRO.engine.parsearRepos()
    { entrada, host, org, nombre, etiqueta, id, valido }
  ],
  requisitoId: 'R.010',
  catalogoCompleto: false,       // si el desplegable muestra los 25 requisitos
  evidenciaEsperada: 'texto libre con la forma de la evidencia',
  formatoEvidencia: 'markdown'   // siempre markdown
}
```

## Objeto de ejecución (salida)

```js
{
  id: 'EJ-20260915134057',
  fecha: '2026-09-15T13:40:57.000Z',
  modo: 'mock' | 'real',
  simulado: true,                // false en modo real
  modelo: 'glm-5.2' | null,
  config: { …configuración… },
  requisito: { id, enunciado, objetivo, explicacion, criterios },
  resultados: [
    {
      repo: { … },
      veredicto: 'conforme' | 'no-conforme' | 'no-evaluable',
      explicacion: 'breve; vacía cuando es conforme',
      criterios: [
        { indice, criterio, resultado: 'cumple'|'no cumple'|'no evaluable', justificacion }
      ],
      evidencias: [
        {
          id, repo, descripcion, ruta, linea, commit, autor, fecha, extracto, cumple,
          origen,                // 'observación OBS-004' | 'ausencia constatada…'
          verificado,            // false si citó una observación inexistente
          commitRelacion,        // p. ej. 'último commit que modificó el fichero'
          advertencia            // texto si la evidencia no es verificable
        }
      ],
      metricas: { ficherosAnalizados, commitsRevisados, duracionMs, ultimoCommit },
      // solo en modo real:
      error,                     // motivo si el repositorio no pudo evaluarse
      observaciones: [ { id, tipo, descripcion, ruta, linea } ],
      analisis: { modelo, limitaciones, razonFin }
    }
  ],
  resumen: {
    repos, conformes, noConformes, noEvaluables,
    errores,                     // repositorios que no pudieron evaluarse
    evidencias, noVerificadas,   // evidencias totales y sin respaldo verificable
    duracionMs
  }
}
```

## Derivación del veredicto

`veredictoDeCriterios()` es la única fuente del veredicto, en ambos modos:

| Situación | Veredicto |
| --- | --- |
| Algún criterio con resultado `no cumple` | **No conforme** |
| Ningún incumplimiento pero algún `no evaluable` | **No evaluable** |
| Todos los criterios `cumple` | **Conforme** |
| Sin criterios, o error al clonar | **No evaluable** |

La explicación breve se compone de las justificaciones de los criterios que no se cumplen (o, si no
hay incumplimientos, de los que no han podido valorarse). En un repositorio conforme queda vacía.

## API del servidor

| Método y ruta | Devuelve |
| --- | --- |
| `GET /api/estado` | Si el modo real está disponible, modelo y endpoint configurados, y huella de la clave (nunca la clave). |
| `POST /api/comprobar` | Resultado de una llamada mínima al modelo: valida clave, modelo y conectividad. |
| `POST /api/analizar-repo` | Evalúa **un** repositorio: `{ repo, config, requisito }` → bloque de resultado. |

`POST /api/analizar-repo` responde `200` con `{ error }` cuando el repositorio no se puede clonar
(para que el resto de la ejecución continúe) y `502` cuando falla el modelo, propagando el cuerpo del
error del proveedor.

## Anclaje de la evidencia

El modelo recibe las observaciones numeradas y debe citar una en cada evidencia. Al materializar la
respuesta:

| Campo de la evidencia | De dónde sale |
| --- | --- |
| `ruta`, `linea`, `extracto` | De la observación citada. **Nunca** del texto del modelo. |
| `commit`, `autor`, `fecha` | Del `git log` del fichero de la observación. |
| `descripcion`, `cumple` | Criterio del modelo. |
| `verificado` | `false` si la observación citada no existe. |

Una evidencia puede no citar observación si declara `"tipo": "ausencia"` (la ausencia de un control
no tiene fichero asociado). Cualquier otra cita inexistente se marca y se cuenta en
`resumen.noVerificadas`.

Del mismo modo, `materializarCriterios()` recorre los criterios **del requisito**, no los que
devuelva el modelo: un criterio que el modelo omita queda como `no evaluable`, y un resultado que no
se reconozca se normaliza también a `no evaluable`, nunca a `cumple`.

## Enmascarado de material sensible

`recolector.js` clasifica sus patrones en sensibles (claves, tokens, JWT, URLs con credenciales,
asignaciones de secretos) y estructurales (permisos de CI, CIDR abiertos, contenedores
privilegiados…). Solo los primeros se enmascaran, dejando visibles 4 caracteres: al modelo, al
informe y a la pantalla llega el secreto truncado. Los estructurales se muestran íntegros porque sin
el valor no se pueden valorar.

## Renderizado del informe

`reporters.aHtml()` implementa el subconjunto de Markdown que produce `reporters.markdown()`:
encabezados, tablas, listas, citas, bloques de código, reglas y énfasis. El texto se **escapa antes**
de aplicar cualquier transformación, de modo que el contenido devuelto por el modelo no puede
inyectar HTML. Los encabezados se desplazan un nivel (`#` → `<h2>`) para no competir con el `<h1>` de
la página.

## Cambiar de proveedor de modelo

`zai.js` habla el formato `chat/completions` de OpenAI. Para usar otro proveedor compatible basta con
`ZAI_BASE_URL` y `ZAI_MODEL`; para uno incompatible, se reimplementa `chat()` manteniendo la firma
`(mensajes, opciones) → { texto, modelo, uso, razonFin, duracionMs }`.

## Consideraciones pendientes para uso en producción

- **Criterios de aceptación**: los del catálogo son una propuesta de la aplicación y deben validarse
  con el equipo de control antes de usar los informes como evidencia formal.
- **Evidencia fuera del repositorio**: muchos requisitos se acreditan con documentación o
  configuración de plataforma. Hoy se declaran como limitación; integrarlos exigiría conectar otras
  fuentes además del repositorio.
- **Concurrencia**: se evalúa un repositorio por petición, en serie. Para listados grandes conviene
  una cola de trabajos con persistencia.
- **Aislamiento**: clonar código no confiable debería ocurrir en un contenedor efímero sin red.
- **Credenciales de repositorio**: los repos privados necesitarán un mecanismo de credenciales que
  no pase por el navegador.
- **Retención**: definir cuánto se conservan los informes y quién puede leerlos; contienen rutas,
  autores y fragmentos de código.
