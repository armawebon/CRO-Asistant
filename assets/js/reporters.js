/*
 * reporters.js — Generación de la evidencia en los formatos soportados.
 * Trabaja sobre el objeto de ejecución devuelto por CRO.engine.ejecutar().
 */
(function (global) {
  'use strict';

  var CRO = (global.CRO = global.CRO || {});

  function sev(id) {
    var s = CRO.catalog.severidades[id];
    return s ? s.etiqueta : id;
  }

  function veredictoTexto(v) {
    return { conforme: 'Conforme', parcial: 'Conforme con observaciones', 'no-conforme': 'No conforme' }[v] || v;
  }

  function incluye(ejecucion, campo) {
    return ejecucion.config.camposEvidencia.indexOf(campo) !== -1;
  }

  /* ------------------------------------------------------------------ Markdown */

  function aMarkdown(ejecucion) {
    var L = [];
    var r = ejecucion.resumen;

    var real = ejecucion.modo === 'real';

    L.push('# Informe de control de ciberseguridad sobre repositorios Git');
    L.push('');
    if (real) {
      L.push('> **Análisis real.** La evidencia se recogió clonando cada repositorio y se analizó con el modelo `' +
        (ejecucion.modelo || 'GLM') + '` (Z.AI). Cada hallazgo cita la observación de la que procede; la ruta, la ' +
        'línea y el commit se resuelven desde esa observación, no desde el texto del modelo. Las valoraciones de ' +
        'severidad son criterio del modelo y requieren revisión humana antes de usarse como conclusión de auditoría.');
    } else {
      L.push('> **Aviso:** informe generado en modo MOCK. Los hallazgos son simulados y no proceden de un análisis real.');
    }
    L.push('');
    L.push('| Campo | Valor |');
    L.push('| --- | --- |');
    L.push('| Identificador de ejecución | `' + ejecucion.id + '` |');
    L.push('| Modo de ejecución | ' + (real ? 'real (recolección + modelo)' : 'simulado (mock)') + ' |');
    if (real) L.push('| Modelo | `' + (ejecucion.modelo || 'desconocido') + '` |');
    L.push('| Fecha | ' + new Date(ejecucion.fecha).toLocaleString('es-ES') + ' |');
    L.push('| Control | ' + ejecucion.control.id + ' — ' + ejecucion.control.nombre + ' |');
    L.push('| Marco de referencia | ' + ejecucion.control.marco + ' |');
    L.push('| Repositorios analizados | ' + r.repos + ' |');
    L.push('| Hallazgos totales | ' + r.hallazgos + ' |');
    if (r.noVerificados) L.push('| Hallazgos sin evidencia verificable | ' + r.noVerificados + ' |');
    L.push('| Puntuación media | ' + r.puntuacionMedia + '/100 |');
    L.push('');

    L.push('## 1. Objetivo del control');
    L.push('');
    L.push(ejecucion.config.objetivo || '_No declarado._');
    L.push('');

    L.push('## 2. Enfoque de la prueba');
    L.push('');
    L.push('```text');
    L.push(ejecucion.config.prompt || '(sin prompt)');
    L.push('```');
    L.push('');

    L.push('## 3. Resumen por repositorio');
    L.push('');
    L.push('| Repositorio | Veredicto | Crít. | Alta | Media | Baja | Puntuación |');
    L.push('| --- | --- | --- | --- | --- | --- | --- |');
    ejecucion.resultados.forEach(function (res) {
      if (res.error) {
        L.push('| `' + res.repo.etiqueta + '` | No analizado | — | — | — | — | — |');
        return;
      }
      L.push('| `' + res.repo.etiqueta + '` | ' + veredictoTexto(res.veredicto) + ' | ' +
        res.conteo.critica + ' | ' + res.conteo.alta + ' | ' + res.conteo.media + ' | ' +
        res.conteo.baja + ' | ' + res.puntuacion + '/100 |');
    });
    L.push('');

    L.push('## 4. Evidencia detallada');
    L.push('');
    ejecucion.resultados.forEach(function (res) {
      L.push('### ' + res.repo.etiqueta);
      L.push('');
      if (res.error) {
        L.push('**No se pudo analizar:** ' + res.error);
        L.push('');
        return;
      }
      L.push('- Host: ' + res.repo.host);
      L.push('- Rama analizada: ' + (ejecucion.config.rama || 'main'));
      L.push('- Ficheros analizados: ' + res.metricas.ficherosAnalizados + ' · Commits revisados: ' + res.metricas.commitsRevisados);
      if (res.observaciones && res.observaciones.length) {
        L.push('- Observaciones recogidas: ' + res.observaciones.length);
      }
      L.push('');
      if (res.analisis && res.analisis.valoracionGlobal) {
        L.push('> ' + res.analisis.valoracionGlobal.replace(/\n/g, ' '));
        L.push('');
      }
      if (!res.hallazgos.length) {
        L.push('_Sin hallazgos para las verificaciones ejecutadas._');
        L.push('');
        return;
      }
      res.hallazgos.forEach(function (h, i) {
        L.push('#### ' + (i + 1) + '. ' + h.titulo + ' — ' + sev(h.severidad));
        L.push('');
        L.push('- Verificación: `' + h.check + '` ' + h.checkNombre);
        if (incluye(ejecucion, 'ubicacion')) L.push('- Ubicación: `' + h.archivo + ':' + h.linea + '`');
        if (incluye(ejecucion, 'commit')) L.push('- Commit: `' + h.commit.slice(0, 12) + '` · ' + h.autor + ' · ' + h.fecha);
        if (incluye(ejecucion, 'cvss')) L.push('- CVSS estimado: ' + h.cvss);
        if (incluye(ejecucion, 'trazabilidad')) L.push('- Trazabilidad: `' + ejecucion.id + '/' + h.id + '`');
        if (incluye(ejecucion, 'snippet')) {
          L.push('');
          L.push('```text');
          L.push(h.snippet);
          L.push('```');
        }
        if (incluye(ejecucion, 'impacto')) L.push('- Impacto: ' + h.impacto);
        if (incluye(ejecucion, 'recomendacion')) L.push('- Recomendación: ' + h.recomendacion);
        if (incluye(ejecucion, 'referencia')) L.push('- Referencia: ' + h.referencia);
        if (h.origen) L.push('- Origen de la evidencia: ' + h.origen);
        if (h.justificacion) L.push('- Justificación: ' + h.justificacion);
        if (h.advertencia) L.push('- ⚠ ' + h.advertencia);
        L.push('');
      });
    });

    if (real) {
      var hayNotas = ejecucion.resultados.some(function (res) {
        return res.analisis && ((res.analisis.descartados || []).length || (res.analisis.limitaciones || []).length);
      });
      if (hayNotas) {
        L.push('## 5. Descartes y limitaciones declarados');
        L.push('');
        ejecucion.resultados.forEach(function (res) {
          if (!res.analisis) return;
          var descartados = res.analisis.descartados || [];
          var limitaciones = res.analisis.limitaciones || [];
          if (!descartados.length && !limitaciones.length) return;
          L.push('### ' + res.repo.etiqueta);
          L.push('');
          if (descartados.length) {
            L.push('Descartados como falso positivo:');
            descartados.forEach(function (d) {
              L.push('- `' + (d.observacion || '—') + '`: ' + (d.motivo || ''));
            });
            L.push('');
          }
          if (limitaciones.length) {
            L.push('Limitaciones del análisis:');
            limitaciones.forEach(function (l) { L.push('- ' + l); });
            L.push('');
          }
        });
      }
    }

    if (ejecucion.config.criterioAceptacion) {
      L.push('## ' + (real ? '6' : '5') + '. Criterio de aceptación');
      L.push('');
      L.push(ejecucion.config.criterioAceptacion);
      L.push('');
    }

    L.push('---');
    L.push('_Generado por CRO-Asistant en modo ' + (real ? 'real con el modelo ' + (ejecucion.modelo || 'GLM') : 'simulado (mock)') +
      ' el ' + new Date(ejecucion.fecha).toLocaleString('es-ES') + '._');
    return L.join('\n');
  }

  /* ---------------------------------------------------------------------- CSV */

  function escapaCsv(valor) {
    var s = String(valor == null ? '' : valor).replace(/"/g, '""').replace(/\r?\n/g, ' ');
    return '"' + s + '"';
  }

  function aCsv(ejecucion) {
    var cabecera = ['ejecucion', 'modo', 'repositorio', 'control', 'verificacion', 'hallazgo', 'severidad',
      'archivo', 'linea', 'commit', 'autor', 'fecha', 'cvss', 'impacto', 'recomendacion', 'referencia',
      'estado', 'origen', 'verificado'];
    var filas = [cabecera.join(',')];
    ejecucion.resultados.forEach(function (res) {
      res.hallazgos.forEach(function (h) {
        filas.push([
          ejecucion.id, ejecucion.modo || 'mock', res.repo.etiqueta, h.control, h.check, h.titulo, sev(h.severidad),
          h.archivo, h.linea, (h.commit || '').slice(0, 12), h.autor, h.fecha, h.cvss,
          h.impacto, h.recomendacion, h.referencia, h.estado,
          h.origen || '', h.verificado === false ? 'no' : 'sí'
        ].map(escapaCsv).join(','));
      });
    });
    return filas.join('\n');
  }

  /* --------------------------------------------------------------------- JSON */

  function aJson(ejecucion) {
    return JSON.stringify(ejecucion, null, 2);
  }

  /* ---------------------------------------------------------- Resumen ejecutivo */

  function aEjecutivo(ejecucion) {
    var r = ejecucion.resumen;
    var L = [];
    L.push('RESUMEN EJECUTIVO — ' + ejecucion.control.id + ' ' + ejecucion.control.nombre);
    L.push('Ejecución ' + ejecucion.id + ' · ' +
      (ejecucion.modo === 'real' ? 'ANÁLISIS REAL · modelo ' + (ejecucion.modelo || 'GLM') : 'SIMULADO (MOCK)') +
      ' · ' + new Date(ejecucion.fecha).toLocaleString('es-ES'));
    L.push('');
    L.push('Repositorios evaluados ....... ' + r.repos);
    if (r.errores) L.push('  No analizados .............. ' + r.errores);
    L.push('  Conformes .................. ' + r.conformes);
    L.push('  Con observaciones .......... ' + r.parciales);
    L.push('  No conformes ............... ' + r.noConformes);
    L.push('');
    L.push('Hallazgos .................... ' + r.hallazgos);
    if (r.noVerificados) L.push('  Sin evidencia verificable .. ' + r.noVerificados);
    L.push('  Críticos ................... ' + r.conteo.critica);
    L.push('  Altos ...................... ' + r.conteo.alta);
    L.push('  Medios ..................... ' + r.conteo.media);
    L.push('  Bajos ...................... ' + r.conteo.baja);
    L.push('');
    L.push('Puntuación media de exposición: ' + r.puntuacionMedia + '/100');
    L.push('');
    L.push('Criterio de aceptación: ' + (ejecucion.config.criterioAceptacion || 'no declarado'));
    return L.join('\n');
  }

  CRO.reporters = {
    markdown: aMarkdown,
    json: aJson,
    csv: aCsv,
    ejecutivo: aEjecutivo,
    porFormato: function (ejecucion, formato) {
      switch (formato) {
        case 'json': return { contenido: aJson(ejecucion), extension: 'json', mime: 'application/json' };
        case 'csv': return { contenido: aCsv(ejecucion), extension: 'csv', mime: 'text/csv' };
        case 'ejecutivo': return { contenido: aEjecutivo(ejecucion), extension: 'txt', mime: 'text/plain' };
        default: return { contenido: aMarkdown(ejecucion), extension: 'md', mime: 'text/markdown' };
      }
    }
  };
})(window);
