/*
 * reporters.js — Generación del informe de evidencia en Markdown y su
 * presentación en pantalla.
 *
 * El formato de entrega es siempre Markdown: `markdown()` produce el documento
 * y `aHtml()` lo renderiza para mostrarlo directamente en el informe.
 */
(function (global) {
  'use strict';

  var CRO = (global.CRO = global.CRO || {});

  function veredictoTexto(v) {
    return CRO.catalog.veredictos[v] || v;
  }

  function iconoResultado(resultado) {
    return { 'cumple': '✅', 'no cumple': '❌', 'no evaluable': '⚠️' }[resultado] || '·';
  }

  /* ------------------------------------------------------------------ Markdown */

  function markdown(ejecucion) {
    var L = [];
    var r = ejecucion.resumen;
    var req = ejecucion.requisito;
    var real = ejecucion.modo === 'real';

    L.push('# Evidencia de control · ' + req.id);
    L.push('');
    if (real) {
      L.push('> **Análisis real.** La evidencia se recogió clonando cada repositorio y se evaluó con el ' +
        'modelo `' + (ejecucion.modelo || 'GLM') + '` (Z.AI). Las rutas, líneas y commits citados se resuelven ' +
        'desde la evidencia recogida, no desde el texto del modelo. El veredicto requiere revisión humana ' +
        'antes de darse por definitivo.');
    } else {
      L.push('> **Aviso:** informe generado en modo simulado. Los veredictos y las evidencias son ficticios.');
    }
    L.push('');

    L.push('| Campo | Valor |');
    L.push('| --- | --- |');
    L.push('| Identificador de ejecución | `' + ejecucion.id + '` |');
    L.push('| Fecha | ' + new Date(ejecucion.fecha).toLocaleString('es-ES') + ' |');
    L.push('| Modo | ' + (real ? 'real (recolección + modelo)' : 'simulado') + ' |');
    if (real) L.push('| Modelo | `' + (ejecucion.modelo || 'desconocido') + '` |');
    L.push('| Requisito | ' + req.id + ' |');
    L.push('| Repositorios evaluados | ' + r.repos + ' |');
    L.push('| Conformes | ' + r.conformes + ' |');
    L.push('| No conformes | ' + r.noConformes + ' |');
    L.push('| No evaluables | ' + r.noEvaluables + ' |');
    L.push('');

    L.push('## 1. Requisito evaluado');
    L.push('');
    L.push('**' + req.id + '** — ' + req.enunciado);
    L.push('');
    L.push('**Objetivo de la evidencia**');
    L.push('');
    L.push(req.objetivo);
    L.push('');
    L.push('**Evidencia esperada según el catálogo**');
    L.push('');
    L.push(req.explicacion);
    L.push('');

    L.push('## 2. Forma de la evidencia solicitada');
    L.push('');
    L.push(ejecucion.config.evidenciaEsperada || '_No se indicó forma de evidencia._');
    L.push('');

    L.push('## 3. Criterios de aceptación');
    L.push('');
    req.criterios.forEach(function (c, i) {
      L.push((i + 1) + '. ' + c);
    });
    L.push('');

    L.push('## 4. Veredicto por repositorio');
    L.push('');
    L.push('| Repositorio | Veredicto | Explicación |');
    L.push('| --- | --- | --- |');
    ejecucion.resultados.forEach(function (res) {
      L.push('| `' + res.repo.etiqueta + '` | ' + veredictoTexto(res.veredicto) + ' | ' +
        (res.explicacion ? res.explicacion.replace(/\|/g, '\\|').replace(/\n/g, ' ') : '—') + ' |');
    });
    L.push('');

    L.push('## 5. Detalle por repositorio');
    L.push('');
    ejecucion.resultados.forEach(function (res) {
      L.push('### ' + res.repo.etiqueta);
      L.push('');
      L.push('**Veredicto: ' + veredictoTexto(res.veredicto) + '**');
      L.push('');

      if (res.error) {
        L.push('No se pudo evaluar: ' + res.error);
        L.push('');
        return;
      }

      if (res.explicacion) {
        L.push(res.explicacion);
        L.push('');
      }

      if (res.criterios && res.criterios.length) {
        L.push('| # | Criterio | Resultado | Justificación |');
        L.push('| --- | --- | --- | --- |');
        res.criterios.forEach(function (c) {
          L.push('| ' + c.indice + ' | ' + c.criterio.replace(/\|/g, '\\|') + ' | ' +
            iconoResultado(c.resultado) + ' ' + c.resultado + ' | ' +
            (c.justificacion || '').replace(/\|/g, '\\|') + ' |');
        });
        L.push('');
      }

      if (res.evidencias && res.evidencias.length) {
        L.push('**Evidencia localizada**');
        L.push('');
        res.evidencias.forEach(function (e, i) {
          L.push((i + 1) + '. ' + e.descripcion);
          if (e.ruta) L.push('   - Ubicación: `' + e.ruta + (e.linea ? ':' + e.linea : '') + '`');
          if (e.commit) {
            L.push('   - Commit: `' + String(e.commit).slice(0, 12) + '`' +
              (e.autor ? ' · ' + e.autor : '') + (e.fecha ? ' · ' + e.fecha : '') +
              (e.commitRelacion ? ' (' + e.commitRelacion + ')' : ''));
          }
          if (e.origen) L.push('   - Origen: ' + e.origen);
          if (e.advertencia) L.push('   - ⚠ ' + e.advertencia);
          if (e.extracto) {
            L.push('');
            L.push('   ```text');
            String(e.extracto).split('\n').slice(0, 12).forEach(function (linea) {
              L.push('   ' + linea);
            });
            L.push('   ```');
          }
          L.push('');
        });
      } else {
        L.push('_No se localizó evidencia asociada a este requisito._');
        L.push('');
      }

      if (res.analisis) {
        if (res.analisis.limitaciones && res.analisis.limitaciones.length) {
          L.push('**Limitaciones declaradas**');
          L.push('');
          res.analisis.limitaciones.forEach(function (l) { L.push('- ' + l); });
          L.push('');
        }
        if (res.metricas && res.metricas.ficherosAnalizados) {
          L.push('_Ficheros analizados: ' + res.metricas.ficherosAnalizados +
            ' · Commits revisados: ' + (res.metricas.commitsRevisados || 0) +
            (res.observaciones ? ' · Observaciones recogidas: ' + res.observaciones.length : '') + '._');
          L.push('');
        }
      }
    });

    if (r.noVerificadas) {
      L.push('> ⚠ ' + r.noVerificadas + ' evidencia(s) citan material que no existe en la recolección y ' +
        'están marcadas como no verificables.');
      L.push('');
    }

    L.push('---');
    L.push('');
    L.push('_Generado por CRO-Asistant en modo ' +
      (real ? 'real con el modelo ' + (ejecucion.modelo || 'GLM') : 'simulado') +
      ' el ' + new Date(ejecucion.fecha).toLocaleString('es-ES') + '._');

    return L.join('\n');
  }

  /* --------------------------------------------------- Markdown → HTML (vista) */

  function esc(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Marcado en línea. Se aplica SIEMPRE sobre texto ya escapado. */
  function enLinea(texto) {
    return texto
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\\\|/g, '|');
  }

  function filaTabla(linea) {
    var limpia = linea.trim().replace(/^\|/, '').replace(/\|$/, '');
    // Se respetan las barras escapadas dentro de las celdas.
    return limpia.split(/(?<!\\)\|/).map(function (celda) { return celda.trim(); });
  }

  function esSeparadorTabla(linea) {
    return /^\s*\|?[\s:-]*-[\s|:-]*\|?\s*$/.test(linea) && linea.indexOf('-') !== -1;
  }

  /**
   * Renderiza el subconjunto de Markdown que produce `markdown()`:
   * encabezados, tablas, listas, citas, bloques de código, reglas y énfasis.
   */
  function aHtml(texto) {
    var lineas = String(texto).split('\n');
    var salida = [];
    var i = 0;
    var listaAbierta = null;

    function cerrarLista() {
      if (listaAbierta) { salida.push('</' + listaAbierta + '>'); listaAbierta = null; }
    }

    while (i < lineas.length) {
      var linea = lineas[i];
      var recortada = linea.trim();

      // Bloque de código
      var vallaIndentada = linea.match(/^(\s*)```(\w*)\s*$/);
      if (vallaIndentada) {
        cerrarLista();
        var sangria = vallaIndentada[1].length;
        var cuerpo = [];
        i++;
        while (i < lineas.length && !/^\s*```\s*$/.test(lineas[i])) {
          cuerpo.push(esc(lineas[i].slice(sangria)));
          i++;
        }
        i++;
        salida.push('<pre><code>' + cuerpo.join('\n') + '</code></pre>');
        continue;
      }

      // Tabla
      if (recortada.indexOf('|') !== -1 && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1])) {
        cerrarLista();
        var cabecera = filaTabla(recortada);
        i += 2;
        var filas = [];
        while (i < lineas.length && lineas[i].trim().indexOf('|') !== -1) {
          filas.push(filaTabla(lineas[i]));
          i++;
        }
        salida.push('<div class="tabla-envoltorio"><table><thead><tr>' +
          cabecera.map(function (c) { return '<th>' + enLinea(esc(c)) + '</th>'; }).join('') +
          '</tr></thead><tbody>' +
          filas.map(function (fila) {
            return '<tr>' + fila.map(function (c) { return '<td>' + enLinea(esc(c)) + '</td>'; }).join('') + '</tr>';
          }).join('') +
          '</tbody></table></div>');
        continue;
      }

      // Encabezado
      var enc = recortada.match(/^(#{1,6})\s+(.*)$/);
      if (enc) {
        cerrarLista();
        var nivel = Math.min(6, enc[1].length + 1);   // el h1 del documento ya existe en la página
        salida.push('<h' + nivel + '>' + enLinea(esc(enc[2])) + '</h' + nivel + '>');
        i++;
        continue;
      }

      // Regla horizontal
      if (/^---+$/.test(recortada)) {
        cerrarLista();
        salida.push('<hr>');
        i++;
        continue;
      }

      // Cita
      if (/^>\s?/.test(recortada)) {
        cerrarLista();
        var cita = [];
        while (i < lineas.length && /^>\s?/.test(lineas[i].trim())) {
          cita.push(lineas[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        salida.push('<blockquote>' + enLinea(esc(cita.join(' '))) + '</blockquote>');
        continue;
      }

      // Lista ordenada
      var ol = linea.match(/^\s*(\d+)\.\s+(.*)$/);
      if (ol) {
        if (listaAbierta !== 'ol') { cerrarLista(); salida.push('<ol>'); listaAbierta = 'ol'; }
        salida.push('<li>' + enLinea(esc(ol[2])) + '</li>');
        i++;
        continue;
      }

      // Lista no ordenada (incluye las anidadas con sangría)
      var ul = linea.match(/^\s*[-*]\s+(.*)$/);
      if (ul) {
        if (listaAbierta !== 'ul') { cerrarLista(); salida.push('<ul>'); listaAbierta = 'ul'; }
        salida.push('<li>' + enLinea(esc(ul[1])) + '</li>');
        i++;
        continue;
      }

      // Línea en blanco
      if (!recortada) {
        cerrarLista();
        i++;
        continue;
      }

      // Párrafo
      cerrarLista();
      var parrafo = [];
      while (i < lineas.length && lineas[i].trim() &&
             !/^(#{1,6}\s|>|\s*[-*]\s|\s*\d+\.\s|```)/.test(lineas[i]) &&
             !/^---+$/.test(lineas[i].trim())) {
        parrafo.push(lineas[i].trim());
        i++;
      }
      salida.push('<p>' + enLinea(esc(parrafo.join(' '))) + '</p>');
    }

    cerrarLista();
    return salida.join('\n');
  }

  CRO.reporters = {
    markdown: markdown,
    aHtml: aHtml,
    veredictoTexto: veredictoTexto,
    iconoResultado: iconoResultado
  };
})(window);
