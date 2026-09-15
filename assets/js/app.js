/*
 * app.js — Interfaz de usuario: enlaza el formulario de definición del control
 * con el motor mock y con los generadores de evidencia.
 */
(function (global) {
  'use strict';

  var CRO = (global.CRO = global.CRO || {});
  var catalogo = CRO.catalog;
  var motor = CRO.engine;
  var reporters = CRO.reporters;

  var CLAVE_HISTORIAL = 'cro-asistant.historial.v1';
  var CLAVE_BORRADOR = 'cro-asistant.borrador.v1';

  var estado = {
    ejecucion: null,
    reposParseados: { validos: [], invalidos: [] },
    ejecutando: false
  };

  /* ------------------------------------------------------------- utilidades */

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function esc(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function sevEtiqueta(id) {
    var s = catalogo.severidades[id];
    return s ? s.etiqueta : id;
  }

  function veredictoTexto(v) {
    return { conforme: 'Conforme', parcial: 'Con observaciones', 'no-conforme': 'No conforme' }[v] || v;
  }

  function descargar(nombre, contenido, mime) {
    var blob = new Blob([contenido], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* --------------------------------------------------- inicialización de UI */

  function pintarControles() {
    var select = $('#control');
    select.innerHTML = catalogo.controles.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.id + ' · ' + c.nombre) + '</option>';
    }).join('');
  }

  function pintarFormatos() {
    $('#formato-evidencia').innerHTML = catalogo.formatosEvidencia.map(function (f) {
      return '<option value="' + esc(f.id) + '">' + esc(f.etiqueta) + '</option>';
    }).join('');
    $('#vista-evidencia').innerHTML = catalogo.formatosEvidencia.map(function (f) {
      return '<option value="' + esc(f.id) + '">' + esc(f.etiqueta) + '</option>';
    }).join('');
  }

  function pintarCamposEvidencia() {
    $('#campos-evidencia').innerHTML = catalogo.camposEvidencia.map(function (c) {
      return '<label><input type="checkbox" name="campo-evidencia" value="' + esc(c.id) + '"' +
        (c.defecto ? ' checked' : '') + '><span>' + esc(c.etiqueta) + '</span></label>';
    }).join('');
  }

  function pintarControlSeleccionado(rellenarTextos) {
    var control = catalogo.porId($('#control').value);
    if (!control) return;

    $('#control-descripcion').textContent = control.descripcion + ' — Marco: ' + control.marco;

    $('#checks').innerHTML = control.checks.map(function (c) {
      return '<label><input type="checkbox" name="check" value="' + esc(c.id) + '" checked>' +
        '<span><span class="codigo">' + esc(c.id) + '</span> ' + esc(c.nombre) + '</span></label>';
    }).join('');

    if (rellenarTextos) {
      $('#objetivo').value = control.objetivoSugerido;
      $('#prompt').value = control.promptSugerido;
      actualizarContadorPrompt();
    }
  }

  function actualizarContadorPrompt() {
    $('#contador-prompt').textContent = $('#prompt').value.length + ' caracteres';
  }

  /* --------------------------------------------------------- repositorios */

  function actualizarRepos() {
    var parseado = motor.parsearRepos($('#repos').value);
    estado.reposParseados = parseado;

    $('#contador-repos').textContent = parseado.validos.length + ' repositorio' +
      (parseado.validos.length === 1 ? '' : 's') + ' válido' + (parseado.validos.length === 1 ? '' : 's') +
      (parseado.invalidos.length ? ' · ' + parseado.invalidos.length + ' con error' : '');

    $('#lista-repos').innerHTML =
      parseado.validos.map(function (r) {
        return '<li title="' + esc(r.host) + '">✓ ' + esc(r.etiqueta) + '</li>';
      }).join('') +
      parseado.invalidos.map(function (r) {
        return '<li class="invalido" title="' + esc(r.motivo) + '">✕ ' + esc(r.entrada) + '</li>';
      }).join('');
  }

  /* --------------------------------------------------- lectura del formulario */

  function leerConfiguracion() {
    return {
      repos: estado.reposParseados.validos,
      rama: $('#rama').value.trim() || 'main',
      profundidad: $('#profundidad').value,
      controlId: $('#control').value,
      checks: $$('input[name="check"]:checked').map(function (i) { return i.value; }),
      objetivo: $('#objetivo').value.trim(),
      prompt: $('#prompt').value.trim(),
      formatoEvidencia: $('#formato-evidencia').value,
      camposEvidencia: $$('input[name="campo-evidencia"]:checked').map(function (i) { return i.value; }),
      criterioAceptacion: $('#criterio').value.trim(),
      semilla: ''
    };
  }

  function validar(config) {
    if (!config.repos.length) return 'Indica al menos un repositorio Git válido.';
    if (!config.checks.length) return 'Selecciona al menos una verificación del control.';
    if (!config.objetivo) return 'Describe el objetivo del control.';
    if (config.prompt.length < 20) return 'El prompt de enfoque debe describir la prueba (mínimo 20 caracteres).';
    if (!config.camposEvidencia.length) return 'Selecciona al menos un campo de evidencia esperada.';
    return null;
  }

  function aplicarConfiguracion(config) {
    $('#repos').value = config.repos.map(function (r) { return r.entrada || r.etiqueta; }).join('\n');
    $('#rama').value = config.rama || 'main';
    $('#profundidad').value = config.profundidad || 'completa';
    $('#control').value = config.controlId;
    pintarControlSeleccionado(false);
    $('#objetivo').value = config.objetivo || '';
    $('#prompt').value = config.prompt || '';
    $('#criterio').value = config.criterioAceptacion || '';
    $('#formato-evidencia').value = config.formatoEvidencia || 'markdown';
    $$('input[name="check"]').forEach(function (i) {
      i.checked = (config.checks || []).indexOf(i.value) !== -1;
    });
    $$('input[name="campo-evidencia"]').forEach(function (i) {
      i.checked = (config.camposEvidencia || []).indexOf(i.value) !== -1;
    });
    actualizarRepos();
    actualizarContadorPrompt();
  }

  /* ------------------------------------------------------------- ejecución */

  function mostrarProgreso(config) {
    $('#estado-vacio').hidden = true;
    $('#informe').hidden = true;
    $('#progreso').hidden = false;
    $('#barra-relleno').style.width = '0%';
    $('#progreso-texto').textContent = 'Preparando análisis de ' + config.repos.length + ' repositorio(s)…';
    $('#progreso-lista').innerHTML = config.repos.map(function (r) {
      return '<li data-repo="' + esc(r.id) + '" data-etiqueta="' + esc(r.etiqueta) + '">· ' +
        esc(r.etiqueta) + ' — en cola</li>';
    }).join('');
  }

  function avanzarProgreso(indice, total, repo) {
    var items = $$('#progreso-lista li');
    items.forEach(function (li, i) {
      var etiqueta = li.getAttribute('data-etiqueta');
      if (i < indice) {
        li.className = 'hecho';
        li.textContent = '✓ ' + etiqueta + ' — completado';
      }
    });
    if (items[indice]) {
      items[indice].className = 'activo';
      items[indice].textContent = '▸ ' + repo.etiqueta + ' — analizando';
    }
    $('#progreso-texto').textContent = 'Analizando ' + (indice + 1) + ' de ' + total + ': ' + repo.etiqueta;
    $('#barra-relleno').style.width = Math.round((indice / total) * 100) + '%';
  }

  function ejecutar(evento) {
    if (evento) evento.preventDefault();
    if (estado.ejecutando) return;

    var config = leerConfiguracion();
    var error = validar(config);
    var cajaError = $('#error-formulario');

    if (error) {
      cajaError.textContent = error;
      cajaError.hidden = false;
      return;
    }
    cajaError.hidden = true;

    estado.ejecutando = true;
    $('#btn-ejecutar').disabled = true;
    $('#btn-ejecutar').textContent = 'Ejecutando…';
    mostrarProgreso(config);

    motor.ejecutar(config, avanzarProgreso).then(function (ejecucion) {
      $('#barra-relleno').style.width = '100%';
      estado.ejecucion = ejecucion;
      guardarEnHistorial(ejecucion);
      setTimeout(function () {
        $('#progreso').hidden = true;
        renderizarInforme(ejecucion);
      }, 250);
    }).catch(function (err) {
      cajaError.textContent = 'Error en la ejecución simulada: ' + err.message;
      cajaError.hidden = false;
      $('#progreso').hidden = true;
      $('#estado-vacio').hidden = false;
    }).then(function () {
      estado.ejecutando = false;
      $('#btn-ejecutar').disabled = false;
      $('#btn-ejecutar').textContent = 'Ejecutar control (simulado)';
    });
  }

  /* ------------------------------------------------------------- informe */

  function renderizarInforme(ejecucion) {
    $('#informe').hidden = false;
    $('#estado-vacio').hidden = true;

    var r = ejecucion.resumen;
    $('#kpis').innerHTML = [
      { valor: r.repos, etiqueta: 'Repositorios', clase: '' },
      { valor: r.hallazgos, etiqueta: 'Hallazgos', clase: '' },
      { valor: r.conteo.critica, etiqueta: 'Críticos', clase: 'kpi--critica' },
      { valor: r.conteo.alta, etiqueta: 'Altos', clase: 'kpi--alta' },
      { valor: r.conteo.media, etiqueta: 'Medios', clase: 'kpi--media' },
      { valor: r.puntuacionMedia + '/100', etiqueta: 'Puntuación', clase: '' }
    ].map(function (k) {
      return '<div class="kpi ' + k.clase + '"><div class="kpi__valor">' + esc(k.valor) +
        '</div><div class="kpi__etiqueta">' + esc(k.etiqueta) + '</div></div>';
    }).join('');

    renderizarResumen(ejecucion);
    prepararFiltros(ejecucion);
    renderizarHallazgos(ejecucion);
    renderizarEvidencia(ejecucion);
    $('#salida-plan').textContent = ejecucion.plan;
    seleccionarPestana('resumen');
  }

  function renderizarResumen(ejecucion) {
    var panel = $('.tab-panel[data-panel="resumen"]');
    var partes = [];

    partes.push('<div class="aviso"><strong>Ejecución simulada.</strong> Identificador <code>' +
      esc(ejecucion.id) + '</code> · ' + esc(new Date(ejecucion.fecha).toLocaleString('es-ES')) +
      ' · duración ' + (ejecucion.resumen.duracionMs / 1000).toFixed(1) + ' s.</div>');

    partes.push('<p><strong>' + esc(ejecucion.control.id) + '</strong> — ' + esc(ejecucion.control.nombre) +
      '<br><span class="ayuda">' + esc(ejecucion.control.marco) + '</span></p>');

    partes.push('<div class="tabla-envoltorio"><table><thead><tr>' +
      '<th>Repositorio</th><th>Veredicto</th><th>Crít.</th><th>Alta</th><th>Media</th><th>Baja</th>' +
      '<th>Puntuación</th><th>Ficheros</th><th>Commits</th></tr></thead><tbody>');
    ejecucion.resultados.forEach(function (res) {
      partes.push('<tr>' +
        '<td class="mono">' + esc(res.repo.etiqueta) + '</td>' +
        '<td><span class="veredicto veredicto--' + esc(res.veredicto) + '">' + esc(veredictoTexto(res.veredicto)) + '</span></td>' +
        '<td>' + res.conteo.critica + '</td><td>' + res.conteo.alta + '</td>' +
        '<td>' + res.conteo.media + '</td><td>' + res.conteo.baja + '</td>' +
        '<td>' + res.puntuacion + '/100</td>' +
        '<td>' + res.metricas.ficherosAnalizados + '</td>' +
        '<td>' + res.metricas.commitsRevisados + '</td></tr>');
    });
    partes.push('</tbody></table></div>');

    partes.push('<h3 style="margin-top:1.2rem;font-size:.95rem">Estado por verificación</h3>');
    partes.push('<div class="tabla-envoltorio"><table><thead><tr><th>Verificación</th>' +
      ejecucion.resultados.map(function (res) {
        return '<th class="mono">' + esc(res.repo.nombre) + '</th>';
      }).join('') + '</tr></thead><tbody>');
    ejecucion.checks.forEach(function (idCheck) {
      var nombre = (ejecucion.resultados[0].checks.filter(function (c) { return c.id === idCheck; })[0] || {}).nombre || idCheck;
      partes.push('<tr><td><span class="mono">' + esc(idCheck) + '</span> ' + esc(nombre) + '</td>' +
        ejecucion.resultados.map(function (res) {
          var c = res.checks.filter(function (x) { return x.id === idCheck; })[0];
          if (!c) return '<td>—</td>';
          return '<td><span class="veredicto veredicto--' + esc(c.estado) + '">' +
            (c.estado === 'conforme' ? '✓' : c.hallazgos + '') + '</span></td>';
        }).join('') + '</tr>');
    });
    partes.push('</tbody></table></div>');

    panel.innerHTML = partes.join('');
  }

  function prepararFiltros(ejecucion) {
    $('#filtro-repo').innerHTML = '<option value="">Todos</option>' +
      ejecucion.resultados.map(function (res) {
        return '<option value="' + esc(res.repo.etiqueta) + '">' + esc(res.repo.etiqueta) + '</option>';
      }).join('');
    $('#filtro-severidad').value = '';
    $('#filtro-texto').value = '';
  }

  function hallazgosFiltrados() {
    if (!estado.ejecucion) return [];
    var sev = $('#filtro-severidad').value;
    var repo = $('#filtro-repo').value;
    var texto = $('#filtro-texto').value.trim().toLowerCase();

    return estado.ejecucion.resultados.reduce(function (acc, res) {
      return acc.concat(res.hallazgos);
    }, []).filter(function (h) {
      if (sev && h.severidad !== sev) return false;
      if (repo && h.repo !== repo) return false;
      if (texto) {
        var blob = (h.titulo + ' ' + h.archivo + ' ' + h.check + ' ' + h.checkNombre + ' ' + h.referencia).toLowerCase();
        if (blob.indexOf(texto) === -1) return false;
      }
      return true;
    }).sort(function (a, b) {
      return catalogo.severidades[b.severidad].orden - catalogo.severidades[a.severidad].orden;
    });
  }

  function renderizarHallazgos() {
    var lista = hallazgosFiltrados();
    var destino = $('#tabla-hallazgos');

    if (!lista.length) {
      destino.innerHTML = '<p class="ayuda">No hay hallazgos que coincidan con los filtros aplicados.</p>';
      return;
    }

    var filas = lista.map(function (h, i) {
      return '<tr>' +
        '<td><span class="etiqueta-sev sev-' + esc(h.severidad) + '">' + esc(sevEtiqueta(h.severidad)) + '</span></td>' +
        '<td><button type="button" class="boton-expandir" data-detalle="' + i + '">' + esc(h.titulo) + '</button></td>' +
        '<td class="mono">' + esc(h.repo) + '</td>' +
        '<td class="mono">' + esc(h.archivo) + ':' + h.linea + '</td>' +
        '<td class="mono">' + esc(h.check) + '</td>' +
        '</tr>' +
        '<tr class="fila-detalle" data-fila="' + i + '" hidden><td colspan="5">' + detalleHtml(h) + '</td></tr>';
    }).join('');

    destino.innerHTML = '<div class="tabla-envoltorio"><table><thead><tr>' +
      '<th>Severidad</th><th>Hallazgo</th><th>Repositorio</th><th>Ubicación</th><th>Check</th>' +
      '</tr></thead><tbody>' + filas + '</tbody></table></div>' +
      '<p class="ayuda">' + lista.length + ' hallazgo(s) mostrados. Pulsa un título para ver la evidencia.</p>';

    destino.querySelectorAll('[data-detalle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var fila = destino.querySelector('[data-fila="' + btn.getAttribute('data-detalle') + '"]');
        fila.hidden = !fila.hidden;
      });
    });
  }

  function detalleHtml(h) {
    var campos = estado.ejecucion ? estado.ejecucion.config.camposEvidencia : [];
    function si(campo) { return campos.indexOf(campo) !== -1; }

    var dl = ['<dl>'];
    dl.push('<dt>Verificación</dt><dd>' + esc(h.check) + ' — ' + esc(h.checkNombre) + '</dd>');
    if (si('ubicacion')) dl.push('<dt>Ubicación</dt><dd class="mono">' + esc(h.archivo) + ':' + h.linea + ' (' + esc(h.rama) + ')</dd>');
    if (si('commit')) dl.push('<dt>Commit</dt><dd class="mono">' + esc(h.commit.slice(0, 12)) + ' · ' + esc(h.autor) + ' · ' + esc(h.fecha) + '</dd>');
    if (si('cvss')) dl.push('<dt>CVSS estimado</dt><dd>' + esc(h.cvss) + '</dd>');
    if (si('impacto')) dl.push('<dt>Impacto</dt><dd>' + esc(h.impacto) + '</dd>');
    if (si('recomendacion')) dl.push('<dt>Recomendación</dt><dd>' + esc(h.recomendacion) + '</dd>');
    if (si('referencia')) dl.push('<dt>Referencia</dt><dd>' + esc(h.referencia) + '</dd>');
    if (si('trazabilidad')) dl.push('<dt>Trazabilidad</dt><dd class="mono">' + esc(estado.ejecucion.id + '/' + h.id) + '</dd>');
    dl.push('<dt>Confianza</dt><dd>' + esc(h.confianza) + '</dd>');
    dl.push('</dl>');

    var snippet = si('snippet') ? '<pre>' + esc(h.snippet) + '</pre>' : '';
    return '<div class="detalle-hallazgo">' + dl.join('') + snippet + '</div>';
  }

  function renderizarEvidencia(ejecucion) {
    $('#vista-evidencia').value = ejecucion.config.formatoEvidencia;
    actualizarVistaEvidencia();
  }

  function actualizarVistaEvidencia() {
    if (!estado.ejecucion) return;
    var salida = reporters.porFormato(estado.ejecucion, $('#vista-evidencia').value);
    $('#salida-evidencia').textContent = salida.contenido;
  }

  /* ------------------------------------------------------------- pestañas */

  function seleccionarPestana(nombre) {
    $$('.pestana').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === nombre));
    });
    $$('.tab-panel').forEach(function (p) {
      p.hidden = p.getAttribute('data-panel') !== nombre;
    });
  }

  /* ------------------------------------------------------------ historial */

  function leerHistorial() {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_HISTORIAL) || '[]');
    } catch (e) {
      return [];
    }
  }

  function guardarEnHistorial(ejecucion) {
    try {
      var historial = leerHistorial();
      historial.unshift({
        id: ejecucion.id,
        fecha: ejecucion.fecha,
        control: ejecucion.control.id + ' · ' + ejecucion.control.nombre,
        repos: ejecucion.resumen.repos,
        hallazgos: ejecucion.resumen.hallazgos,
        config: Object.assign({}, ejecucion.config)
      });
      localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(historial.slice(0, 20)));
      pintarHistorial();
    } catch (e) {
      /* almacenamiento no disponible: el historial es opcional */
    }
  }

  function pintarHistorial() {
    var historial = leerHistorial();
    var lista = $('#lista-historial');
    if (!historial.length) {
      lista.innerHTML = '<li class="ayuda">Todavía no hay ejecuciones guardadas.</li>';
      return;
    }
    lista.innerHTML = historial.map(function (h, i) {
      return '<li>' +
        '<div><strong>' + esc(h.control) + '</strong></div>' +
        '<div class="historial__meta">' + esc(new Date(h.fecha).toLocaleString('es-ES')) + ' · ' +
        h.repos + ' repos · ' + h.hallazgos + ' hallazgos</div>' +
        '<div class="historial__acciones">' +
        '<button type="button" class="boton boton--fantasma" data-cargar="' + i + '">Cargar configuración</button>' +
        '</div></li>';
    }).join('');

    lista.querySelectorAll('[data-cargar]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = leerHistorial()[Number(btn.getAttribute('data-cargar'))];
        if (!item) return;
        aplicarConfiguracion(item.config);
        $('#cajon-historial').hidden = true;
        $('#btn-historial').setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* -------------------------------------------------------------- borrador */

  function guardarBorrador() {
    try {
      localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(leerConfiguracion()));
    } catch (e) { /* ignorado */ }
  }

  function cargarBorrador() {
    try {
      var guardado = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || 'null');
      if (guardado && guardado.controlId && catalogo.porId(guardado.controlId)) {
        aplicarConfiguracion(guardado);
        return true;
      }
    } catch (e) { /* ignorado */ }
    return false;
  }

  /* ---------------------------------------------------------------- eventos */

  function enlazarEventos() {
    $('#control').addEventListener('change', function () { pintarControlSeleccionado(true); });
    $('#repos').addEventListener('input', actualizarRepos);
    $('#prompt').addEventListener('input', actualizarContadorPrompt);
    $('#formulario').addEventListener('submit', ejecutar);
    $('#formulario').addEventListener('change', guardarBorrador);
    $('#formulario').addEventListener('input', guardarBorrador);

    $('#btn-ejemplo').addEventListener('click', function () {
      $('#repos').value = [
        'https://github.com/mi-org/servicio-pagos.git',
        'git@github.com:mi-org/portal-web.git',
        'mi-org/infra-terraform',
        'https://gitlab.interno.local/plataforma/api-gateway.git'
      ].join('\n');
      actualizarRepos();
      guardarBorrador();
    });

    $('#btn-limpiar-repos').addEventListener('click', function () {
      $('#repos').value = '';
      actualizarRepos();
      guardarBorrador();
    });

    $('#btn-prompt-sugerido').addEventListener('click', function () {
      var control = catalogo.porId($('#control').value);
      if (control) {
        $('#prompt').value = control.promptSugerido;
        actualizarContadorPrompt();
        guardarBorrador();
      }
    });

    $('#btn-reiniciar').addEventListener('click', function () {
      $('#repos').value = '';
      $('#rama').value = 'main';
      $('#profundidad').value = 'completa';
      $('#criterio').value = '';
      $('#control').selectedIndex = 0;
      pintarCamposEvidencia();
      pintarControlSeleccionado(true);
      actualizarRepos();
      $('#error-formulario').hidden = true;
      guardarBorrador();
    });

    $$('.pestana').forEach(function (b) {
      b.addEventListener('click', function () { seleccionarPestana(b.getAttribute('data-tab')); });
    });

    ['#filtro-severidad', '#filtro-repo'].forEach(function (sel) {
      $(sel).addEventListener('change', function () { renderizarHallazgos(); });
    });
    $('#filtro-texto').addEventListener('input', function () { renderizarHallazgos(); });

    $('#vista-evidencia').addEventListener('change', actualizarVistaEvidencia);

    $('#btn-copiar').addEventListener('click', function () {
      var texto = $('#salida-evidencia').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(function () {
          $('#btn-copiar').textContent = 'Copiado ✓';
          setTimeout(function () { $('#btn-copiar').textContent = 'Copiar'; }, 1600);
        });
      }
    });

    $('#btn-descargar').addEventListener('click', function () {
      if (!estado.ejecucion) return;
      var salida = reporters.porFormato(estado.ejecucion, $('#vista-evidencia').value);
      descargar(estado.ejecucion.id + '-evidencia.' + salida.extension, salida.contenido, salida.mime);
    });

    $('#btn-historial').addEventListener('click', function () {
      var cajon = $('#cajon-historial');
      cajon.hidden = !cajon.hidden;
      $('#btn-historial').setAttribute('aria-expanded', String(!cajon.hidden));
      if (!cajon.hidden) pintarHistorial();
    });

    $('#btn-cerrar-historial').addEventListener('click', function () {
      $('#cajon-historial').hidden = true;
      $('#btn-historial').setAttribute('aria-expanded', 'false');
    });

    $('#btn-vaciar-historial').addEventListener('click', function () {
      try { localStorage.removeItem(CLAVE_HISTORIAL); } catch (e) { /* ignorado */ }
      pintarHistorial();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        $('#cajon-historial').hidden = true;
        $('#btn-historial').setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------------------------------------------------------------- arranque */

  function iniciar() {
    pintarControles();
    pintarFormatos();
    pintarCamposEvidencia();
    pintarControlSeleccionado(true);
    if (!cargarBorrador()) actualizarRepos();
    enlazarEventos();
    pintarHistorial();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  CRO.app = { estado: estado, reiniciar: iniciar };
})(window);
