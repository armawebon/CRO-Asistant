/*
 * analisis.js — Traduce la solicitud del usuario a una consulta al modelo GLM y
 * convierte su respuesta en el contrato de datos que consume la interfaz.
 *
 * El modelo evalúa un requisito de control sobre un repositorio: valora cada
 * criterio de aceptación y aporta la evidencia que lo sustenta.
 *
 * Reglas de integridad aplicadas aquí:
 *  - Cada evidencia debe citar una observación real recogida del repositorio
 *    (OBS-nnn), o declararse explícitamente como evidencia por ausencia.
 *  - La ruta, la línea y el commit NO se toman del texto del modelo: se
 *    resuelven desde la observación citada, de modo que no puede inventarlos.
 *  - Una evidencia que cite una observación inexistente queda marcada como no
 *    verificable en lugar de presentarse como prueba.
 *  - El veredicto no lo dicta el modelo: lo deriva la aplicación de la
 *    evaluación de los criterios (basta un criterio incumplido).
 */
'use strict';

const zai = require('./zai');

const RESULTADOS = ['cumple', 'no cumple', 'no evaluable'];

/* ------------------------------------------------------------------- prompts */

const SISTEMA = `Eres un auditor de seguridad especializado en verificar requisitos de control sobre repositorios de código.

Trabajas sobre OBSERVACIONES recogidas automáticamente de un clon real del repositorio. No tienes acceso al repositorio: las observaciones son tu única fuente de verdad.

Tu tarea es evaluar UN requisito de control valorando, uno a uno, sus criterios de aceptación.

Reglas de obligado cumplimiento:
1. Valora cada criterio con exactamente uno de estos resultados: "cumple", "no cumple" o "no evaluable".
2. Usa "no evaluable" cuando las observaciones no permitan pronunciarte. No supongas ni des por bueno lo que no puedas ver: un criterio sin evidencia es "no evaluable", nunca "cumple".
3. Toda evidencia que aportes debe citar el identificador de la observación que la sustenta (campo "observacion": "OBS-nnn").
4. Si la evidencia consiste en la AUSENCIA de algo, usa "observacion": null y "tipo": "ausencia".
5. No inventes rutas, líneas, commits ni contenidos que no aparezcan en las observaciones. Esos datos se rellenan automáticamente desde la observación citada; no los repitas.
6. Recuerda que buena parte de estos requisitos se acreditan con documentación, configuración de plataforma o capturas que NO están en el repositorio. Cuando sea así, dilo en "limitaciones" y valora el criterio como "no evaluable" en lugar de forzar una conclusión.
7. La explicación debe ser breve y concreta: qué falta o qué se ha desviado.

Respondes SIEMPRE con un único objeto JSON válido, sin texto adicional ni marcas de formato.`;

function esquemaSalida() {
  return `{
  "criterios": [
    {
      "indice": number, el número del criterio tal como se te presenta,
      "resultado": "cumple | no cumple | no evaluable",
      "justificacion": "string, una o dos frases explicando la valoración"
    }
  ],
  "evidencias": [
    {
      "observacion": "OBS-nnn o null",
      "tipo": "evidencia | ausencia",
      "descripcion": "string, qué acredita esta evidencia respecto al requisito",
      "cumple": true si respalda el cumplimiento, false si evidencia una desviación
    }
  ],
  "explicacion": "string, breve, obligatoria si algún criterio no se cumple o no es evaluable",
  "limitaciones": ["string, qué no se ha podido verificar con el repositorio y dónde estaría esa evidencia"]
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

function construirMensajeUsuario(config, requisito, recoleccion) {
  const bloques = [];

  bloques.push('## Repositorio analizado');
  bloques.push(`- URL: ${recoleccion.url}`);
  bloques.push(`- Rama analizada: ${recoleccion.ramaAnalizada}`);
  bloques.push(`- Ficheros recorridos: ${recoleccion.metricas.ficherosAnalizados}`);
  bloques.push(`- Commits disponibles en el clon: ${recoleccion.metricas.commitsRevisados}`);
  bloques.push('');

  bloques.push('## Requisito a evaluar');
  bloques.push(`- ${requisito.id}: ${requisito.enunciado}`);
  bloques.push('');

  bloques.push('## Objetivo de la evidencia');
  bloques.push(requisito.objetivo || '(no declarado)');
  bloques.push('');

  bloques.push('## Explicación de la evidencia esperada por el catálogo');
  bloques.push(requisito.explicacion || '(no declarada)');
  bloques.push('');

  bloques.push('## Forma de la evidencia solicitada por el solicitante');
  bloques.push(config.evidenciaEsperada || '(no declarada)');
  bloques.push('');

  bloques.push('## Criterios de aceptación a valorar');
  (requisito.criterios || []).forEach((c, i) => bloques.push(`${i + 1}. ${c}`));
  bloques.push('');
  bloques.push('Devuelve una entrada por cada criterio, usando su número como "indice".');
  bloques.push('');

  bloques.push('## Observaciones recogidas del repositorio');
  bloques.push(recoleccion.observaciones.length
    ? resumirObservaciones(recoleccion.observaciones)
    : '(no se recogió ninguna observación)');
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

function normalizarResultado(valor) {
  const v = String(valor || '').toLowerCase().trim();
  const equivalencias = {
    'cumple': 'cumple', 'pass': 'cumple', 'conforme': 'cumple', 'cumplido': 'cumple',
    'no cumple': 'no cumple', 'fail': 'no cumple', 'incumple': 'no cumple', 'no conforme': 'no cumple',
    'no evaluable': 'no evaluable', 'n/a': 'no evaluable', 'sin evidencia': 'no evaluable',
    'no aplicable': 'no evaluable', 'indeterminado': 'no evaluable'
  };
  // Un resultado no reconocido nunca se interpreta como cumplimiento.
  return equivalencias[v] || (RESULTADOS.includes(v) ? v : 'no evaluable');
}

function idEvidencia(semilla, indice) {
  let h = 2166136261 >>> 0;
  const cadena = `${semilla}|${indice}`;
  for (let i = 0; i < cadena.length; i++) {
    h ^= cadena.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return 'EV-' + String(h % 100000).padStart(5, '0');
}

/**
 * Alinea la valoración del modelo con los criterios del requisito.
 * Un criterio que el modelo no valore queda como "no evaluable".
 */
function materializarCriterios(bruto, requisito) {
  const porIndice = new Map();
  (Array.isArray(bruto.criterios) ? bruto.criterios : []).forEach((c) => {
    const indice = Number(c.indice);
    if (Number.isInteger(indice)) porIndice.set(indice, c);
  });

  return (requisito.criterios || []).map((texto, i) => {
    const valoracion = porIndice.get(i + 1);
    return {
      indice: i + 1,
      criterio: texto,
      resultado: valoracion ? normalizarResultado(valoracion.resultado) : 'no evaluable',
      justificacion: valoracion
        ? String(valoracion.justificacion || '').slice(0, 800)
        : 'El modelo no se pronunció sobre este criterio.'
    };
  });
}

/** Ancla cada evidencia a la observación citada. */
function materializarEvidencias(bruto, recoleccion) {
  const porId = new Map(recoleccion.observaciones.map((o) => [o.id, o]));
  const lista = Array.isArray(bruto.evidencias) ? bruto.evidencias : [];

  return lista.map((e, indice) => {
    const clave = e.observacion ? String(e.observacion).trim().toUpperCase() : null;
    const observacion = clave ? porId.get(clave) : null;
    const citaInvalida = Boolean(clave) && !observacion;
    const commit = observacion && observacion.commit ? observacion.commit : null;

    return {
      id: idEvidencia(recoleccion.repo.id || recoleccion.url, indice),
      repo: recoleccion.repo.etiqueta,
      descripcion: String(e.descripcion || 'Evidencia sin descripción').slice(0, 1000),
      // Ubicación y commit se toman de la observación, nunca del texto del modelo.
      ruta: observacion && observacion.ruta ? observacion.ruta : '',
      linea: observacion && observacion.linea ? observacion.linea : 0,
      commit: commit ? commit.sha : '',
      commitRelacion: commit ? commit.relacion : '',
      autor: commit ? commit.autor : '',
      fecha: commit ? commit.fecha : '',
      extracto: observacion
        ? (observacion.extracto || (observacion.contenido ? observacion.contenido.slice(0, 600) : ''))
        : '',
      cumple: e.cumple !== false,
      origen: observacion
        ? 'observación ' + observacion.id
        : (e.tipo === 'ausencia' ? 'ausencia constatada en el repositorio' : 'sin observación'),
      verificado: Boolean(observacion) || e.tipo === 'ausencia',
      advertencia: citaInvalida
        ? `El modelo citó la observación ${e.observacion}, que no existe en la recolección. Evidencia no verificable.`
        : null
    };
  });
}

/**
 * Evalúa un repositorio frente al requisito: recolección + modelo.
 * Devuelve el bloque por repositorio que consume la interfaz.
 */
async function analizarRepositorio({ repo, config, requisito, recoleccion }) {
  if (!recoleccion.ok) {
    return {
      repo,
      error: recoleccion.error,
      criterios: [],
      evidencias: [],
      metricas: recoleccion.metricas,
      observaciones: [],
      analisis: null
    };
  }

  const mensajes = [
    { role: 'system', content: SISTEMA },
    { role: 'user', content: construirMensajeUsuario(config, requisito, recoleccion) }
  ];

  const respuesta = await zai.chat(mensajes, { jsonEstricto: true, temperatura: 0.15 });
  const bruto = extraerJson(respuesta.texto);

  if (!bruto) {
    throw new zai.ErrorModelo('No se pudo interpretar la respuesta del modelo como JSON', {
      fragmento: respuesta.texto.slice(0, 600)
    });
  }

  return {
    repo,
    error: null,
    criterios: materializarCriterios(bruto, requisito),
    evidencias: materializarEvidencias(bruto, recoleccion),
    explicacion: String(bruto.explicacion || '').slice(0, 2000),
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
      limitaciones: Array.isArray(bruto.limitaciones) ? bruto.limitaciones.slice(0, 20) : [],
      razonFin: respuesta.razonFin
    }
  };
}

module.exports = {
  analizarRepositorio,
  extraerJson,
  materializarCriterios,
  materializarEvidencias,
  construirMensajeUsuario,
  SISTEMA
};
