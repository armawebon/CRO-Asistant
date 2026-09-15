/*
 * real-engine.js — Motor de análisis REAL.
 *
 * Delega en el servidor local (server/server.js), que clona el repositorio,
 * recoge evidencia verificable y la envía al modelo GLM de Z.AI para su
 * análisis. La clave del API nunca llega al navegador.
 *
 * Produce exactamente el mismo objeto de ejecución que el motor simulado, de
 * modo que la interfaz y los generadores de evidencia no distinguen el origen.
 */
(function (global) {
  'use strict';

  var CRO = (global.CRO = global.CRO || {});

  var estadoBackend = {
    consultado: false,
    disponible: false,
    modoRealDisponible: false,
    clonadoActivo: true,
    modelo: null,
    error: null
  };

  function esOrigenServido() {
    return global.location && /^https?:$/.test(global.location.protocol);
  }

  /** Consulta al servidor si el modo real está operativo. */
  function consultarEstado() {
    estadoBackend.consultado = true;

    if (!esOrigenServido()) {
      estadoBackend.disponible = false;
      estadoBackend.error = 'La página está abierta como fichero local (file://). ' +
        'Arranca el servidor con "npm start" para habilitar el modo real.';
      return Promise.resolve(estadoBackend);
    }

    return fetch('/api/estado', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (datos) {
        estadoBackend.disponible = true;
        estadoBackend.modoRealDisponible = !!datos.modoRealDisponible;
        estadoBackend.clonadoActivo = !!datos.clonadoActivo;
        estadoBackend.modelo = datos.modelo || null;
        estadoBackend.error = datos.modoRealDisponible
          ? null
          : 'El servidor está activo pero no tiene ZAI_API_KEY configurada.';
        return estadoBackend;
      })
      .catch(function (error) {
        estadoBackend.disponible = false;
        estadoBackend.error = 'No se pudo contactar con el servidor local: ' + error.message;
        return estadoBackend;
      });
  }

  /** Verifica credenciales y modelo con una llamada mínima al API. */
  function comprobarModelo() {
    return fetch('/api/comprobar', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then(function (r) {
        return r.json().then(function (datos) {
          if (!r.ok) {
            var e = new Error(datos.error || ('HTTP ' + r.status));
            e.detalle = datos.detalle;
            throw e;
          }
          return datos;
        });
      });
  }

  function analizarRepo(repo, config, requisito) {
    return fetch('/api/analizar-repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: repo,
        config: Object.assign({}, config, { repos: undefined }),
        requisito: {
          id: requisito.id,
          enunciado: requisito.enunciado,
          objetivo: requisito.objetivo,
          explicacion: requisito.explicacion,
          criterios: requisito.criterios
        }
      })
    }).then(function (r) {
      return r.json().then(function (datos) {
        if (!r.ok) {
          var e = new Error(datos.error || ('HTTP ' + r.status));
          e.detalle = datos.detalle;
          e.repo = repo;
          throw e;
        }
        return datos;
      });
    });
  }

  /**
   * Ejecuta el control de forma real, repositorio a repositorio.
   * `onProgreso(indice, total, repo)` permite reutilizar el indicador de avance.
   */
  function ejecutar(config, onProgreso) {
    var requisito = CRO.catalog.porId(config.requisitoId);
    if (!requisito) return Promise.reject(new Error('Requisito no encontrado: ' + config.requisitoId));

    var repos = config.repos.slice();
    var resultados = [];
    var inicio = Date.now();
    var modeloUsado = null;

    function siguiente(indice) {
      if (indice >= repos.length) {
        return Promise.resolve(CRO.engine.componerEjecucion({
          config: config,
          requisito: requisito,
          resultados: resultados,
          inicio: inicio,
          modo: 'real',
          modelo: modeloUsado
        }));
      }

      var repo = repos[indice];
      if (onProgreso) onProgreso(indice, repos.length, repo);

      return analizarRepo(repo, config, requisito)
        .then(function (bloque) {
          if (bloque.analisis && bloque.analisis.modelo) modeloUsado = bloque.analisis.modelo;
          resultados.push(CRO.engine.componerResultadoRepo({
            repo: repo,
            criterios: bloque.criterios || [],
            evidencias: bloque.evidencias || [],
            explicacion: bloque.explicacion || '',
            metricas: bloque.metricas || {},
            error: bloque.error || null,
            observaciones: bloque.observaciones || [],
            analisis: bloque.analisis || null
          }));
          return siguiente(indice + 1);
        })
        .catch(function (error) {
          // Un fallo en un repositorio no invalida el resto de la ejecución:
          // queda registrado como error de ese repositorio.
          resultados.push(CRO.engine.componerResultadoRepo({
            repo: repo,
            criterios: [],
            evidencias: [],
            metricas: {},
            error: error.message + (error.detalle && error.detalle.cuerpo
              ? ' — ' + String(error.detalle.cuerpo).slice(0, 300) : '')
          }));
          return siguiente(indice + 1);
        });
    }

    return siguiente(0);
  }

  CRO.engineReal = {
    ejecutar: ejecutar,
    consultarEstado: consultarEstado,
    comprobarModelo: comprobarModelo,
    estado: estadoBackend
  };
})(window);
