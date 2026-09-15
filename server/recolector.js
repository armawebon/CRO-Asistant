/*
 * recolector.js — Recolección REAL de evidencia desde un repositorio Git.
 *
 * Clona el repositorio en un directorio temporal y extrae observaciones
 * verificables (ficheros, coincidencias de patrón, manifiestos, workflows,
 * metadatos de commits). No emite juicios: solo hechos.
 *
 * El análisis de esas observaciones lo realiza el modelo (ver analisis.js).
 * Separar ambas fases es lo que permite que la evidencia citada sea real
 * en lugar de depender de lo que el modelo recuerde o invente.
 */
'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const LIMITES = {
  ficherosMax: Number(process.env.CRO_MAX_FICHEROS || 6000),
  bytesFicheroMax: 512 * 1024,
  coincidenciasPorRepo: 80,
  bytesContextoMax: Number(process.env.CRO_MAX_CONTEXTO || 60000),
  timeoutCloneMs: Number(process.env.CRO_TIMEOUT_CLONE_MS || 120000),
  timeoutGitMs: 20000
};

const DIRS_IGNORADOS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'target', 'vendor',
  '.venv', 'venv', '__pycache__', '.next', '.nuxt', 'coverage', '.gradle'
]);

const EXT_BINARIAS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.pdf', '.zip', '.gz',
  '.tar', '.bz2', '.7z', '.rar', '.jar', '.war', '.class', '.so', '.dylib', '.dll',
  '.exe', '.bin', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.avi', '.mov',
  '.pyc', '.o', '.a', '.lib', '.wasm'
]);

/* --------------------------------------------------------- patrones de interés */

const PATRONES = [
  { id: 'clave-privada', sensible: true, nombre: 'Bloque de clave privada', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { id: 'aws-access-key', sensible: true, nombre: 'Identificador de clave AWS', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'token-github', sensible: true, nombre: 'Token de GitHub', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { id: 'token-slack', sensible: true, nombre: 'Token de Slack', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'clave-stripe', sensible: true, nombre: 'Clave de Stripe', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { id: 'clave-google', sensible: true, nombre: 'Clave de API de Google', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'jwt', sensible: true, nombre: 'JSON Web Token', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { id: 'url-credenciales', sensible: true, nombre: 'URL con credenciales embebidas', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]{3,}@[^\s/]+/gi },
  { id: 'asignacion-secreto', sensible: true, nombre: 'Asignación de secreto en código', re: /\b(?:password|passwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|private[_-]?key|client[_-]?secret)\b\s*[:=]\s*["'][^"'\s]{8,}["']/gi },
  { id: 'hash-debil', nombre: 'Uso de hash criptográfico débil', re: /\b(?:md5|sha1)\s*\(|createHash\(\s*["'](?:md5|sha1)["']/gi },
  { id: 'sql-concatenado', nombre: 'Consulta SQL construida por concatenación', re: /\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^\n;]{0,120}?["']\s*\+|\bexecute\(\s*f?["'][^"']*\{/gi },
  { id: 'exec-dinamico', nombre: 'Ejecución de comando con entrada dinámica', re: /\b(?:exec|execSync|system|popen|os\.system|subprocess\.(?:call|run|Popen))\s*\([^)\n]*(?:\+|\$\{|%s|f["'])/g },
  { id: 'accion-sin-fijar', nombre: 'Acción de CI referenciada por etiqueta móvil', re: /^\s*uses:\s*[\w.-]+\/[\w.-]+@(?!\b[0-9a-f]{40}\b)[\w.\/-]+/gim },
  { id: 'permisos-amplios-ci', nombre: 'Permisos amplios en pipeline', re: /^\s*permissions:\s*write-all\s*$/gim },
  { id: 'pr-target', nombre: 'Disparador pull_request_target', re: /^\s*(?:-\s*)?pull_request_target\s*:?\s*$/gim },
  { id: 'cidr-abierto', nombre: 'Rango de red abierto a Internet', re: /["']?0\.0\.0\.0\/0["']?|::\/0/g },
  { id: 'contenedor-privilegiado', nombre: 'Contenedor privilegiado', re: /^\s*privileged:\s*true\s*$/gim },
  { id: 'run-as-root', nombre: 'Ejecución como root', re: /^\s*runAsUser:\s*0\s*$/gim },
  { id: 'tls-desactivado', nombre: 'Verificación TLS desactivada', re: /\b(?:rejectUnauthorized\s*:\s*false|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true|curl\s+(?:-k|--insecure)\b)/g },
  { id: 'debug-produccion', nombre: 'Modo depuración activado', re: /^\s*(?:DEBUG|debug)\s*[:=]\s*(?:true|True|1)\s*$/gm }
];

const FICHEROS_SENSIBLES = [
  { re: /(^|\/)\.env(\.|$)/i, nombre: 'Fichero de variables de entorno versionado' },
  { re: /(^|\/)id_(?:rsa|dsa|ecdsa|ed25519)$/i, nombre: 'Clave SSH privada' },
  { re: /\.(?:pem|key|p12|pfx|jks|keystore)$/i, nombre: 'Material criptográfico' },
  { re: /(^|\/)\.npmrc$|(^|\/)\.pypirc$|(^|\/)\.netrc$/i, nombre: 'Fichero de credenciales de gestor de paquetes' },
  { re: /(^|\/)(?:credentials|secrets?)\.(?:json|yaml|yml|ini|cfg)$/i, nombre: 'Fichero de credenciales' },
  { re: /\.(?:kdbx|ovpn)$/i, nombre: 'Fichero de acceso o contraseñas' }
];

const MANIFIESTOS = [
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'requirements.txt', 'Pipfile', 'Pipfile.lock', 'poetry.lock', 'pyproject.toml',
  'go.mod', 'go.sum', 'pom.xml', 'build.gradle', 'build.gradle.kts',
  'Gemfile', 'Gemfile.lock', 'composer.json', 'composer.lock', 'Cargo.toml', 'Cargo.lock'
];

const GOBIERNO = [
  '.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS',
  '.github/dependabot.yml', '.github/dependabot.yaml',
  'SECURITY.md', '.github/SECURITY.md',
  '.gitignore', '.pre-commit-config.yaml', 'renovate.json'
];

/* ------------------------------------------------------------------ utilidades */

function ejecutar(comando, argumentos, opciones = {}) {
  return new Promise((resolve, reject) => {
    execFile(comando, argumentos, {
      timeout: opciones.timeout || LIMITES.timeoutGitMs,
      maxBuffer: 16 * 1024 * 1024,
      cwd: opciones.cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
        GCM_INTERACTIVE: 'never'
      }
    }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = String(stderr || '');
        return reject(error);
      }
      resolve(String(stdout || ''));
    });
  });
}

/** Enmascara un valor sensible dejando visibles solo los primeros caracteres. */
function enmascarar(valor, visibles = 4) {
  const texto = String(valor);
  if (texto.length <= visibles) return '*'.repeat(texto.length);
  return texto.slice(0, visibles) + '*'.repeat(Math.min(24, texto.length - visibles));
}

/** Enmascara las coincidencias de patrones sensibles dentro de una línea de código. */
function enmascararLinea(linea, coincidencia) {
  const recorte = linea.length > 240 ? linea.slice(0, 240) + '…' : linea;
  if (!coincidencia) return recorte.trim();
  return recorte.replace(coincidencia, enmascarar(coincidencia)).trim();
}

function esBinario(buffer) {
  const limite = Math.min(buffer.length, 8000);
  for (let i = 0; i < limite; i++) if (buffer[i] === 0) return true;
  return false;
}

/* ------------------------------------------------------------------- recorrido */

async function listarFicheros(raiz) {
  const resultado = [];
  const pendientes = [''];

  while (pendientes.length && resultado.length < LIMITES.ficherosMax) {
    const relativo = pendientes.shift();
    const absoluto = path.join(raiz, relativo);
    let entradas;
    try {
      entradas = await fs.readdir(absoluto, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entrada of entradas) {
      if (resultado.length >= LIMITES.ficherosMax) break;
      const rel = relativo ? path.posix.join(relativo, entrada.name) : entrada.name;
      if (entrada.isSymbolicLink()) continue;              // no seguimos enlaces
      if (entrada.isDirectory()) {
        if (DIRS_IGNORADOS.has(entrada.name)) continue;
        pendientes.push(rel);
      } else if (entrada.isFile()) {
        let stat;
        try { stat = await fs.stat(path.join(raiz, rel)); } catch { continue; }
        resultado.push({ ruta: rel, bytes: stat.size });
      }
    }
  }
  return resultado;
}

/* ----------------------------------------------------------------- escaneo */

async function escanearPatrones(raiz, ficheros) {
  const coincidencias = [];

  for (const fichero of ficheros) {
    if (coincidencias.length >= LIMITES.coincidenciasPorRepo) break;
    if (fichero.bytes > LIMITES.bytesFicheroMax) continue;
    if (EXT_BINARIAS.has(path.extname(fichero.ruta).toLowerCase())) continue;

    let buffer;
    try { buffer = await fs.readFile(path.join(raiz, fichero.ruta)); } catch { continue; }
    if (esBinario(buffer)) continue;

    const contenido = buffer.toString('utf8');
    const lineas = contenido.split(/\r?\n/);

    for (const patron of PATRONES) {
      patron.re.lastIndex = 0;
      let m;
      let porPatron = 0;
      while ((m = patron.re.exec(contenido)) !== null && porPatron < 5) {
        const antes = contenido.slice(0, m.index);
        const numeroLinea = antes.split('\n').length;
        coincidencias.push({
          patron: patron.id,
          patronNombre: patron.nombre,
          sensible: !!patron.sensible,
          ruta: fichero.ruta,
          linea: numeroLinea,
          // Solo se enmascara el material que puede ser un secreto real; los
          // patrones estructurales se muestran íntegros para poder valorarlos.
          extracto: enmascararLinea(lineas[numeroLinea - 1] || m[0], patron.sensible ? m[0] : null)
        });
        porPatron++;
        if (m[0].length === 0) patron.re.lastIndex++;
        if (coincidencias.length >= LIMITES.coincidenciasPorRepo) break;
      }
      if (coincidencias.length >= LIMITES.coincidenciasPorRepo) break;
    }
  }
  return coincidencias;
}

async function leerRecorte(raiz, ruta, maxLineas = 60) {
  try {
    const contenido = await fs.readFile(path.join(raiz, ruta), 'utf8');
    const lineas = contenido.split(/\r?\n/);
    const recorte = lineas.slice(0, maxLineas).join('\n');
    return lineas.length > maxLineas ? recorte + `\n… (${lineas.length - maxLineas} líneas más)` : recorte;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- metadatos git */

async function metadatosGit(raiz, rama) {
  const datos = { rama, commits: [], totalCommits: null, ultimoCommit: null, firmados: null, autores: [] };
  try {
    datos.totalCommits = Number((await ejecutar('git', ['rev-list', '--count', 'HEAD'], { cwd: raiz })).trim());
  } catch { /* histórico superficial */ }

  try {
    const salida = await ejecutar('git', [
      'log', '-30', '--date=short', '--pretty=format:%H%x1f%an <%ae>%x1f%ad%x1f%s%x1f%G?'
    ], { cwd: raiz });
    datos.commits = salida.split('\n').filter(Boolean).map((linea) => {
      const [sha, autor, fecha, asunto, firma] = linea.split('\x1f');
      return { sha, autor, fecha, asunto, firma };
    });
    if (datos.commits.length) {
      datos.ultimoCommit = datos.commits[0];
      const verificados = datos.commits.filter((c) => c.firma === 'G' || c.firma === 'U').length;
      datos.firmados = `${verificados} de ${datos.commits.length} commits recientes con firma verificada`;
      datos.autores = [...new Set(datos.commits.map((c) => c.autor))].slice(0, 10);
    }
  } catch { /* sin histórico accesible */ }

  return datos;
}

async function ultimoCommitDeFichero(raiz, ruta) {
  try {
    const salida = await ejecutar('git', [
      'log', '-1', '--date=short', '--pretty=format:%H%x1f%an <%ae>%x1f%ad%x1f%s', '--', ruta
    ], { cwd: raiz });
    if (!salida.trim()) return null;
    const [sha, autor, fecha, asunto] = salida.split('\x1f');
    return { sha, autor, fecha, asunto, relacion: 'último commit que modificó el fichero' };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ recolección */

/**
 * Clona y recolecta observaciones de un repositorio.
 * Devuelve { ok, repo, observaciones, contexto, error }.
 */
async function recolectar(repo, config) {
  const inicio = Date.now();
  // Sin apartado de alcance: se analiza la rama por defecto del repositorio
  // salvo que la configuración indique una explícitamente.
  const rama = config.rama || '';
  const profundidad = Number(process.env.CRO_PROFUNDIDAD || 80);
  const temporal = await fs.mkdtemp(path.join(os.tmpdir(), 'cro-'));
  const destino = path.join(temporal, 'repo');

  const url = repo.entrada && /^(https?:\/\/|git@|ssh:\/\/)/i.test(repo.entrada)
    ? repo.entrada
    : `https://${repo.host}/${repo.org}/${repo.nombre}.git`;

  const resultado = {
    ok: false,
    repo,
    url,
    clonado: false,
    ramaAnalizada: rama || '(rama por defecto)',
    error: null,
    metricas: { ficherosAnalizados: 0, commitsRevisados: 0, duracionMs: 0, ultimoCommit: null },
    observaciones: []
  };

  try {
    const argumentos = [
      '-c', 'core.hooksPath=/dev/null',       // el repositorio no ejecuta hooks
      '-c', 'credential.helper=',
      'clone', '--quiet', '--no-tags', '--single-branch',
      '--depth', String(profundidad)
    ];
    if (rama) argumentos.push('--branch', rama);
    argumentos.push(url, destino);

    try {
      await ejecutar('git', argumentos, { timeout: LIMITES.timeoutCloneMs });
    } catch (error) {
      if (!rama) throw error;
      // Reintento sin fijar rama: el repositorio puede usar otra rama por defecto.
      const sinRama = argumentos.filter((a, i) => a !== '--branch' && argumentos[i - 1] !== '--branch');
      await ejecutar('git', sinRama, { timeout: LIMITES.timeoutCloneMs });
    }
    resultado.clonado = true;
    resultado.ramaAnalizada = (await ejecutar('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: destino })).trim();

    const ficheros = await listarFicheros(destino);
    const git = await metadatosGit(destino, resultado.ramaAnalizada);
    const coincidencias = await escanearPatrones(destino, ficheros);

    resultado.metricas = {
      ficherosAnalizados: ficheros.length,
      commitsRevisados: git.commits.length,
      duracionMs: Date.now() - inicio,
      ultimoCommit: git.ultimoCommit ? git.ultimoCommit.fecha : null
    };

    /* --- observaciones numeradas: son las únicas evidencias citables --- */
    let contador = 0;
    const nueva = (tipo, datos) => {
      contador += 1;
      resultado.observaciones.push({ id: `OBS-${String(contador).padStart(3, '0')}`, tipo, ...datos });
    };

    for (const c of coincidencias) {
      const commit = await ultimoCommitDeFichero(destino, c.ruta);
      nueva('coincidencia-patron', {
        patron: c.patron,
        descripcion: c.patronNombre,
        materialEnmascarado: c.sensible,
        ruta: c.ruta,
        linea: c.linea,
        extracto: c.extracto,
        commit
      });
    }

    for (const fichero of ficheros) {
      for (const sensible of FICHEROS_SENSIBLES) {
        if (sensible.re.test(fichero.ruta)) {
          nueva('fichero-sensible', {
            descripcion: sensible.nombre,
            ruta: fichero.ruta,
            bytes: fichero.bytes,
            commit: await ultimoCommitDeFichero(destino, fichero.ruta)
          });
          break;
        }
      }
    }

    const rutas = new Set(ficheros.map((f) => f.ruta));
    for (const manifiesto of MANIFIESTOS) {
      if (rutas.has(manifiesto)) {
        nueva('manifiesto-dependencias', {
          descripcion: 'Manifiesto de dependencias',
          ruta: manifiesto,
          contenido: await leerRecorte(destino, manifiesto, 80)
        });
      }
    }

    for (const fichero of ficheros) {
      if (/^\.github\/workflows\/.+\.ya?ml$/.test(fichero.ruta) ||
          /^(?:\.gitlab-ci\.yml|Jenkinsfile|azure-pipelines\.yml|\.circleci\/config\.yml)$/.test(fichero.ruta)) {
        nueva('definicion-pipeline', {
          descripcion: 'Definición de pipeline de CI/CD',
          ruta: fichero.ruta,
          contenido: await leerRecorte(destino, fichero.ruta, 70)
        });
      }
    }

    for (const fichero of ficheros) {
      if (/\.tf$/.test(fichero.ruta) || /^(?:k8s|kubernetes|deploy|helm)\/.+\.ya?ml$/.test(fichero.ruta) ||
          /^Dockerfile(\..+)?$/.test(path.basename(fichero.ruta))) {
        nueva('manifiesto-infraestructura', {
          descripcion: 'Manifiesto de infraestructura como código',
          ruta: fichero.ruta,
          contenido: await leerRecorte(destino, fichero.ruta, 50)
        });
        if (resultado.observaciones.filter((o) => o.tipo === 'manifiesto-infraestructura').length >= 8) break;
      }
    }

    for (const gobierno of GOBIERNO) {
      nueva(rutas.has(gobierno) ? 'fichero-gobierno-presente' : 'fichero-gobierno-ausente', {
        descripcion: rutas.has(gobierno)
          ? `Fichero de gobierno presente: ${gobierno}`
          : `Fichero de gobierno ausente: ${gobierno}`,
        ruta: gobierno,
        contenido: rutas.has(gobierno) ? await leerRecorte(destino, gobierno, 25) : null
      });
    }

    nueva('metadatos-git', {
      descripcion: 'Metadatos del histórico analizado',
      rama: resultado.ramaAnalizada,
      totalCommits: git.totalCommits,
      commitsRecientes: git.commits.slice(0, 12),
      firmaCommits: git.firmados,
      autoresRecientes: git.autores
    });

    nueva('inventario', {
      descripcion: 'Inventario de ficheros analizados',
      totalFicheros: ficheros.length,
      truncado: ficheros.length >= LIMITES.ficherosMax,
      extensionesPrincipales: Object.entries(
        ficheros.reduce((acc, f) => {
          const ext = path.extname(f.ruta).toLowerCase() || '(sin extensión)';
          acc[ext] = (acc[ext] || 0) + 1;
          return acc;
        }, {})
      ).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([ext, n]) => `${ext}: ${n}`)
    });

    resultado.ok = true;
  } catch (error) {
    resultado.error = (error.stderr || error.message || String(error)).trim().slice(0, 400);
  } finally {
    await fs.rm(temporal, { recursive: true, force: true }).catch(() => {});
    resultado.metricas.duracionMs = Date.now() - inicio;
  }

  return resultado;
}

module.exports = { recolectar, enmascarar, LIMITES, PATRONES };
