/*
 * analisis.js — Traduce la solicitud del usuario a una consulta al modelo GLM y
 * convierte su respuesta en el contrato de datos que ya consume la interfaz.
 *
 * Reglas de integridad aplicadas aquí:
 *  - El modelo solo puede fundamentar un hallazgo citando una observación real
 *    recogida por el recolector (OBS-nnn), o declarándolo explícitamente como
 *    hallazgo por ausencia.
 *  - La ruta, la línea y el commit de cada hallazgo NO se toman del texto del
 *    modelo: se resuelven desde la observación citada. Así no puede inventarlos.
 *  - Todo hallazgo que cite una observación inexistente queda marcado como no
 *    verificado en lugar de presentarse como evidencia.
 */
'use strict';

const zai = require('./zai');

const SEVERIDADES = ['critica', 'alta', 'media', 'baja', 'info'];

/* ------------------------------------------------------------------- prompts */

const SISTEMA = `Eres un analista de seguridad ofensiva y defensiva especializado en auditoría de repositorios de código.

Trabajas sobre OBSERVACIONES recogidas automáticamente de un clon real del repositorio. No tienes acceso al repositorio: las observaciones son tu única fuente de verdad.

Reglas de obligado cumplimiento:
1. Todo hallazgo debe citar el identificador de la observación que lo sustenta (campo "observacion": "OBS-nnn").
2. Si el hallazgo consiste en la AUSENCIA de un control y no hay observación que lo respalde, usa "observacion": null y "tipo": "ausencia".
3. No inventes rutas, líneas, commits ni contenidos que no aparezcan en las observaciones. Esos datos se rellenan automáticamente desde la observación citada; no los repitas.
4. Descarta las coincidencias que sean claramente ejemplos de documentación, datos de prueba o marcadores de posición, y decláralas en "descartados" explicando por qué.
5. Si las observaciones no permiten pronunciarse sobre una verificación, decláralo en "limitaciones" en lugar de suponer.
6. Ajusta la severidad a la explotabilidad real evidenciada, no a la gravedad teórica del tipo de fallo.

Respondes SIEMPRE con un único objeto JSON válido, sin texto adicional ni marcas de formato.`;

function esquemaSalida() {
  return `{
  "hallazgos": [
    {
      "titulo": "string, enunciado concreto del problema",
      "severidad": "critica | alta | media | baja | info",
      "check": "identificador de la verificación del control a la que responde",
      "observacion": "OBS-nnn o null",
      "tipo": "evidencia | ausencia",
      "impacto": "string, qué permite hacer a un atacante en este repositorio concreto",
      "recomendacion": "string, acción de remediación concreta",
      "referencia": "string, CWE / OWASP / ISO aplicable",
      "cvss": number entre 0 y 10,
      "confianza": "Alta | Media | Baja",
      "justificacion": "string, por qué la observación citada sustenta este hallazgo"
    }
  ],
  "descartados": [
    { "observacion": "OBS-nnn", "motivo": "string" }
  ],
  "limitaciones": ["string"],
  "valoracionGlobal": "string, dos o tres frases sobre el estado del repositorio respecto al objetivo del control"
}`;
}

function resumirObservaciones(observaciones) {
  return observaciones.map((obs) => {
    const partes = [`${obs.id} [${obs.tipo}] ${obs.descripcion || ''}`.trim()];
    if (obs.ruta) partes.push(`  ruta: ${obs.ruta}${obs.linea ? ':' + obs.linea : ''}`);
    if (obs.patron) partes.push(`  patrón detectado: ${obs.patron}`);
    if (obs.materialEnmascarado) partes.push('  (el material sensible aparece enmascarado)');
    if (obs.extracto) partes.push(`  extracto: ${obs.extracto}`);
    if (obs.commit) partes.push(`  ${obs.commit.relacion}: ${obs.commit.sha.slice(0, 12)} · ${obs.commit.autor} · ${obs.commit.fecha}`);
    if (obs.bytes != null) partes.push(`  tamaño: ${obs.bytes} bytes`);
    if (obs.totalCommits != null) partes.push(`  commits en el histórico clonado: ${obs.totalCommits}`);
    if (obs.firmaCommits) partes.push(`  firma: ${obs.firmaCommits}`);
    if (obs.autoresRecientes && obs.autoresRecientes.length) partes.push(`  autores recientes: ${obs.autoresRecientes.join(', ')}`);
    if (obs.commitsRecientes && obs.commitsRecientes.length) {
      partes.push('  commits recientes:');
      obs.commitsRecientes.slice(0, 8).forEach((c) => {
        partes.push(`    ${c.sha.slice(0, 10)} ${c.fecha} ${c.autor} — ${c.asunto} (firma: ${c.firma || '?'})`);
      });
    }
    if (obs.extensionesPrincipales) partes.push(`  extensiones: ${obs.extensionesPrincipales.join(', ')}`);
    if (obs.totalFicheros != null) partes.push(`  ficheros analizados: ${obs.totalFicheros}${obs.truncado ? ' (truncado)' : ''}`);
    if (obs.contenido) {
      partes.push('  contenido:');
      partes.push(obs.contenido.split('\n').map((l) => '    ' + l).join('\n'));
    }
    return partes.join('\n');
  }).join('\n\n');
}

function construirMensajeUsuario(config, control, checksActivos, recoleccion) {
  const checks = control.checks.filter((c) => checksActivos.includes(c.id));
  const campos = config.camposEvidencia || [];

  const bloques = [];
  bloques.push('## Repositorio analizado');
  bloques.push(`- URL: ${recoleccion.url}`);
  bloques.push(`- Rama analizada: ${recoleccion.ramaAnalizada}`);
  bloques.push(`- Ficheros recorridos: ${recoleccion.metricas.ficherosAnalizados}`);
  bloques.push(`- Commits disponibles en el clon: ${recoleccion.metricas.commitsRevisados}`);
  bloques.push(`- Profundidad solicitada: ${config.profundidad === 'superficial' ? 'solo estado actual (HEAD)' : 'histórico'}`);
  bloques.push('');

  bloques.push('## Control a ejecutar');
  bloques.push(`- ${control.id} — ${control.nombre}`);
  bloques.push(`- Marco de referencia: ${control.marco}`);
  bloques.push('');

  bloques.push('## Objetivo declarado por el solicitante');
  bloques.push(config.objetivo || '(no declarado)');
  bloques.push('');

  bloques.push('## Verificaciones a cubrir');
  checks.forEach((c) => bloques.push(`- ${c.id}: ${c.nombre}`));
  bloques.push('');
  bloques.push('El campo "check" de cada hallazgo debe ser uno de: ' + checks.map((c) => c.id).join(', '));
  bloques.push('');

  bloques.push('## Enfoque de la prueba solicitado');
  bloques.push(config.prompt || '(no declarado)');
  bloques.push('');

  bloques.push('## Evidencia esperada');
  bloques.push('El solicitante requiere que cada hallazgo permita documentar: ' +
    (campos.length ? campos.join(', ') : 'ubicación e impacto') + '.');
  if (config.criterioAceptacion) {
    bloques.push(`Criterio de aceptación del control: ${config.criterioAceptacion}`);
  }
  bloques.push('');

  bloques.push('## Observaciones recogidas del repositorio');
  if (!recoleccion.observaciones.length) {
    bloques.push('(no se recogió ninguna observación)');
  } else {
    bloques.push(resumirObservaciones(recoleccion.observaciones));
  }
  bloques.push('');

  bloques.push('## Formato de respuesta');
  bloques.push('Devuelve exclusivamente un objeto JSON con esta forma:');
  bloques.push(esquemaSalida());

  let texto = bloques.join('\n');
  const limite = Number(process.env.CRO_MAX_PROMPT || 120000);
  if (texto.length > limite) {
    texto = texto.slice(0, limite) + '\n\n[contexto truncado por tamaño]';
  }
  return texto;
}

/* ------------------------------------------------------- parseo de la respuesta */

/** Extrae el objeto JSON de la respuesta aunque venga envuelto en texto o vallas. */
function extraerJson(texto) {
  const limpio = texto.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(limpio);
  } catch { /* se intenta localizar el objeto */ }

  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (inicio !== -1 && fin > inicio) {
    try {
      return JSON.parse(limpio.slice(inicio, fin + 1));
    } catch { /* irrecuperable */ }
  }
  return null;
}

function normalizarSeveridad(valor) {
  const v = String(valor || '').toLowerCase().trim();
  const equivalencias = {
    critical: 'critica', crítica: 'critica', critica: 'critica',
    high: 'alta', alta: 'alta',
    medium: 'media', media: 'media', moderate: 'media',
    low: 'baja', baja: 'baja',
    informational: 'info', info: 'info', informativa: 'info'
  };
  return equivalencias[v] || (SEVERIDADES.includes(v) ? v : 'media');
}

function idHallazgo(repoId, titulo, indice) {
  let h = 2166136261 >>> 0;
  const cadena = `${repoId}|${titulo}|${indice}`;
  for (let i = 0; i < cadena.length; i++) {
    h ^= cadena.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return 'H-' + String(h % 100000).padStart(5, '0');
}

/**
 * Convierte la respuesta del modelo en hallazgos con evidencia resuelta desde
 * las observaciones reales.
 */
function materializarHallazgos(bruto, recoleccion, control, checksActivos) {
  const porId = new Map(recoleccion.observaciones.map((o) => [o.id, o]));
  const nombreCheck = new Map(control.checks.map((c) => [c.id, c.nombre]));
  const lista = Array.isArray(bruto.hallazgos) ? bruto.hallazgos : [];

  return lista.map((h, indice) => {
    const observacion = h.observacion ? porId.get(String(h.observacion).trim().toUpperCase()) : null;
    const citaInvalida = Boolean(h.observacion) && !observacion;
    const check = checksActivos.includes(h.check) ? h.check : checksActivos[0];

    // Ubicación y commit se toman de la observación, nunca del texto del modelo.
    const commit = observacion && observacion.commit ? observacion.commit : null;

    return {
      id: idHallazgo(recoleccion.repo.id || recoleccion.url, h.titulo || 'hallazgo', indice),
      titulo: String(h.titulo || 'Hallazgo sin título').slice(0, 300),
      severidad: normalizarSeveridad(h.severidad),
      control: control.id,
      check,
      checkNombre: nombreCheck.get(check) || check,
      repo: recoleccion.repo.etiqueta,
      archivo: observacion && observacion.ruta ? observacion.ruta : '(sin fichero asociado)',
      linea: observacion && observacion.linea ? observacion.linea : 0,
      commit: commit ? commit.sha : '',
      commitRelacion: commit ? commit.relacion : '',
      autor: commit ? commit.autor : '',
      fecha: commit ? commit.fecha : '',
      rama: recoleccion.ramaAnalizada,
      snippet: observacion
        ? (observacion.extracto || (observacion.contenido ? observacion.contenido.slice(0, 600) : observacion.descripcion || ''))
        : '(hallazgo por ausencia de control: no hay fragmento asociado)',
      impacto: String(h.impacto || '').slice(0, 1200),
      recomendacion: String(h.recomendacion || '').slice(0, 1200),
      referencia: String(h.referencia || '').slice(0, 200),
      cvss: Number.isFinite(Number(h.cvss)) ? Math.min(10, Math.max(0, Number(h.cvss))) : null,
      estado: 'Abierto',
      confianza: citaInvalida ? 'Baja' : (['Alta', 'Media', 'Baja'].includes(h.confianza) ? h.confianza : 'Media'),
      // Trazabilidad del origen de cada dato:
      origen: observacion ? 'observación ' + observacion.id : (h.tipo === 'ausencia' ? 'ausencia de control' : 'sin observación'),
      verificado: Boolean(observacion) || h.tipo === 'ausencia',
      justificacion: String(h.justificacion || '').slice(0, 800),
      advertencia: citaInvalida
        ? `El modelo citó la observación ${h.observacion}, que no existe en la recolección. Hallazgo no verificado.`
        : null
    };
  });
}

/**
 * Ejecuta el análisis real de un repositorio: recolección + modelo.
 * Devuelve el bloque de resultado por repositorio que consume la interfaz.
 */
async function analizarRepositorio({ repo, config, control, checksActivos, recoleccion }) {
  if (!recoleccion.ok) {
    return {
      repo,
      error: recoleccion.error,
      hallazgos: [],
      metricas: recoleccion.metricas,
      observaciones: [],
      analisis: null
    };
  }

  const mensajes = [
    { role: 'system', content: SISTEMA },
    { role: 'user', content: construirMensajeUsuario(config, control, checksActivos, recoleccion) }
  ];

  const respuesta = await zai.chat(mensajes, { jsonEstricto: true, temperatura: 0.15 });
  const bruto = extraerJson(respuesta.texto);

  if (!bruto) {
    throw new zai.ErrorModelo('No se pudo interpretar la respuesta del modelo como JSON', {
      fragmento: respuesta.texto.slice(0, 600)
    });
  }

  const hallazgos = materializarHallazgos(bruto, recoleccion, control, checksActivos);

  return {
    repo,
    error: null,
    hallazgos,
    metricas: {
      ...recoleccion.metricas,
      duracionModeloMs: respuesta.duracionMs,
      tokens: respuesta.uso || null
    },
    observaciones: recoleccion.observaciones.map((o) => ({
      id: o.id, tipo: o.tipo, descripcion: o.descripcion, ruta: o.ruta || null, linea: o.linea || null
    })),
    analisis: {
      modelo: respuesta.modelo,
      valoracionGlobal: String(bruto.valoracionGlobal || '').slice(0, 2000),
      descartados: Array.isArray(bruto.descartados) ? bruto.descartados.slice(0, 50) : [],
      limitaciones: Array.isArray(bruto.limitaciones) ? bruto.limitaciones.slice(0, 20) : [],
      razonFin: respuesta.razonFin
    }
  };
}

module.exports = { analizarRepositorio, extraerJson, materializarHallazgos, construirMensajeUsuario, SISTEMA };
