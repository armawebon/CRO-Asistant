/*
 * zai.js — Cliente del API de Z.AI (GLM), compatible con el formato
 * OpenAI `chat/completions`.
 *
 * La clave se lee SIEMPRE de la variable de entorno ZAI_API_KEY y nunca se
 * envía al navegador ni se registra en las trazas.
 */
'use strict';

const CONFIG = () => ({
  baseUrl: (process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4').replace(/\/+$/, ''),
  modelo: process.env.ZAI_MODEL || 'glm-5.2',
  clave: process.env.ZAI_API_KEY || '',
  timeoutMs: Number(process.env.ZAI_TIMEOUT_MS || 180000)
});

class ErrorModelo extends Error {
  constructor(mensaje, detalle) {
    super(mensaje);
    this.name = 'ErrorModelo';
    this.detalle = detalle || null;
  }
}

function configurado() {
  return Boolean(CONFIG().clave);
}

function estado() {
  const c = CONFIG();
  return {
    configurado: Boolean(c.clave),
    modelo: c.modelo,
    endpoint: c.baseUrl + '/chat/completions',
    // Solo se expone una huella de la clave, nunca su valor.
    claveHuella: c.clave ? `${c.clave.slice(0, 4)}…${c.clave.slice(-4)} (${c.clave.length} car.)` : null
  };
}

/**
 * Envía una conversación al modelo y devuelve { texto, uso, modelo, duracionMs }.
 */
async function chat(mensajes, opciones = {}) {
  const c = CONFIG();
  if (!c.clave) {
    throw new ErrorModelo(
      'No hay clave de API configurada. Exporta ZAI_API_KEY antes de arrancar el servidor.'
    );
  }

  const cuerpo = {
    model: opciones.modelo || c.modelo,
    messages: mensajes,
    temperature: opciones.temperatura ?? 0.2,
    max_tokens: opciones.maxTokens ?? 8000,
    stream: false
  };
  if (opciones.jsonEstricto) cuerpo.response_format = { type: 'json_object' };

  const inicio = Date.now();
  let respuesta;
  try {
    respuesta = await fetch(c.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.clave}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(opciones.timeoutMs || c.timeoutMs)
    });
  } catch (error) {
    throw new ErrorModelo(
      `No se pudo contactar con el API del modelo (${c.baseUrl}): ${error.message}`,
      { causa: error.name }
    );
  }

  const textoCrudo = await respuesta.text();

  if (!respuesta.ok) {
    // El mensaje del proveedor se propaga tal cual: si el modelo solicitado no
    // existe o la clave no es válida, quien usa la aplicación debe verlo.
    throw new ErrorModelo(
      `El API del modelo devolvió HTTP ${respuesta.status}`,
      { estado: respuesta.status, cuerpo: textoCrudo.slice(0, 1200), modeloSolicitado: cuerpo.model }
    );
  }

  let datos;
  try {
    datos = JSON.parse(textoCrudo);
  } catch {
    throw new ErrorModelo('La respuesta del modelo no es JSON válido', { cuerpo: textoCrudo.slice(0, 600) });
  }

  const eleccion = datos.choices && datos.choices[0];
  const texto = eleccion && eleccion.message
    ? (eleccion.message.content || '')
    : '';

  if (!texto.trim()) {
    throw new ErrorModelo('El modelo devolvió una respuesta vacía', {
      razonFin: eleccion ? eleccion.finish_reason : null
    });
  }

  return {
    texto,
    modelo: datos.model || cuerpo.model,
    uso: datos.usage || null,
    razonFin: eleccion ? eleccion.finish_reason : null,
    duracionMs: Date.now() - inicio
  };
}

/** Llamada mínima para verificar credenciales, modelo y conectividad. */
async function comprobar() {
  const inicio = Date.now();
  const respuesta = await chat(
    [{ role: 'user', content: 'Responde únicamente con la palabra: OK' }],
    { maxTokens: 16, temperatura: 0, timeoutMs: 30000 }
  );
  return {
    ok: true,
    modelo: respuesta.modelo,
    respuesta: respuesta.texto.trim().slice(0, 40),
    duracionMs: Date.now() - inicio
  };
}

module.exports = { chat, comprobar, estado, configurado, ErrorModelo, CONFIG };
