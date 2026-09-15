/*
 * mock-engine.js — Motor de análisis SIMULADO.
 *
 * No realiza ninguna conexión de red ni clona repositorios: genera resultados
 * deterministas a partir de un hash de (repositorio + control + semilla) para que
 * la misma configuración produzca siempre el mismo informe.
 *
 * El día que exista un backend real, basta con sustituir `ejecutar()` por una
 * llamada al servicio manteniendo la forma del objeto de resultado.
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
    var dias = entero(azar, 1, maxDias);
    var d = new Date(Date.now() - dias * 86400000);
    return d.toISOString().slice(0, 10);
  }

  /* -------------------------------------------------- normalización de repos */

  /**
   * Acepta `https://host/org/repo.git`, `git@host:org/repo.git` y `org/repo`.
   * Devuelve { entrada, valido, host, org, nombre, id, motivo }.
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
      if (!r.valido) {
        invalidos.push(r);
        continue;
      }
      if (vistos[r.id]) continue;
      vistos[r.id] = true;
      validos.push(r);
    }
    return { validos: validos, invalidos: invalidos };
  }

  /* ------------------------------------------------------ generación de datos */

  function generarHallazgos(repo, control, checksActivos, azar, config) {
    var plantillas = control.plantillas.filter(function (p) {
      return checksActivos.indexOf(p.check) !== -1;
    });
    if (!plantillas.length) return [];

    // Entre 0 y todas las plantillas aplicables; ~15 % de repos salen limpios.
    var maximo = plantillas.length;
    var cantidad = azar() < 0.15 ? 0 : entero(azar, 1, maximo);

    var barajadas = plantillas.slice().sort(function (a, b) {
      return hash32(repo.id + a.titulo) - hash32(repo.id + b.titulo);
    });

    var hallazgos = [];
    for (var i = 0; i < cantidad; i++) {
      var p = barajadas[i];
      var archivo = elegir(azar, p.archivos);
      var severidad = p.severidad;

      // El alcance "solo rama principal" reduce la visibilidad del histórico.
      if (config.profundidad === 'superficial' && p.check.indexOf('.2') !== -1 && azar() < 0.5) continue;

      hallazgos.push({
        id: 'H-' + (hash32(repo.id + control.id + p.titulo) % 100000).toString().padStart(5, '0'),
        titulo: p.titulo,
        severidad: severidad,
        control: control.id,
        check: p.check,
        checkNombre: (function () {
          for (var k = 0; k < control.checks.length; k++) {
            if (control.checks[k].id === p.check) return control.checks[k].nombre;
          }
          return p.check;
        })(),
        repo: repo.etiqueta,
        archivo: archivo,
        linea: entero(azar, 3, 480),
        commit: shaFalso(azar),
        autor: elegir(azar, CRO.catalog.autores),
        fecha: fechaAtras(azar, 540),
        rama: config.rama || 'main',
        snippet: p.snippet,
        impacto: p.impacto,
        recomendacion: p.recomendacion,
        referencia: p.referencia,
        cvss: p.cvss,
        estado: 'Abierto',
        confianza: elegir(azar, ['Alta', 'Alta', 'Media', 'Media', 'Baja'])
      });
    }
    return hallazgos;
  }

  function puntuar(hallazgos) {
    var sev = CRO.catalog.severidades;
    var penalizacion = 0;
    for (var i = 0; i < hallazgos.length; i++) {
      penalizacion += (sev[hallazgos[i].severidad] || { peso: 1 }).peso;
    }
    return Math.max(0, 100 - penalizacion);
  }

  function veredicto(hallazgos) {
    var criticos = hallazgos.filter(function (h) {
      return h.severidad === 'critica' || h.severidad === 'alta';
    }).length;
    if (!hallazgos.length) return 'conforme';
    if (criticos) return 'no-conforme';
    return 'parcial';
  }

  function contarPorSeveridad(hallazgos) {
    var conteo = { critica: 0, alta: 0, media: 0, baja: 0, info: 0 };
    hallazgos.forEach(function (h) {
      if (conteo[h.severidad] !== undefined) conteo[h.severidad]++;
    });
    return conteo;
  }

  /* ------------------------------------------------- composición de resultados */

  /**
   * Construye el bloque de resultado de un repositorio a partir de sus hallazgos.
   * Lo usan tanto el motor simulado como el motor real, de modo que la
   * puntuación y el veredicto se calculan siempre igual.
   */
  function componerResultadoRepo(datos) {
    var hallazgos = datos.hallazgos || [];
    var control = datos.control || { checks: [] };

    var checks = (datos.checksActivos || []).map(function (idCheck) {
      var propios = hallazgos.filter(function (h) { return h.check === idCheck; });
      var def = control.checks.filter(function (c) { return c.id === idCheck; })[0] || { nombre: idCheck };
      return {
        id: idCheck,
        nombre: def.nombre,
        hallazgos: propios.length,
        estado: propios.length ? veredicto(propios) : 'conforme'
      };
    });

    var bloque = {
      repo: datos.repo,
      hallazgos: hallazgos,
      checks: checks,
      conteo: contarPorSeveridad(hallazgos),
      puntuacion: puntuar(hallazgos),
      veredicto: veredicto(hallazgos),
      metricas: datos.metricas || {}
    };

    if (datos.error) bloque.error = datos.error;
    if (datos.observaciones) bloque.observaciones = datos.observaciones;
    if (datos.analisis) bloque.analisis = datos.analisis;
    return bloque;
  }

  /** Construye el objeto de ejecución completo a partir de los bloques por repositorio. */
  function componerEjecucion(datos) {
    var resultados = datos.resultados || [];
    var control = datos.control;
    var todos = resultados.reduce(function (acc, r) { return acc.concat(r.hallazgos); }, []);
    var modo = datos.modo || 'mock';

    return {
      id: 'EJ-' + new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14),
      fecha: new Date().toISOString(),
      modo: modo,
      simulado: modo === 'mock',
      modelo: datos.modelo || null,
      config: datos.config,
      control: {
        id: control.id,
        nombre: control.nombre,
        marco: control.marco,
        descripcion: control.descripcion
      },
      checks: datos.checksActivos,
      plan: construirPlan(datos.config, control, datos.checksActivos),
      resultados: resultados,
      resumen: {
        repos: resultados.length,
        hallazgos: todos.length,
        conteo: contarPorSeveridad(todos),
        conformes: resultados.filter(function (r) { return r.veredicto === 'conforme'; }).length,
        parciales: resultados.filter(function (r) { return r.veredicto === 'parcial'; }).length,
        noConformes: resultados.filter(function (r) { return r.veredicto === 'no-conforme'; }).length,
        errores: resultados.filter(function (r) { return !!r.error; }).length,
        noVerificados: todos.filter(function (h) { return h.verificado === false; }).length,
        puntuacionMedia: resultados.length
          ? Math.round(resultados.reduce(function (a, r) { return a + r.puntuacion; }, 0) / resultados.length)
          : 0,
        duracionMs: Date.now() - datos.inicio
      }
    };
  }

  /* -------------------------------------------------------- plan de ejecución */

  function construirPlan(config, control, checksActivos) {
    var checks = control.checks.filter(function (c) {
      return checksActivos.indexOf(c.id) !== -1;
    });
    var campos = CRO.catalog.camposEvidencia.filter(function (c) {
      return config.camposEvidencia.indexOf(c.id) !== -1;
    });

    var lineas = [];
    lineas.push('# Plan de ejecución del control');
    lineas.push('');
    lineas.push('## Control');
    lineas.push('- Identificador: ' + control.id + ' — ' + control.nombre);
    lineas.push('- Marco de referencia: ' + control.marco);
    lineas.push('');
    lineas.push('## Objetivo del control');
    lineas.push(config.objetivo || '(sin objetivo declarado)');
    lineas.push('');
    lineas.push('## Alcance');
    lineas.push('- Repositorios: ' + config.repos.length);
    config.repos.forEach(function (r) {
      lineas.push('  - ' + r.etiqueta + '  (' + r.host + ')');
    });
    lineas.push('- Rama analizada: ' + (config.rama || 'main'));
    lineas.push('- Profundidad de histórico: ' + (config.profundidad === 'superficial' ? 'solo estado actual' : 'histórico completo'));
    lineas.push('');
    lineas.push('## Verificaciones a ejecutar');
    checks.forEach(function (c) {
      lineas.push('- [' + c.id + '] ' + c.nombre);
    });
    lineas.push('');
    lineas.push('## Enfoque de la prueba (prompt)');
    lineas.push(config.prompt || '(sin prompt declarado)');
    lineas.push('');
    lineas.push('## Evidencia esperada');
    lineas.push('- Formato de entrega: ' + (function () {
      var f = CRO.catalog.formatosEvidencia.filter(function (x) { return x.id === config.formatoEvidencia; })[0];
      return f ? f.etiqueta : config.formatoEvidencia;
    })());
    campos.forEach(function (c) {
      lineas.push('- ' + c.etiqueta);
    });
    if (config.criterioAceptacion) {
      lineas.push('');
      lineas.push('## Criterio de aceptación');
      lineas.push(config.criterioAceptacion);
    }
    return lineas.join('\n');
  }

  /* ----------------------------------------------------------------- ejecución */

  /**
   * Analiza un repositorio (simulado). Devuelve el bloque de resultado del repo.
   */
  function analizarRepo(repo, config, control, checksActivos) {
    var semilla = hash32(repo.id + '|' + control.id + '|' + checksActivos.join(',') + '|' + (config.semilla || ''));
    var azar = rng(semilla);
    var hallazgos = generarHallazgos(repo, control, checksActivos, azar, config);

    return componerResultadoRepo({
      repo: repo,
      hallazgos: hallazgos,
      checksActivos: checksActivos,
      control: control,
      metricas: {
        ficherosAnalizados: entero(azar, 180, 4200),
        commitsRevisados: config.profundidad === 'superficial' ? 1 : entero(azar, 240, 9800),
        duracionMs: entero(azar, 1800, 9400),
        ultimoCommit: fechaAtras(azar, 60)
      }
    });
  }

  /**
   * Ejecuta el análisis completo de forma asíncrona y simulada.
   * `onProgreso(indice, total, repo)` se invoca antes de analizar cada repositorio.
   */
  function ejecutar(config, onProgreso) {
    var control = CRO.catalog.porId(config.controlId);
    if (!control) return Promise.reject(new Error('Control no encontrado: ' + config.controlId));

    var checksActivos = config.checks && config.checks.length
      ? config.checks
      : control.checks.map(function (c) { return c.id; });

    var repos = config.repos.slice();
    var resultados = [];
    var inicio = Date.now();

    return new Promise(function (resolve) {
      var i = 0;
      function paso() {
        if (i >= repos.length) {
          resolve(componerEjecucion({
            config: config,
            control: control,
            checksActivos: checksActivos,
            resultados: resultados,
            inicio: inicio,
            modo: 'mock'
          }));
          return;
        }
        var repo = repos[i];
        if (onProgreso) onProgreso(i, repos.length, repo);
        resultados.push(analizarRepo(repo, config, control, checksActivos));
        i++;
        setTimeout(paso, 260 + Math.random() * 260);
      }
      paso();
    });
  }

  CRO.engine = {
    parsearRepos: parsearRepos,
    normalizarRepo: normalizarRepo,
    construirPlan: construirPlan,
    componerResultadoRepo: componerResultadoRepo,
    componerEjecucion: componerEjecucion,
    utilidades: { puntuar: puntuar, veredicto: veredicto, contarPorSeveridad: contarPorSeveridad },
    ejecutar: ejecutar
  };
})(window);
