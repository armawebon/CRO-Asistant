# CRO-Asistant

Aplicación web (HTML + CSS + JavaScript, sin dependencias ni build) para **definir y ejecutar
controles de ciberseguridad sobre listados de repositorios Git**.

> ⚠️ **Estado actual: MOCK.** La aplicación no clona repositorios, no realiza peticiones de red y
> no ejecuta ningún análisis real. Todos los hallazgos son ficticios y se generan localmente de
> forma determinista para prototipar el flujo de trabajo y el formato de la evidencia.

## Qué permite hacer

1. **Listado de repositorios Git.** Se pegan uno por línea; se aceptan `https://host/org/repo.git`,
   `git@host:org/repo.git` y la forma corta `org/repo`. La aplicación normaliza, deduplica y marca
   las entradas mal formadas.
2. **Objetivo del control.** Se elige un control del catálogo (6 controles predefinidos con su marco
   de referencia: OWASP, NIST SSDF, ISO 27001, CIS, SLSA), se concreta el objetivo de esa ejecución
   y se seleccionan las verificaciones a ejecutar.
3. **Prompt de enfoque de la prueba.** Texto libre que describe cómo abordar el análisis. Cada
   control aporta un prompt sugerido que puede usarse como punto de partida.
4. **Evidencia esperada.** Formato de entrega (Markdown, JSON, CSV o resumen ejecutivo), campos
   obligatorios de cada hallazgo (ubicación, commit, fragmento, impacto, recomendación, referencia
   normativa, CVSS, trazabilidad) y criterio de aceptación del control.
5. **Ejecución y resultados.** Progreso por repositorio, KPIs, veredicto por repositorio, matriz de
   estado por verificación, tabla de hallazgos filtrable con evidencia desplegable, y la evidencia
   final generada en el formato solicitado (copiable y descargable).

Las ejecuciones y el borrador del formulario se guardan en `localStorage` (máximo 20 ejecuciones).

## Cómo ejecutarla

No requiere instalación ni servidor:

```bash
# Opción 1: abrir directamente
xdg-open index.html      # macOS: open index.html

# Opción 2: servidor estático (recomendado)
npx http-server . -p 8080
# → http://localhost:8080
```

También puede publicarse tal cual en cualquier hosting estático (GitHub Pages, S3, Nginx).

## Estructura

```
index.html                 Estructura de la interfaz
assets/css/styles.css      Estilos (tema claro/oscuro automático)
assets/js/catalog.js       Catálogo de controles, verificaciones y plantillas de hallazgo
assets/js/mock-engine.js   Motor de análisis simulado (determinista) y parseo de repositorios
assets/js/reporters.js     Generación de evidencia en Markdown / JSON / CSV / resumen ejecutivo
assets/js/app.js           Lógica de la interfaz, filtros, historial y descargas
docs/ARQUITECTURA.md       Modelo de datos y ruta para sustituir el mock por un análisis real
```

## Catálogo de controles incluido

| Id | Control | Marco de referencia |
| --- | --- | --- |
| `CTRL-SEC-001` | Exposición de secretos y credenciales | OWASP ASVS V2 · NIST SSDF PW.4 · ISO 27001 A.8.24 |
| `CTRL-SEC-002` | Vulnerabilidades en dependencias (SCA) | OWASP A06:2021 · NIST SSDF PW.3 |
| `CTRL-SEC-003` | Gobierno del repositorio y protección de ramas | NIST SSDF PO.3 · SLSA L2 |
| `CTRL-SEC-004` | Seguridad de la cadena de CI/CD | SLSA L3 · OWASP Top 10 CI/CD |
| `CTRL-SEC-005` | Configuración insegura de infraestructura como código | CIS Benchmarks · NIST SP 800-53 CM-6 |
| `CTRL-SEC-006` | Patrones inseguros en el código fuente (SAST) | OWASP Top 10 · CWE Top 25 |

Añadir un control nuevo consiste únicamente en añadir un objeto al array `controles` de
`assets/js/catalog.js`; la interfaz se construye a partir de él.

## Determinismo del mock

Los hallazgos se derivan de un hash FNV-1a de `repositorio + control + verificaciones` que alimenta
un PRNG `mulberry32`. La misma configuración produce siempre el mismo informe, lo que permite
enseñar el prototipo y comparar capturas sin que los datos cambien entre ejecuciones.

## Siguiente paso hacia un análisis real

Ver [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md). En resumen: la interfaz solo depende de
`CRO.engine.ejecutar(config, onProgreso)` y del contrato del objeto de resultado, de modo que
sustituir el mock por una llamada a un servicio backend no requiere tocar la capa de presentación.
