#!/usr/bin/env node
/*
 * server.js — Servidor local de CRO-Asistant.
 *
 *  - Sirve la aplicación estática.
 *  - Expone el API de análisis real: recolección desde el repositorio + GLM.
 *
 * La clave del modelo vive únicamente aquí (variable de entorno ZAI_API_KEY).
 * El navegador nunca la recibe: por eso el modo real necesita este servidor y
 * no se resuelve con una llamada directa desde la página.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const zai = require('./zai');
const { recolectar } = require('./recolector');
const { analizarRepositorio } = require('./analisis');

const RAIZ = path.resolve(__dirname, '..');

/* ------------------------------------------------- carga de .env (sin dependencias) */

function cargarEnv() {
  const fichero = path.join(RAIZ, '.env');
  if (!fs.existsSync(fichero)) return;
  const contenido = fs.readFileSync(fichero, 'utf8');
  for (const linea of contenido.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const separador = limpia.indexOf('=');
    if (separador === -1) continue;
    const clave = limpia.slice(0, separador).trim();
    let valor = limpia.slice(separador + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    if (!(clave in process.env)) process.env[clave] = valor;
  }
}

// Se carga antes de leer cualquier variable de configuración.
cargarEnv();

const PUERTO = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';

/* ------------------------------------------------------------ ficheros estáticos */

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

async function servirEstatico(req, res, rutaUrl) {
  const relativa = decodeURIComponent(rutaUrl.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const destino = path.resolve(RAIZ, relativa);

  // Impide salir del directorio de la aplicación.
  if (destino !== RAIZ && !destino.startsWith(RAIZ + path.sep)) {
    return responder(res, 403, { error: 'Ruta no permitida' });
  }

  try {
    const stat = await fsp.stat(destino);
    const fichero = stat.isDirectory() ? path.join(destino, 'index.html') : destino;
    const contenido = await fsp.readFile(fichero);
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(fichero).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(contenido);
  } catch {
    responder(res, 404, { error: 'No encontrado: ' + relativa });
  }
}

/* ------------------------------------------------------------------- utilidades */

function responder(res, codigo, datos) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(cuerpo)
  });
  res.end(cuerpo);
}

function leerCuerpo(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const trozos = [];
    let total = 0;
    req.on('data', (t) => {
      total += t.length;
      if (total > maxBytes) {
        reject(new Error('Cuerpo de la petición demasiado grande'));
        req.destroy();
        return;
      }
      trozos.push(t);
    });
    req.on('end', () => {
      try {
        resolve(trozos.length ? JSON.parse(Buffer.concat(trozos).toString('utf8')) : {});
      } catch (error) {
        reject(new Error('JSON inválido en la petición: ' + error.message));
      }
    });
    req.on('error', reject);
  });
}

function validarPeticionAnalisis(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object') return 'Petición vacía';
  if (!cuerpo.repo || !cuerpo.repo.etiqueta) return 'Falta el repositorio';
  if (!cuerpo.control || !Array.isArray(cuerpo.control.checks)) return 'Falta la definición del control';
  if (!Array.isArray(cuerpo.checks) || !cuerpo.checks.length) return 'No se indicaron verificaciones';
  if (!cuerpo.config) return 'Falta la configuración del control';
  return null;
}

function registrar(...partes) {
  console.log(new Date().toISOString().slice(11, 19), ...partes);
}

/* ------------------------------------------------------------------ manejadores */

async function manejarAnalizarRepo(req, res) {
  const cuerpo = await leerCuerpo(req);
  const error = validarPeticionAnalisis(cuerpo);
  if (error) return responder(res, 400, { error });

  const { repo, config, control, checks } = cuerpo;
  const clonar = process.env.CRO_CLONAR !== '0';

  registrar(`▶ análisis real: ${repo.etiqueta} · ${control.id}`);

  let recoleccion;
  if (clonar) {
    recoleccion = await recolectar(repo, config);
    registrar(`  recolección: ${recoleccion.ok ? recoleccion.observaciones.length + ' observaciones' : 'ERROR ' + recoleccion.error}`);
  } else {
    recoleccion = {
      ok: true, repo, url: repo.entrada, clonado: false,
      ramaAnalizada: config.rama || 'main',
      metricas: { ficherosAnalizados: 0, commitsRevisados: 0, duracionMs: 0, ultimoCommit: null },
      observaciones: []
    };
  }

  if (!recoleccion.ok) {
    return responder(res, 200, {
      repo, error: `No se pudo clonar el repositorio: ${recoleccion.error}`,
      hallazgos: [], metricas: recoleccion.metricas, observaciones: [], analisis: null
    });
  }

  try {
    const resultado = await analizarRepositorio({
      repo, config, control, checksActivos: checks, recoleccion
    });
    registrar(`  modelo: ${resultado.analisis ? resultado.analisis.modelo : '—'} · ${resultado.hallazgos.length} hallazgos`);
    responder(res, 200, resultado);
  } catch (err) {
    registrar(`  ERROR del modelo: ${err.message}`);
    responder(res, 502, {
      error: err.message,
      detalle: err.detalle || null,
      repo,
      observacionesRecogidas: recoleccion.observaciones.length
    });
  }
}

/* ---------------------------------------------------------------------- rutas */

async function enrutar(req, res) {
  const url = req.url || '/';

  if (url === '/api/estado' && req.method === 'GET') {
    return responder(res, 200, {
      ok: true,
      aplicacion: 'CRO-Asistant',
      modoRealDisponible: zai.configurado(),
      clonadoActivo: process.env.CRO_CLONAR !== '0',
      modelo: zai.estado()
    });
  }

  if (url === '/api/comprobar' && req.method === 'POST') {
    try {
      return responder(res, 200, await zai.comprobar());
    } catch (err) {
      return responder(res, 502, { ok: false, error: err.message, detalle: err.detalle || null });
    }
  }

  if (url === '/api/analizar-repo' && req.method === 'POST') {
    return manejarAnalizarRepo(req, res);
  }

  if (url.startsWith('/api/')) {
    return responder(res, 404, { error: 'Endpoint no encontrado' });
  }

  return servirEstatico(req, res, url);
}

/* -------------------------------------------------------------------- arranque */

const servidor = http.createServer((req, res) => {
  enrutar(req, res).catch((error) => {
    registrar('ERROR no controlado:', error.message);
    if (!res.headersSent) responder(res, 500, { error: error.message });
    else res.end();
  });
});

// Clonar y consultar al modelo puede llevar minutos.
servidor.requestTimeout = 0;
servidor.headersTimeout = 0;
servidor.timeout = 0;

servidor.listen(PUERTO, HOST, () => {
  const estado = zai.estado();
  console.log('');
  console.log('  CRO-Asistant');
  console.log(`  → http://${HOST}:${PUERTO}`);
  console.log('');
  console.log(`  Modo real .......... ${estado.configurado ? 'DISPONIBLE' : 'no disponible (falta ZAI_API_KEY)'}`);
  console.log(`  Modelo ............. ${estado.modelo}`);
  console.log(`  Endpoint ........... ${estado.endpoint}`);
  if (estado.configurado) console.log(`  Clave .............. ${estado.claveHuella}`);
  console.log(`  Clonado de repos ... ${process.env.CRO_CLONAR !== '0' ? 'activado' : 'desactivado'}`);
  console.log('');
});
