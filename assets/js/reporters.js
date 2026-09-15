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

    L.push('# Informe de control de ciberseguridad sobre repositorios Git');
    L.push('');
    L.push('> **Aviso:** informe generado en modo MOCK. Los hallazgos son simulados y no proceden de un análisis real.');
    L.push('');
    L.push('| Campo | Valor |');
    L.push('| --- | --- |');
    L.push('| Identificador de ejecución | `' + ejecucion.id + '` |');
    L.push('| Fecha | ' + new Date(ejecucion.fecha).toLocaleString('es-ES') + ' |');
    L.push('| Control | ' + ejecucion.control.id + ' — ' + ejecucion.control.nombre + ' |');
    L.push('| Marco de referencia | ' + ejecucion.control.marco + ' |');
    L.push('| Repositorios analizados | ' + r.repos + ' |');
    L.push('| Hallazgos totales | ' + r.hallazgos + ' |');
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
      L.push('- Host: ' + res.repo.host);
      L.push('- Rama analizada: ' + (ejecucion.config.rama || 'main'));
      L.push('- Ficheros analizados: ' + res.metricas.ficherosAnalizados + ' · Commits revisados: ' + res.metricas.commitsRevisados);
      L.push('');
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
        L.push('');
      });
    });

    if (ejecucion.config.criterioAceptacion) {
      L.push('## 5. Criterio de aceptación');
      L.push('');
      L.push(ejecucion.config.criterioAceptacion);
      L.push('');
    }

    L.push('---');
    L.push('_Generado por CRO-Asistant (modo mock) el ' + new Date(ejecucion.fecha).toLocaleString('es-ES') + '._');
    return L.join('\n');
  }

  /* ---------------------------------------------------------------------- CSV */

  function escapaCsv(valor) {
    var s = String(valor == null ? '' : valor).replace(/"/g, '""').replace(/\r?\n/g, ' ');
    return '"' + s + '"';
  }

  function aCsv(ejecucion) {
    var cabecera = ['ejecucion', 'repositorio', 'control', 'verificacion', 'hallazgo', 'severidad',
      'archivo', 'linea', 'commit', 'autor', 'fecha', 'cvss', 'impacto', 'recomendacion', 'referencia', 'estado'];
    var filas = [cabecera.join(',')];
    ejecucion.resultados.forEach(function (res) {
      res.hallazgos.forEach(function (h) {
        filas.push([
          ejecucion.id, res.repo.etiqueta, h.control, h.check, h.titulo, sev(h.severidad),
          h.archivo, h.linea, h.commit.slice(0, 12), h.autor, h.fecha, h.cvss,
          h.impacto, h.recomendacion, h.referencia, h.estado
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
    L.push('Ejecución ' + ejecucion.id + ' (MOCK) · ' + new Date(ejecucion.fecha).toLocaleString('es-ES'));
    L.push('');
    L.push('Repositorios evaluados ....... ' + r.repos);
    L.push('  Conformes .................. ' + r.conformes);
    L.push('  Con observaciones .......... ' + r.parciales);
    L.push('  No conformes ............... ' + r.noConformes);
    L.push('');
    L.push('Hallazgos .................... ' + r.hallazgos);
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
