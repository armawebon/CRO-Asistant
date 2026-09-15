# CRO-Asistant

Aplicación web para **evaluar requisitos de control de ciberseguridad sobre listados de repositorios
Git** y generar la evidencia en Markdown. Funciona en dos modos:

| Modo | Qué hace | Requiere |
| --- | --- | --- |
| **Simulado** | Genera veredictos ficticios deterministas. No accede a los repositorios ni a la red. | Nada: abrir `index.html` |
| **Real** | Clona cada repositorio, recoge evidencia verificable y la evalúa con el modelo **GLM de Z.AI**. | Servidor local + clave de API |

## Qué recibe la aplicación

1. **Listado de repositorios Git** — uno por línea. Se aceptan `https://host/org/repo.git`,
   `git@host:org/repo.git` y la forma corta `org/repo`. Se normalizan, deduplican y se marcan las
   entradas mal formadas.
2. **Objetivo del control** — se selecciona **un** requisito del catálogo. Al elegirlo se muestran,
   como información no editable, su enunciado, el **objetivo de la evidencia**, la **explicación de
   la evidencia** y los **criterios de aceptación** con los que se evaluará.
3. **Evidencia esperada** — texto libre que describe la forma en que debe entregarse la evidencia.
   Cada requisito propone un descriptivo por defecto, editable.

El formato de entrega es siempre **Markdown** y el informe se muestra directamente en el apartado 2.

## Qué devuelve

Por cada repositorio, un **veredicto** —Conforme, No conforme o No evaluable— acompañado de una
explicación breve cuando no es conforme. No hay niveles de criticidad: el veredicto se deriva de la
evaluación de los criterios de aceptación, y basta un criterio incumplido para que el requisito no
sea conforme. Un criterio que no pueda valorarse con la evidencia disponible se marca como *no
evaluable*, nunca como cumplido.

## Cómo funciona el modo real

```
Navegador                  Servidor local                        Z.AI
   │  POST /api/analizar-repo   │                                  │
   │ ─────────────────────────► │                                  │
   │                            │ 1. git clone --depth … (real)    │
   │                            │ 2. recolección de OBSERVACIONES  │
   │                            │    (patrones, ficheros, git log) │
   │                            │ 3. requisito + criterios +       │
   │                            │    evidencia + observaciones ───►│ GLM
   │                            │ 4. criterios valorados ◄─────────│
   │                            │ 5. resolución de rutas/commits   │
   │ ◄───────────────────────── │    desde la observación citada   │
```

La separación entre **recolección** (hechos) y **análisis** (criterio del modelo) es deliberada, y
sobre ella se aplican tres reglas de integridad:

- **Toda evidencia debe citar la observación que la sustenta** (`OBS-nnn`), o declararse
  explícitamente como evidencia por ausencia.
- **La ruta, la línea y el commit no se toman del texto del modelo**: se resuelven desde la
  observación citada. El modelo no puede inventar ubicaciones.
- **Si el modelo cita una observación inexistente**, la evidencia se marca como *no verificable* y se
  contabiliza aparte en el informe.
- **El veredicto no lo dicta el modelo**: lo deriva la aplicación de los criterios valorados. Un
  resultado que el modelo no devuelva, o que no se reconozca, se trata como *no evaluable* — nunca
  como cumplido.

El material potencialmente sensible (claves, tokens, URLs con credenciales) se **enmascara en la
recolección**, antes de salir de la máquina: al modelo le llegan los primeros 4 caracteres.

### Lo que el modo real no es

Es un análisis asistido por modelo sobre evidencia real, **no un escáner de seguridad certificado**.
La detección se basa en patrones y en el criterio del modelo: habrá falsos positivos y falsos
negativos. El informe lo indica expresamente y toda conclusión requiere revisión humana antes de
usarse como resultado de auditoría.

Además, buena parte de estos requisitos se acredita con documentación, configuración de plataforma o
capturas que **no residen en el repositorio**. Para esos casos el modelo tiene instrucción de
declararlo en las limitaciones y valorar el criterio como *no evaluable*, de modo que la evidencia
que falta se ve en el informe en lugar de darse por buena.

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
| `CRO_PROFUNDIDAD` | `80` | Commits a traer en el clon. |
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
assets/js/catalog.js       Catálogo de requisitos, criterios y descriptivos de evidencia
assets/js/mock-engine.js   Motor simulado + composición de resultados (compartida)
assets/js/real-engine.js   Motor real: cliente del API local
assets/js/reporters.js     Informe Markdown y su renderizado en pantalla
assets/js/app.js           Interfaz, filtros, historial y descargas
server/server.js           Servidor local: estáticos + API de análisis
server/recolector.js       Clonado y recolección de evidencia real
server/zai.js              Cliente del API de Z.AI (GLM)
server/analisis.js         Prompt, parseo y anclaje de hallazgos a la evidencia
docs/ARQUITECTURA.md       Contrato de datos y detalle de cada capa
```

## Catálogo de requisitos

El desplegable ofrece por defecto estos 10 requisitos:

`R.006` · `R.009` · `R.010` · `R.013` · `R.014` · `R.015` · `R.026` · `R.027` · `R.029` · `R.031`

El catálogo carga además otros 15 requisitos (`R.032`, `R.034`, `R.035`, `R.037`, `R.038`, `R.062`,
`R.085`, `R.087`, `R.091`, `R.092`, `R.093`, `R.098`, `R.114`, `R.151`, `R.152`), accesibles con la
casilla **«Mostrar el catálogo completo de requisitos»**. Para que uno de ellos aparezca en el
desplegable por defecto basta con poner `desplegable: true` en `assets/js/catalog.js`.

### Origen de los datos de cada requisito

| Campo | Origen |
| --- | --- |
| `enunciado`, `objetivo`, `explicacion` | Catálogo de control facilitado. |
| `criterios` | **Propuestos por la aplicación**, pendientes de validación por el equipo de control. |
| `evidenciaPorDefecto` | **Propuesto por la aplicación**, editable en cada ejecución. |

Los campos propuestos se señalan como tales en la interfaz. Conviene revisarlos antes de usar los
informes como evidencia formal.

## Determinismo del modo simulado

Los veredictos ficticios se derivan de un hash FNV-1a de `repositorio + requisito + evidencia
esperada` que alimenta un PRNG `mulberry32`. La misma configuración produce siempre el mismo informe,
lo que permite enseñar el prototipo sin que los datos cambien entre ejecuciones.
