# Arquitectura y contrato de datos

## Capas

```
index.html ──> app.js ──────> mock-engine.js ──> catalog.js
                   │                 (sustituible por un backend real)
                   └────────> reporters.js
```

- **catalog.js** — datos estáticos: controles, verificaciones, campos y formatos de evidencia y
  plantillas de hallazgo. No contiene lógica.
- **mock-engine.js** — normalización de repositorios y generación determinista de resultados.
  Es la única capa que habría que sustituir para pasar a un análisis real.
- **reporters.js** — transforma un objeto de ejecución en evidencia (Markdown, JSON, CSV, resumen).
- **app.js** — interfaz: formulario, validación, progreso, filtros, historial y descargas.

No hay bundler ni dependencias: los scripts se cargan como scripts clásicos y comparten el espacio
de nombres global `window.CRO`, de modo que la aplicación funciona también abierta con `file://`.

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
  semilla: ''                    // opcional, fija la aleatoriedad del mock
}
```

## Objeto de ejecución (salida)

```js
{
  id: 'EJ-20260915125252',
  fecha: '2026-09-15T12:52:52.000Z',
  simulado: true,                // pasará a false con un motor real
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
        estado, confianza
      } ],
      checks:   [ { id, nombre, hallazgos, estado } ],
      conteo:   { critica, alta, media, baja, info },
      puntuacion: 0..100,
      veredicto: 'conforme' | 'parcial' | 'no-conforme',
      metricas: { ficherosAnalizados, commitsRevisados, duracionMs, ultimoCommit }
    }
  ],
  resumen: {
    repos, hallazgos, conteo, conformes, parciales, noConformes,
    puntuacionMedia, duracionMs
  }
}
```

La puntuación es `100 − Σ(peso de severidad)` acotada a 0, con pesos
`crítica 25 · alta 15 · media 8 · baja 3 · informativa 1`.

## Sustitución del mock por un análisis real

`app.js` solo invoca:

```js
CRO.engine.ejecutar(config, onProgreso) // → Promise<Ejecucion>
CRO.engine.parsearRepos(texto)          // → { validos, invalidos }
```

Para conectar un backend real basta con reimplementar `ejecutar()`:

```js
CRO.engine.ejecutar = function (config, onProgreso) {
  return fetch('/api/ejecuciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  }).then(function (r) { return r.json(); });
};
```

manteniendo la forma del objeto de ejecución descrita arriba. El progreso por repositorio puede
alimentarse con SSE o WebSocket llamando a `onProgreso(indice, total, repo)`.

Consideraciones para esa fase, fuera del alcance del prototipo actual:

- **Clonado**: hacerlo en un entorno aislado, en modo *bare* y sin ejecutar hooks del repositorio.
- **Credenciales**: los tokens de acceso a los repositorios nunca deben viajar al navegador.
- **Enmascarado**: los secretos detectados deben almacenarse truncados; la evidencia no debe
  convertirse en un nuevo punto de fuga.
- **Retención**: definir el periodo de conservación de informes y su control de acceso.
