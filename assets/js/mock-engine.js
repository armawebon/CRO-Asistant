/*
 * mock-engine.js — Motor de evaluación SIMULADO y composición de resultados.
 *
 * No realiza ninguna conexión de red ni clona repositorios: genera resultados
 * deterministas a partir de un hash de (repositorio + requisito) para que la
 * misma configuración produzca siempre el mismo informe.
 *
 * Las funciones de composición (`componerResultadoRepo`, `componerEjecucion`)
 * las comparte con el motor real, de modo que el veredicto se calcula igual en
 * ambos modos.
 */
(function (global) {
  'use strict';

  var CRO = (global.CRO = global.CRO || {});

  /* ---------------------------------------------------------------- utilidades */

  function hash32(cadena) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < cadena.length; i++) {
      h ^= cadena.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // PRNG determinista (mulberry32)
  function rng(semilla) {
    var a = semilla >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function elegir(azar, lista) {
    return lista[Math.floor(azar() * lista.length) % lista.length];
  }

  function entero(azar, min, max) {
    return min + Math.floor(azar() * (max - min + 1));
  }

  function shaFalso(azar) {
    var hex = '0123456789abcdef';
    var sha = '';
    for (var i = 0; i < 40; i++) sha += hex[Math.floor(azar() * 16)];
    return sha;
  }

  function fechaAtras(azar, maxDias) {
    var d = new Date(Date.now() - entero(azar, 1, maxDias) * 86400000);
    return d.toISOString().slice(0, 10);
  }

  /* -------------------------------------------------- normalización de repos */

  /**
   * Acepta `https://host/org/repo.git`, `git@host:org/repo.git` y `org/repo`.
   */
  function normalizarRepo(entrada) {
    var texto = String(entrada || '').trim().replace(/\/+$/, '');
    if (!texto || texto.charAt(0) === '#') return null;

    var base = { entrada: texto, valido: false, host: '', org: '', nombre: '', motivo: '' };
    var m;

    if ((m = texto.match(/^(?:https?|git):\/\/([^/]+)\/(.+?)(?:\.git)?$/i))) {
      base.host = m[1];
      var partes = m[2].split('/');
      base.nombre = partes.pop();
      base.org = partes.join('/') || '(sin organización)';
      base.valido = !!base.nombre;
    } else if ((m = texto.match(/^[\w.+-]+@([^:]+):(.+?)(?:\.git)?$/))) {
      base.host = m[1];
      var p2 = m[2].split('/');
      base.nombre = p2.pop();
      base.org = p2.join('/') || '(sin organización)';
      base.valido = !!base.nombre;
    } else if ((m = texto.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/))) {
      base.host = 'github.com';
      base.org = m[1];
      base.nombre = m[2];
      base.valido = true;
    } else {
      base.motivo = 'Formato no reconocido. Usa https://host/org/repo, git@host:org/repo u org/repo.';
    }

    if (base.valido) {
      base.id = (base.host + '/' + base.org + '/' + base.nombre).toLowerCase();
      base.etiqueta = base.org + '/' + base.nombre;
    }
    return base;
  }

  function parsearRepos(texto) {
    var lineas = String(texto || '').split(/[\r\n,;]+/);
    var validos = [];
    var invalidos = [];
    var vistos = {};
    for (var i = 0; i < lineas.length; i++) {
      var r = normalizarRepo(lineas[i]);
      if (!r) continue;
      if (!r.valido) { invalidos.push(r); continue; }
      if (vistos[r.id]) continue;
      vistos[r.id] = true;
      validos.push(r);
    }
    return { validos: validos, invalidos: invalidos };
  }

  /* ------------------------------------------------- composición de resultados */

  /**
   * Deriva el veredicto de la evaluación de los criterios de aceptación.
   * Basta un criterio incumplido para que el requisito no sea conforme.
   */
  function veredictoDeCriterios(criterios) {
    if (!criterios || !criterios.length) return 'no-evaluable';
    var incumple = criterios.some(function (c) { return c.resultado === 'no cumple'; });
    if (incumple) return 'no-conforme';
    var noEvaluable = criterios.some(function (c) { return c.resultado === 'no evaluable'; });
    return noEvaluable ? 'no-evaluable' : 'conforme';
  }

  /** Construye la explicación breve que acompaña a un veredicto distinto de conforme. */
  function explicacionDeCriterios(criterios, veredicto) {
    if (veredicto === 'conforme') return '';
    var fallidos = criterios.filter(function (c) { return c.resultado === 'no cumple'; });
    var pendientes = criterios.filter(function (c) { return c.resultado === 'no evaluable'; });
    var partes = [];
    if (fallidos.length) {
      partes.push('Incumple ' + fallidos.length + ' criterio(s): ' +
        fallidos.map(function (c) { return c.justificacion || c.criterio; }).join(' ').trim());
    }
    if (pendientes.length && !fallidos.length) {
      partes.push('No hay evidencia suficiente para valorar ' + pendientes.length + ' criterio(s): ' +
        pendientes.map(function (c) { return c.justificacion || c.criterio; }).join(' ').trim());
    }
    return partes.join(' ');
  }

  /**
   * Bloque de resultado de un repositorio. Lo usan el motor simulado y el real.
   */
  function componerResultadoRepo(datos) {
    var criterios = datos.criterios || [];
    var veredicto = datos.error ? 'no-evaluable' : veredictoDeCriterios(criterios);
    var explicacion = datos.error
      ? datos.error
      : (datos.explicacion || explicacionDeCriterios(criterios, veredicto));

    var bloque = {
      repo: datos.repo,
      veredicto: veredicto,
      explicacion: veredicto === 'conforme' ? '' : explicacion,
      criterios: criterios,
      evidencias: datos.evidencias || [],
      metricas: datos.metricas || {}
    };

    if (datos.error) bloque.error = datos.error;
    if (datos.observaciones) bloque.observaciones = datos.observaciones;
    if (datos.analisis) bloque.analisis = datos.analisis;
    return bloque;
  }

  /** Objeto de ejecución completo a partir de los bloques por repositorio. */
  function componerEjecucion(datos) {
    var resultados = datos.resultados || [];
    var requisito = datos.requisito;
    var modo = datos.modo || 'mock';

    function cuenta(v) {
      return resultados.filter(function (r) { return r.veredicto === v; }).length;
    }

    var evidencias = resultados.reduce(function (acc, r) { return acc.concat(r.evidencias || []); }, []);

    return {
      id: 'EJ-' + new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14),
      fecha: new Date().toISOString(),
      modo: modo,
      simulado: modo === 'mock',
      modelo: datos.modelo || null,
      config: datos.config,
      requisito: {
        id: requisito.id,
        enunciado: requisito.enunciado,
        objetivo: requisito.objetivo,
        explicacion: requisito.explicacion,
        criterios: requisito.criterios
      },
      resultados: resultados,
      resumen: {
        repos: resultados.length,
        conformes: cuenta('conforme'),
        noConformes: cuenta('no-conforme'),
        noEvaluables: cuenta('no-evaluable'),
        errores: resultados.filter(function (r) { return !!r.error; }).length,
        evidencias: evidencias.length,
        noVerificadas: evidencias.filter(function (e) { return e.verificado === false; }).length,
        duracionMs: Date.now() - datos.inicio
      }
    };
  }

  /* ------------------------------------------------------ generación simulada */

  var RUTAS_SIMULADAS = [
    'docs/evidencias/registro.md', 'src/config/seguridad.js', 'infra/terraform/main.tf',
    '.github/workflows/ci.yml', 'src/middleware/guardarrail.js', 'docs/politica-datos.md',
    'src/repositories/cliente-repository.js', 'config/logging.yaml', 'package.json'
  ];

  function generarCriterios(requisito, azar) {
    return requisito.criterios.map(function (texto, i) {
      var tirada = azar();
      var resultado = tirada < 0.58 ? 'cumple' : (tirada < 0.84 ? 'no cumple' : 'no evaluable');
      var justificacion;
      if (resultado === 'cumple') {
        justificacion = 'La evidencia recogida cubre este criterio.';
      } else if (resultado === 'no cumple') {
        justificacion = elegir(azar, [
          'La evidencia aportada no cubre este punto.',
          'Se detecta una desviación respecto a lo exigido.',
          'El control existe pero no se aplica en todas las rutas.'
        ]);
      } else {
        justificacion = 'No se ha localizado evidencia que permita valorarlo.';
      }
      return {
        indice: i + 1,
        criterio: texto,
        resultado: resultado,
        justificacion: justificacion
      };
    });
  }

  function generarEvidencias(repo, requisito, criterios, azar) {
    var cantidad = entero(azar, 1, 3);
    var evidencias = [];
    for (var i = 0; i < cantidad; i++) {
      var ruta = elegir(azar, RUTAS_SIMULADAS);
      evidencias.push({
        id: 'EV-' + (hash32(repo.id + requisito.id + i) % 100000).toString().padStart(5, '0'),
        repo: repo.etiqueta,
        descripcion: elegir(azar, [
          'Se localiza la configuración relacionada con el requisito.',
          'Se identifica el punto del código donde se aplica el control.',
          'Se encuentra documentación que describe el tratamiento aplicado.'
        ]),
        ruta: ruta,
        linea: entero(azar, 3, 420),
        commit: shaFalso(azar),
        autor: elegir(azar, CRO.catalog.autores),
        fecha: fechaAtras(azar, 420),
        extracto: '// fragmento simulado relacionado con ' + requisito.id,
        cumple: azar() < 0.6,
        verificado: true,
        origen: 'generación simulada'
      });
    }
    return evidencias;
  }

  function evaluarRepo(repo, requisito, config) {
    var azar = rng(hash32(repo.id + '|' + requisito.id + '|' + (config.evidenciaEsperada || '')));
    var criterios = generarCriterios(requisito, azar);

    return componerResultadoRepo({
      repo: repo,
      criterios: criterios,
      evidencias: generarEvidencias(repo, requisito, criterios, azar),
      metricas: {
        ficherosAnalizados: entero(azar, 180, 4200),
        commitsRevisados: entero(azar, 240, 9800),
        duracionMs: entero(azar, 1800, 9400),
        ultimoCommit: fechaAtras(azar, 60)
      }
    });
  }

  /**
   * Ejecuta la evaluación simulada. `onProgreso(indice, total, repo)` se invoca
   * antes de evaluar cada repositorio.
   */
  function ejecutar(config, onProgreso) {
    var requisito = CRO.catalog.porId(config.requisitoId);
    if (!requisito) return Promise.reject(new Error('Requisito no encontrado: ' + config.requisitoId));

    var repos = config.repos.slice();
    var resultados = [];
    var inicio = Date.now();

    return new Promise(function (resolve) {
      var i = 0;
      function paso() {
        if (i >= repos.length) {
          resolve(componerEjecucion({
            config: config,
            requisito: requisito,
            resultados: resultados,
            inicio: inicio,
            modo: 'mock'
          }));
          return;
        }
        if (onProgreso) onProgreso(i, repos.length, repos[i]);
        resultados.push(evaluarRepo(repos[i], requisito, config));
        i++;
        setTimeout(paso, 240 + Math.random() * 240);
      }
      paso();
    });
  }

  CRO.engine = {
    parsearRepos: parsearRepos,
    normalizarRepo: normalizarRepo,
    componerResultadoRepo: componerResultadoRepo,
    componerEjecucion: componerEjecucion,
    veredictoDeCriterios: veredictoDeCriterios,
    explicacionDeCriterios: explicacionDeCriterios,
    ejecutar: ejecutar
  };
})(window);
