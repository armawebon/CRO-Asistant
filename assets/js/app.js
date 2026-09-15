/*
 * app.js — Interfaz: enlaza la definición del control con el motor elegido
 * (simulado o real) y muestra la evidencia generada en Markdown.
 */
(function (global) {
  'use strict';

  var CRO = (global.CRO = global.CRO || {});
  var catalogo = CRO.catalog;
  var motor = CRO.engine;
  var reporters = CRO.reporters;

  var CLAVE_HISTORIAL = 'cro-asistant.historial.v2';
  var CLAVE_BORRADOR = 'cro-asistant.borrador.v2';

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

  function modoSeleccionado() {
    var marcado = document.querySelector('input[name="modo"]:checked');
    return marcado ? marcado.value : 'mock';
  }

  /* --------------------------------------------------- catálogo de requisitos */

  function pintarRequisitos(mantenerSeleccion) {
    var select = $('#requisito');
    var previo = mantenerSeleccion ? select.value : null;
    var lista = catalogo.desplegables($('#catalogo-completo').checked);

    select.innerHTML = lista.map(function (r) {
      var resumen = r.enunciado.length > 110 ? r.enunciado.slice(0, 110) + '…' : r.enunciado;
      return '<option value="' + esc(r.id) + '">' + esc(r.id + ' — ' + resumen) + '</option>';
    }).join('');

    if (previo && lista.some(function (r) { return r.id === previo; })) select.value = previo;
  }

  function requisitoActual() {
    return catalogo.porId($('#requisito').value);
  }

  function pintarFichaRequisito(rellenarEvidencia) {
    var req = requisitoActual();
    if (!req) return;

    $('#req-enunciado').textContent = req.enunciado;
    $('#req-objetivo').textContent = req.objetivo;
    $('#req-explicacion').textContent = req.explicacion;
    $('#req-criterios').innerHTML = req.criterios.map(function (c) {
      return '<li>' + esc(c) + '</li>';
    }).join('');

    if (rellenarEvidencia) {
      $('#evidencia-esperada').value = req.evidenciaPorDefecto;
      actualizarContadorEvidencia();
    }
  }

  function actualizarContadorEvidencia() {
    $('#contador-evidencia').textContent = $('#evidencia-esperada').value.length + ' caracteres';
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
      modo: modoSeleccionado(),
      repos: estado.reposParseados.validos,
      requisitoId: $('#requisito').value,
      catalogoCompleto: $('#catalogo-completo').checked,
      evidenciaEsperada: $('#evidencia-esperada').value.trim(),
      formatoEvidencia: 'markdown'
    };
  }

  function validar(config) {
    if (!config.repos.length) return 'Indica al menos un repositorio Git válido.';
    if (!config.requisitoId || !catalogo.porId(config.requisitoId)) return 'Selecciona el requisito a evaluar.';
    if (config.evidenciaEsperada.length < 20) {
      return 'Describe la forma de la evidencia esperada (mínimo 20 caracteres).';
    }
    if (config.modo === 'real' && !CRO.engineReal.estado.modoRealDisponible) {
      return 'El modo real no está disponible: ' +
        (CRO.engineReal.estado.error || 'servidor local no accesible.') +
        ' Cambia a modo simulado o arranca el servidor con la clave configurada.';
    }
    return null;
  }

  function aplicarConfiguracion(config) {
    var radioModo = document.querySelector('input[name="modo"][value="' + (config.modo || 'mock') + '"]');
    if (radioModo && !radioModo.disabled) radioModo.checked = true;

    $('#catalogo-completo').checked = !!config.catalogoCompleto;
    pintarRequisitos(false);

    $('#repos').value = config.repos.map(function (r) { return r.entrada || r.etiqueta; }).join('\n');
    if (catalogo.porId(config.requisitoId)) $('#requisito').value = config.requisitoId;
    pintarFichaRequisito(false);
    $('#evidencia-esperada').value = config.evidenciaEsperada || '';

    actualizarRepos();
    actualizarContadorEvidencia();
    actualizarPastillaModo();
  }

  /* --------------------------------------------------- estado del modo real */

  function pintarEstadoBackend() {
    var e = CRO.engineReal.estado;
    var caja = $('#estado-backend');
    var radioReal = document.querySelector('input[name="modo"][value="real"]');
    var boton = $('#btn-comprobar-modelo');

    if (!e.consultado) {
      caja.textContent = 'Comprobando servidor local…';
      caja.className = 'estado-backend';
      return;
    }

    if (e.modoRealDisponible) {
      caja.innerHTML = '<span class="punto punto--ok"></span> Servidor local activo · modelo <strong>' +
        esc(e.modelo ? e.modelo.modelo : '?') + '</strong> · clave ' +
        esc(e.modelo && e.modelo.claveHuella ? e.modelo.claveHuella : 'configurada') +
        (e.clonadoActivo ? '' : ' · clonado desactivado');
      caja.className = 'estado-backend estado-backend--ok';
      radioReal.disabled = false;
      boton.disabled = false;
    } else {
      caja.innerHTML = '<span class="punto punto--ko"></span> Modo real no disponible: ' + esc(e.error || 'causa desconocida');
      caja.className = 'estado-backend estado-backend--ko';
      radioReal.disabled = true;
      boton.disabled = true;
      var marcado = document.querySelector('input[name="modo"]:checked');
      if (marcado && marcado.value === 'real') {
        document.querySelector('input[name="modo"][value="mock"]').checked = true;
      }
    }
    actualizarPastillaModo();
  }

  function etiquetaBotonEjecutar() {
    return modoSeleccionado() === 'real' ? 'Ejecutar control (real)' : 'Ejecutar control (simulado)';
  }

  function actualizarPastillaModo() {
    if (!estado.ejecutando) $('#btn-ejecutar').textContent = etiquetaBotonEjecutar();
    var pastilla = document.querySelector('.pastilla--mock');
    if (!pastilla) return;
    if (modoSeleccionado() === 'real') {
      var e = CRO.engineReal.estado;
      pastilla.textContent = 'MODO REAL · ' + (e.modelo ? e.modelo.modelo : 'GLM');
      pastilla.classList.add('pastilla--real');
    } else {
      pastilla.textContent = 'MODO MOCK';
      pastilla.classList.remove('pastilla--real');
    }
  }

  function comprobarModelo() {
    var boton = $('#btn-comprobar-modelo');
    var caja = $('#estado-backend');
    boton.disabled = true;
    boton.textContent = 'Comprobando…';

    CRO.engineReal.comprobarModelo().then(function (datos) {
      caja.innerHTML = '<span class="punto punto--ok"></span> Conexión verificada con <strong>' +
        esc(datos.modelo) + '</strong> · respuesta "' + esc(datos.respuesta) + '" en ' +
        (datos.duracionMs / 1000).toFixed(1) + ' s';
      caja.className = 'estado-backend estado-backend--ok';
    }).catch(function (error) {
      var detalle = error.detalle && error.detalle.cuerpo ? ' — ' + String(error.detalle.cuerpo).slice(0, 300) : '';
      caja.innerHTML = '<span class="punto punto--ko"></span> ' + esc(error.message) + esc(detalle);
      caja.className = 'estado-backend estado-backend--ko';
    }).then(function () {
      boton.disabled = false;
      boton.textContent = 'Comprobar conexión con el modelo';
    });
  }

  /* ------------------------------------------------------------- ejecución */

  function mostrarProgreso(config) {
    $('#estado-vacio').hidden = true;
    $('#informe').hidden = true;
    $('#progreso').hidden = false;
    $('#barra-relleno').style.width = '0%';
    $('#progreso-texto').textContent = config.modo === 'real'
      ? 'Clonando y evaluando ' + config.repos.length + ' repositorio(s) con el modelo…'
      : 'Preparando evaluación de ' + config.repos.length + ' repositorio(s)…';
    $('#progreso-lista').innerHTML = config.repos.map(function (r) {
      return '<li data-etiqueta="' + esc(r.etiqueta) + '">· ' + esc(r.etiqueta) + ' — en cola</li>';
    }).join('');
  }

  function avanzarProgreso(indice, total, repo) {
    var items = $$('#progreso-lista li');
    items.forEach(function (li, i) {
      if (i < indice) {
        li.className = 'hecho';
        li.textContent = '✓ ' + li.getAttribute('data-etiqueta') + ' — completado';
      }
    });
    if (items[indice]) {
      items[indice].className = 'activo';
      items[indice].textContent = '▸ ' + repo.etiqueta + ' — evaluando';
    }
    $('#progreso-texto').textContent = (modoSeleccionado() === 'real'
      ? 'Clonando y evaluando ' : 'Evaluando ') + (indice + 1) + ' de ' + total + ': ' + repo.etiqueta;
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
    $('#btn-ejecutar').textContent = config.modo === 'real' ? 'Clonando y evaluando…' : 'Ejecutando…';
    mostrarProgreso(config);

    var lanzador = config.modo === 'real'
      ? CRO.engineReal.ejecutar(config, avanzarProgreso)
      : motor.ejecutar(config, avanzarProgreso);

    lanzador.then(function (ejecucion) {
      $('#barra-relleno').style.width = '100%';
      estado.ejecucion = ejecucion;
      guardarEnHistorial(ejecucion);
      setTimeout(function () {
        $('#progreso').hidden = true;
        renderizarInforme(ejecucion);
      }, 250);
    }).catch(function (err) {
      cajaError.textContent = 'Error en la ejecución (' + config.modo + '): ' + err.message;
      cajaError.hidden = false;
      $('#progreso').hidden = true;
      $('#estado-vacio').hidden = false;
    }).then(function () {
      estado.ejecutando = false;
      $('#btn-ejecutar').disabled = false;
      $('#btn-ejecutar').textContent = etiquetaBotonEjecutar();
    });
  }

  /* ------------------------------------------------------------- informe */

  function renderizarInforme(ejecucion) {
    $('#informe').hidden = false;
    $('#estado-vacio').hidden = true;

    var r = ejecucion.resumen;

    /* Cabecera con el contexto de la ejecución */
    var avisos = [];
    if (ejecucion.modo === 'real') {
      var observaciones = ejecucion.resultados.reduce(function (a, res) {
        return a + ((res.observaciones && res.observaciones.length) || 0);
      }, 0);
      avisos.push('<div class="aviso aviso--real"><strong>Ejecución real.</strong> ' +
        esc(ejecucion.requisito.id) + ' · <code>' + esc(ejecucion.id) + '</code> · modelo <strong>' +
        esc(ejecucion.modelo || 'GLM') + '</strong> · ' + observaciones +
        ' observaciones recogidas · ' + (r.duracionMs / 1000).toFixed(1) + ' s.</div>');
    } else {
      avisos.push('<div class="aviso"><strong>Ejecución simulada.</strong> ' +
        esc(ejecucion.requisito.id) + ' · <code>' + esc(ejecucion.id) + '</code> · ' +
        esc(new Date(ejecucion.fecha).toLocaleString('es-ES')) + '.</div>');
    }
    if (r.noVerificadas) {
      avisos.push('<div class="aviso aviso--error"><strong>' + r.noVerificadas +
        ' evidencia(s) sin respaldo verificable.</strong> El modelo citó material que no existe en la ' +
        'recolección. Están marcadas en el informe.</div>');
    }
    $('#cabecera-informe').innerHTML = avisos.join('');

    /* Indicadores */
    $('#kpis').innerHTML = [
      { valor: r.repos, etiqueta: 'Repositorios', clase: '' },
      { valor: r.conformes, etiqueta: 'Conformes', clase: 'kpi--conforme' },
      { valor: r.noConformes, etiqueta: 'No conformes', clase: 'kpi--no-conforme' },
      { valor: r.noEvaluables, etiqueta: 'No evaluables', clase: 'kpi--no-evaluable' }
    ].map(function (k) {
      return '<div class="kpi ' + k.clase + '"><div class="kpi__valor">' + esc(k.valor) +
        '</div><div class="kpi__etiqueta">' + esc(k.etiqueta) + '</div></div>';
    }).join('');

    /* Cuadro de veredictos por repositorio */
    $('#tabla-veredictos').innerHTML = '<div class="tabla-envoltorio"><table><thead><tr>' +
      '<th>Repositorio</th><th>Veredicto</th><th>Explicación</th>' +
      '</tr></thead><tbody>' +
      ejecucion.resultados.map(function (res) {
        return '<tr>' +
          '<td class="mono">' + esc(res.repo.etiqueta) + '</td>' +
          '<td><span class="veredicto veredicto--' + esc(res.veredicto) + '">' +
          esc(reporters.veredictoTexto(res.veredicto)) + '</span></td>' +
          '<td>' + (res.explicacion ? esc(res.explicacion) : '<span class="ayuda">—</span>') + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';

    /* Informe en Markdown, mostrado directamente */
    var fuente = reporters.markdown(ejecucion);
    $('#informe-fuente').textContent = fuente;
    $('#informe-render').innerHTML = reporters.aHtml(fuente);
    aplicarVistaInforme();
  }

  function aplicarVistaInforme() {
    var verFuente = $('#ver-fuente').checked;
    $('#informe-fuente').hidden = !verFuente;
    $('#informe-render').hidden = verFuente;
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
        requisito: ejecucion.requisito.id,
        modo: ejecucion.modo,
        repos: ejecucion.resumen.repos,
        conformes: ejecucion.resumen.conformes,
        noConformes: ejecucion.resumen.noConformes,
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
        '<div><strong>' + esc(h.requisito) + '</strong> · ' + esc(h.modo === 'real' ? 'real' : 'simulado') + '</div>' +
        '<div class="historial__meta">' + esc(new Date(h.fecha).toLocaleString('es-ES')) + ' · ' +
        h.repos + ' repos · ' + h.conformes + ' conformes / ' + h.noConformes + ' no conformes</div>' +
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
      if (guardado && guardado.requisitoId && catalogo.porId(guardado.requisitoId)) {
        aplicarConfiguracion(guardado);
        return true;
      }
    } catch (e) { /* ignorado */ }
    return false;
  }

  /* ---------------------------------------------------------------- eventos */

  function enlazarEventos() {
    $('#requisito').addEventListener('change', function () {
      pintarFichaRequisito(true);
      guardarBorrador();
    });

    $('#catalogo-completo').addEventListener('change', function () {
      pintarRequisitos(true);
      pintarFichaRequisito(false);
      guardarBorrador();
    });

    $$('input[name="modo"]').forEach(function (radio) {
      radio.addEventListener('change', actualizarPastillaModo);
    });
    $('#btn-comprobar-modelo').addEventListener('click', comprobarModelo);

    $('#repos').addEventListener('input', actualizarRepos);
    $('#evidencia-esperada').addEventListener('input', actualizarContadorEvidencia);
    $('#formulario').addEventListener('submit', ejecutar);
    $('#formulario').addEventListener('change', guardarBorrador);
    $('#formulario').addEventListener('input', guardarBorrador);

    $('#btn-ejemplo').addEventListener('click', function () {
      $('#repos').value = [
        'https://github.com/mi-org/servicio-pagos.git',
        'git@github.com:mi-org/portal-web.git',
        'mi-org/infra-terraform'
      ].join('\n');
      actualizarRepos();
      guardarBorrador();
    });

    $('#btn-limpiar-repos').addEventListener('click', function () {
      $('#repos').value = '';
      actualizarRepos();
      guardarBorrador();
    });

    $('#btn-evidencia-defecto').addEventListener('click', function () {
      var req = requisitoActual();
      if (req) {
        $('#evidencia-esperada').value = req.evidenciaPorDefecto;
        actualizarContadorEvidencia();
        guardarBorrador();
      }
    });

    $('#btn-reiniciar').addEventListener('click', function () {
      $('#repos').value = '';
      $('#catalogo-completo').checked = false;
      pintarRequisitos(false);
      $('#requisito').selectedIndex = 0;
      pintarFichaRequisito(true);
      actualizarRepos();
      $('#error-formulario').hidden = true;
      guardarBorrador();
    });

    $('#ver-fuente').addEventListener('change', aplicarVistaInforme);

    $('#btn-copiar').addEventListener('click', function () {
      if (!estado.ejecucion) return;
      var texto = $('#informe-fuente').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(function () {
          $('#btn-copiar').textContent = 'Copiado ✓';
          setTimeout(function () { $('#btn-copiar').textContent = 'Copiar'; }, 1600);
        });
      }
    });

    $('#btn-descargar').addEventListener('click', function () {
      if (!estado.ejecucion) return;
      descargar(estado.ejecucion.id + '-' + estado.ejecucion.requisito.id + '.md',
        $('#informe-fuente').textContent, 'text/markdown');
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
    pintarRequisitos(false);
    pintarFichaRequisito(true);
    if (!cargarBorrador()) actualizarRepos();
    enlazarEventos();
    pintarHistorial();
    pintarEstadoBackend();
    CRO.engineReal.consultarEstado().then(pintarEstadoBackend);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  CRO.app = { estado: estado, reiniciar: iniciar };
})(window);
