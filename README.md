# CRO-Asistant

Aplicación web para **definir y ejecutar controles de ciberseguridad sobre listados de repositorios
Git**. Funciona en dos modos:

| Modo | Qué hace | Requiere |
| --- | --- | --- |
| **Simulado** | Genera hallazgos ficticios deterministas. No accede a los repositorios ni a la red. | Nada: abrir `index.html` |
| **Real** | Clona cada repositorio, recoge evidencia verificable y la analiza con el modelo **GLM de Z.AI**. | Servidor local + clave de API |

## Qué recibe la aplicación

1. **Listado de repositorios Git** — uno por línea. Se aceptan `https://host/org/repo.git`,
   `git@host:org/repo.git` y la forma corta `org/repo`. Se normalizan, deduplican y se marcan las
   entradas mal formadas.
2. **Objetivo del control** — se elige un control del catálogo (6 controles con su marco de
   referencia: OWASP, NIST SSDF, ISO 27001, CIS, SLSA), se concreta el objetivo de esa ejecución y se
   seleccionan las verificaciones a ejecutar.
3. **Prompt de enfoque de la prueba** — cómo abordar el análisis. En modo real **este texto se envía
   literalmente al modelo** y condiciona su trabajo. Cada control trae un prompt sugerido.
4. **Evidencia esperada** — formato de entrega (Markdown, JSON, CSV o resumen ejecutivo), campos
   obligatorios de cada hallazgo y criterio de aceptación del control.

## Cómo funciona el modo real

```
Navegador                  Servidor local                        Z.AI
   │  POST /api/analizar-repo   │                                  │
   │ ─────────────────────────► │                                  │
   │                            │ 1. git clone --depth … (real)    │
   │                            │ 2. recolección de OBSERVACIONES  │
   │                            │    (patrones, ficheros, git log) │
   │                            │ 3. objetivo + prompt + evidencia │
   │                            │    + observaciones ─────────────►│ GLM
   │                            │ 4. hallazgos JSON ◄──────────────│
   │                            │ 5. resolución de rutas/commits   │
   │ ◄───────────────────────── │    desde la observación citada   │
```

La separación entre **recolección** (hechos) y **análisis** (criterio del modelo) es deliberada, y
sobre ella se aplican tres reglas de integridad:

- **Todo hallazgo debe citar la observación que lo sustenta** (`OBS-nnn`), o declararse
  explícitamente como hallazgo por ausencia de control.
- **La ruta, la línea y el commit no se toman del texto del modelo**: se resuelven desde la
  observación citada. El modelo no puede inventar ubicaciones.
- **Si el modelo cita una observación inexistente**, el hallazgo se marca como *sin evidencia
  verificable*, con confianza baja, y se contabiliza aparte en el informe.

El material potencialmente sensible (claves, tokens, URLs con credenciales) se **enmascara en la
recolección**, antes de salir de la máquina: al modelo le llegan los primeros 4 caracteres.

### Lo que el modo real no es

Es un análisis asistido por modelo sobre evidencia real, **no un escáner de seguridad certificado**.
La detección se basa en patrones y en el criterio del modelo: habrá falsos positivos y falsos
negativos. El informe lo indica expresamente y toda conclusión requiere revisión humana antes de
usarse como resultado de auditoría.

## Puesta en marcha

### Modo simulado

```bash
xdg-open index.html     # o simplemente abrir el fichero en el navegador
```

### Modo real

```bash
cp .env.example .env
# editar .env y poner ZAI_API_KEY=...
npm start               # equivale a: node server/server.js
# → http://127.0.0.1:8080
```

No hay dependencias que instalar: el servidor usa solo la biblioteca estándar de Node (≥ 18).

En la propia interfaz, el botón **«Comprobar conexión con el modelo»** valida clave, modelo y
conectividad antes de lanzar ningún análisis, y muestra el error del proveedor tal cual si algo
falla (por ejemplo, si el identificador de modelo no existe en tu cuenta).

### Variables de entorno

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `ZAI_API_KEY` | — | Clave del API de Z.AI. **Obligatoria** para el modo real. |
| `ZAI_MODEL` | `glm-5.2` | Identificador del modelo. |
| `ZAI_BASE_URL` | `https://api.z.ai/api/paas/v4` | Endpoint compatible con OpenAI. Usa `https://open.bigmodel.cn/api/paas/v4` para BigModel. |
| `PORT` / `HOST` | `8080` / `127.0.0.1` | Escucha del servidor local. |
| `CRO_CLONAR` | `1` | `0` desactiva el clonado. |
| `CRO_PROFUNDIDAD` | `80` | Commits a traer en el clon con histórico. |
| `CRO_MAX_PROMPT` | `120000` | Tope de caracteres del contexto enviado al modelo. |

## Seguridad de la clave

- La clave se lee **solo en el servidor** (`ZAI_API_KEY`). El navegador nunca la recibe: `/api/estado`
  devuelve únicamente una huella del tipo `74d3…BN03`.
- `.env` está en `.gitignore`. **No versiones nunca la clave.**
- Si una clave ha llegado a aparecer en un chat, un ticket, un log o una captura, considérala
  comprometida y rótala en el panel de Z.AI.
- El servidor escucha en `127.0.0.1` por defecto. Si lo expones en red, pon autenticación delante:
  cualquiera que alcance el puerto puede gastar tu cuota del API.

## Sobre el clonado

El recolector clona con `--depth`, `--single-branch` y `--no-tags`, con `core.hooksPath=/dev/null`
(los hooks del repositorio analizado **no se ejecutan**), sin prompts de credenciales, sin seguir
enlaces simbólicos y borrando el directorio temporal al terminar. Aun así, clonar código no confiable
conviene hacerlo en un entorno aislado.

## Estructura

```
index.html                 Estructura de la interfaz
assets/css/styles.css      Estilos (tema claro/oscuro automático)
assets/js/catalog.js       Catálogo de controles, verificaciones y plantillas
assets/js/mock-engine.js   Motor simulado + composición de resultados (compartida)
assets/js/real-engine.js   Motor real: cliente del API local
assets/js/reporters.js     Evidencia en Markdown / JSON / CSV / resumen ejecutivo
assets/js/app.js           Interfaz, filtros, historial y descargas
server/server.js           Servidor local: estáticos + API de análisis
server/recolector.js       Clonado y recolección de evidencia real
server/zai.js              Cliente del API de Z.AI (GLM)
server/analisis.js         Prompt, parseo y anclaje de hallazgos a la evidencia
docs/ARQUITECTURA.md       Contrato de datos y detalle de cada capa
```

## Catálogo de controles

| Id | Control | Marco de referencia |
| --- | --- | --- |
| `CTRL-SEC-001` | Exposición de secretos y credenciales | OWASP ASVS V2 · NIST SSDF PW.4 · ISO 27001 A.8.24 |
| `CTRL-SEC-002` | Vulnerabilidades en dependencias (SCA) | OWASP A06:2021 · NIST SSDF PW.3 |
| `CTRL-SEC-003` | Gobierno del repositorio y protección de ramas | NIST SSDF PO.3 · SLSA L2 |
| `CTRL-SEC-004` | Seguridad de la cadena de CI/CD | SLSA L3 · OWASP Top 10 CI/CD |
| `CTRL-SEC-005` | Configuración insegura de infraestructura como código | CIS Benchmarks · NIST SP 800-53 CM-6 |
| `CTRL-SEC-006` | Patrones inseguros en el código fuente (SAST) | OWASP Top 10 · CWE Top 25 |

Añadir un control consiste en añadir un objeto al array `controles` de `assets/js/catalog.js`: la
interfaz, el plan de ejecución y el prompt enviado al modelo se construyen a partir de él.

## Determinismo del modo simulado

Los hallazgos ficticios se derivan de un hash FNV-1a de `repositorio + control + verificaciones` que
alimenta un PRNG `mulberry32`. La misma configuración produce siempre el mismo informe, lo que
permite enseñar el prototipo sin que los datos cambien entre ejecuciones.
