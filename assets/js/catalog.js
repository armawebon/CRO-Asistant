/*
 * catalog.js — Catálogo de requisitos de control.
 *
 * Cada requisito define:
 *   - enunciado ............ el texto del requisito (lo que hay que cumplir)
 *   - objetivo ............. qué hay que demostrar con la evidencia
 *   - explicacion .......... qué evidencia concreta se espera aportar
 *   - criterios ............ criterios de aceptación con los que se evalúa
 *   - evidenciaPorDefecto .. descriptivo editable de la forma de la evidencia
 *   - desplegable .......... si aparece en el desplegable por defecto
 *
 * Los campos `enunciado`, `objetivo` y `explicacion` proceden del catálogo de
 * control. Los campos `criterios` y `evidenciaPorDefecto` son PROPUESTOS por la
 * aplicación y están pendientes de validación por el equipo de control.
 */
(function (global) {
  'use strict';

  var CRO = (global.CRO = global.CRO || {});

  var requisitos = [
    {
      id: 'R.006',
      desplegable: true,
      enunciado: 'Utilizar únicamente los datos estrictamente necesarios para el propósito del proyecto y aplicar técnicas de cifrado sobre los datos personales utilizados.',
      objetivo: 'Demostrar que solo se tratan los datos estrictamente necesarios para la finalidad del caso de uso y que los datos personales empleados están cifrados.',
      explicacion: 'Tabla con los campos de datos utilizados indicando finalidad, origen y justificación de necesidad, señalando también los campos descartados por no ser necesarios. Además, aportar capturas de configuración que evidencien el cifrado de esos datos, mostrando algoritmo y longitud de clave en reposo y TLS 1.2+ en tránsito, con nombre del recurso, entorno y fecha visibles.',
      criterios: [
        'Cada dato personal tratado aparece en la tabla con finalidad, origen y justificación de necesidad; no hay campos sin justificar.',
        'Se identifican explícitamente los campos descartados por no ser necesarios y el motivo del descarte.',
        'El cifrado en reposo emplea un algoritmo aprobado (AES-256 o equivalente) y el tránsito usa TLS 1.2 o superior, con recurso, entorno y fecha visibles en la evidencia.'
      ],
      evidenciaPorDefecto: 'Tabla de campos de datos (nombre, finalidad, origen, justificación, tratamiento) más el listado de campos descartados. Adjuntar capturas de la configuración de cifrado en reposo y en tránsito con recurso, entorno y fecha visibles.'
    },
    {
      id: 'R.009',
      desplegable: true,
      enunciado: 'Establecer control para que el gestor no pregunte a la IA sobre otros clientes no presentes en la llamada.',
      objetivo: 'Evidenciar que la IA solo puede responder sobre el cliente asociado a la llamada en curso.',
      explicacion: 'Captura de la configuración del guardarraíl o filtro de contexto donde se vea que las consultas quedan acotadas al identificador de cliente de la sesión.',
      criterios: [
        'La configuración acota toda consulta al identificador de cliente de la sesión en curso.',
        'El filtro se aplica en el servidor y no depende únicamente de las instrucciones del prompt de sistema.',
        'Existe al menos una prueba en la que una consulta sobre otro cliente se deniega o devuelve resultado vacío, con su registro en el log.'
      ],
      evidenciaPorDefecto: 'Captura de la configuración del filtro de contexto y traza de una prueba con dos clientes en la que se vea la denegación al consultar por el cliente no asociado a la llamada.'
    },
    {
      id: 'R.010',
      desplegable: true,
      enunciado: 'Evitar que la transcripción de la IA almacene en claro datos identificativos, financieros o de acceso del cliente.',
      objetivo: 'Demostrar que las transcripciones generadas por la IA no almacenan en claro datos identificativos, financieros ni credenciales del cliente.',
      explicacion: 'Captura de las reglas de redacción o masking activas (patrones de DNI/NIE, IBAN, PAN, teléfono, credenciales) y muestra real de una transcripción almacenada donde se vean los valores enmascarados, indicando el sistema de almacenamiento, el entorno y la fecha de la captura.',
      criterios: [
        'Las reglas de enmascarado cubren, como mínimo, DNI/NIE, IBAN, PAN, teléfono y credenciales.',
        'La muestra de transcripción almacenada presenta esos valores enmascarados, no solo enmascarados en la visualización.',
        'La evidencia identifica el sistema de almacenamiento, el entorno y la fecha de la captura.'
      ],
      evidenciaPorDefecto: 'Captura de la configuración de las reglas de redacción con sus patrones y muestra real de una transcripción almacenada con los valores enmascarados, indicando almacenamiento, entorno y fecha.'
    },
    {
      id: 'R.013',
      desplegable: true,
      enunciado: 'Restricción acceso a información de clientes marcados con la etiqueta de confidencialidad.',
      objetivo: 'Evidenciar que el sistema impide el acceso y el tratamiento mediante IA de la información de clientes etiquetados como confidenciales.',
      explicacion: 'Captura de la regla o filtro que comprueba la marca de confidencialidad antes de recuperar los datos y prueba de extremo a extremo con un cliente marcado en la que se vea la denegación de acceso.',
      criterios: [
        'La comprobación de la marca de confidencialidad ocurre antes de recuperar los datos, no después.',
        'La prueba de extremo a extremo con un cliente marcado muestra denegación efectiva, sin filtrado parcial de información.',
        'La denegación queda registrada en el log con identificador de sesión y motivo.'
      ],
      evidenciaPorDefecto: 'Captura de la regla de acceso que evalúa la etiqueta de confidencialidad y traza completa de una prueba extremo a extremo con un cliente marcado, incluyendo el registro de la denegación.'
    },
    {
      id: 'R.014',
      desplegable: true,
      enunciado: 'Restricción acceso a información de clientes marcados con la etiqueta de derecho de supresión.',
      objetivo: 'Evidenciar que la información de clientes que han ejercido el derecho de supresión no es accesible ni utilizable por el sistema de IA.',
      explicacion: 'Captura de la regla o filtro que excluye a los clientes con marca de supresión y prueba con un caso marcado mostrando la denegación.',
      criterios: [
        'El filtro excluye a los clientes con marca de supresión en todas las vías de acceso, incluidas cachés e índices de búsqueda.',
        'La prueba con un caso marcado muestra que ni se recupera ni se utiliza la información en la respuesta del modelo.',
        'La exclusión es verificable en el código o la configuración, no solo en la interfaz de usuario.'
      ],
      evidenciaPorDefecto: 'Captura del filtro de supresión en la capa de acceso a datos y prueba con un cliente marcado mostrando la denegación, indicando qué ocurre además con cachés e índices.'
    },
    {
      id: 'R.015',
      desplegable: true,
      enunciado: 'Informar al usuario sobre la grabación de la llamada y la finalidad de su tratamiento mediante IA.',
      objetivo: 'Acreditar que se informa al usuario, antes del tratamiento, de que la llamada se graba y de que será analizada mediante IA.',
      explicacion: 'Documento con el texto literal de la locución o aviso previo.',
      criterios: [
        'El texto informa expresamente de la grabación y del análisis mediante IA, no solo de la grabación.',
        'El aviso se emite antes de que comience el tratamiento, y así se refleja en el flujo de la llamada.',
        'El documento aportado recoge el texto literal vigente, con versión o fecha de entrada en vigor.'
      ],
      evidenciaPorDefecto: 'Documento con el texto literal de la locución vigente, su versión o fecha, y el punto del flujo de llamada en el que se reproduce.'
    },
    {
      id: 'R.026',
      desplegable: true,
      enunciado: 'Utilizar librerías homologadas.',
      objetivo: 'Evidenciar que solo se emplean componentes aprobados internamente, evitando dependencias no gobernadas o de origen no confiable.',
      explicacion: 'Export del fichero de dependencias del proyecto (requirements.txt, pom.xml, package-lock.json o equivalente) con nombre y versión exacta de cada librería, junto a una tabla de contraste con el catálogo homologado indicando el estado de cada una (homologada, pendiente o excepción aprobada) y la evidencia de aprobación de las excepciones.',
      criterios: [
        'El export de dependencias incluye nombre y versión exacta de cada componente, incluidas las transitivas.',
        'Toda dependencia figura en la tabla de contraste con estado homologada, pendiente o excepción aprobada; no hay componentes sin clasificar.',
        'Cada excepción cuenta con evidencia de aprobación identificable (aprobador y fecha).'
      ],
      evidenciaPorDefecto: 'Export del fichero de dependencias con versiones exactas y tabla de contraste frente al catálogo homologado, añadiendo la evidencia de aprobación de cada excepción.'
    },
    {
      id: 'R.027',
      desplegable: true,
      enunciado: 'Registrar todas las acciones del sistema (logs).',
      objetivo: 'Demostrar que el sistema registra las acciones ejecutadas, permitiendo su posterior auditoría y trazabilidad.',
      explicacion: 'Captura de la configuración de logging (nivel, destinos y retención) y muestra real de logs anonimizados donde se aprecien los campos mínimos: marca de tiempo, identificador de usuario y de sesión, acción ejecutada, resultado y origen. Indicar la plataforma en la que se centralizan los registros.',
      criterios: [
        'La muestra de logs contiene los campos mínimos: marca de tiempo, identificador de usuario y de sesión, acción, resultado y origen.',
        'La configuración declara nivel, destinos y periodo de retención, y este último cumple la política interna.',
        'Se identifica la plataforma de centralización y los registros no contienen datos personales en claro.'
      ],
      evidenciaPorDefecto: 'Captura de la configuración de logging (nivel, destinos, retención) y muestra de logs anonimizados con los campos mínimos, indicando la plataforma de centralización.'
    },
    {
      id: 'R.029',
      desplegable: true,
      enunciado: 'Implementar autenticación en la plataforma para validar la identidad del usuario antes de permitir la interacción con la IA.',
      objetivo: 'Acreditar que ningún usuario puede interactuar con el sistema de IA sin haberse autenticado previamente.',
      explicacion: 'Captura de la configuración de autenticación (integración con el proveedor de identidad corporativo, protocolo OIDC o SAML).',
      criterios: [
        'La autenticación se integra con el proveedor de identidad corporativo mediante OIDC o SAML.',
        'No existe ninguna vía de acceso a la funcionalidad de IA que omita la autenticación, incluidos endpoints de API.',
        'La validación de la sesión se realiza en el servidor en cada petición, no solo al iniciar sesión.'
      ],
      evidenciaPorDefecto: 'Captura de la configuración de autenticación con el proveedor de identidad y prueba de que una petición sin sesión válida es rechazada en el servidor.'
    },
    {
      id: 'R.031',
      desplegable: true,
      enunciado: 'Prevenir que los usuarios modifiquen de forma maliciosa el comportamiento del sistema de IA (jailbreak) mediante filtros y validaciones en las entradas que bloqueen prompts o instrucciones destinados a eludir los controles.',
      objetivo: 'Impedir que un usuario manipule el comportamiento del modelo mediante prompts diseñados para eludir las instrucciones y controles definidos.',
      explicacion: 'Captura de la configuración del filtro o guardarraíl de entrada (motor utilizado, conjunto de patrones o clasificador y acción ante detección: bloquear, sanear o escalar).',
      criterios: [
        'La configuración identifica el motor de filtrado, el conjunto de patrones o clasificador y la acción ante detección.',
        'El filtro actúa antes de que la entrada llegue al modelo y su resultado queda registrado.',
        'Se aportan pruebas con intentos de elusión representativos mostrando el bloqueo o saneado efectivo.'
      ],
      evidenciaPorDefecto: 'Captura de la configuración del guardarraíl de entrada (motor, patrones y acción) junto con pruebas de intentos de elusión representativos y su registro en el log.'
    },
    {
      id: 'R.032',
      desplegable: false,
      enunciado: 'Fijar versiones explícitas y reproducibles de las dependencias, revisándolas en cada despliegue.',
      objetivo: 'Demostrar que las versiones de las dependencias son explícitas y reproducibles, y que se revisan en cada despliegue para detectar componentes vulnerables.',
      explicacion: 'Fichero de bloqueo del gestor de paquetes (requirements.txt con versiones fijas, package-lock.json, poetry.lock o equivalente), tanto en captura como en su contenido, junto con la salida del paso de la canalización CI/CD que verifica dependencias en cada despliegue, con fecha y resultado.',
      criterios: [
        'Existe fichero de bloqueo versionado y todas las dependencias tienen versión fija, sin rangos abiertos.',
        'La canalización CI/CD ejecuta la verificación de dependencias en cada despliegue y su salida se conserva con fecha y resultado.',
        'El despliegue falla o se bloquea cuando se detectan componentes vulnerables por encima del umbral definido.'
      ],
      evidenciaPorDefecto: 'Fichero de bloqueo con versiones fijas y salida del paso de CI/CD que verifica dependencias, con fecha, resultado y umbral de bloqueo aplicado.'
    },
    {
      id: 'R.034',
      desplegable: false,
      enunciado: 'Conectar el modelo con herramientas mediante un protocolo estandarizado y controlado.',
      objetivo: 'Demostrar que la conexión del modelo con múltiples herramientas se realiza mediante un protocolo estandarizado y controlado, con inventario de herramientas y permisos acotados.',
      explicacion: 'Captura de la configuración del servidor MCP con el listado de herramientas registradas, los permisos y ámbitos concedidos a cada una, el método de autenticación empleado y el diagrama de integración.',
      criterios: [
        'El inventario recoge todas las herramientas registradas con su ámbito y permisos concedidos.',
        'Los permisos son los mínimos necesarios para cada herramienta y no hay ámbitos comodín.',
        'La autenticación entre el modelo y las herramientas está declarada y no emplea credenciales compartidas.'
      ],
      evidenciaPorDefecto: 'Captura de la configuración del servidor de herramientas con su inventario, permisos y método de autenticación, acompañada del diagrama de integración.'
    },
    {
      id: 'R.035',
      desplegable: false,
      enunciado: 'Verificar mediante controles técnicos la identidad de la persona a la que se ofrece el producto o servicio.',
      objetivo: 'Evidenciar que la identidad de la persona a la que se ofrece el producto o servicio se verifica mediante controles técnicos antes de la operación.',
      explicacion: 'Descripción del método de verificación de identidad utilizado (factores y nivel de garantía).',
      criterios: [
        'El método de verificación está descrito con sus factores y su nivel de garantía.',
        'La verificación ocurre antes de la operación y su resultado condiciona la continuación del flujo.',
        'El resultado de la verificación queda registrado y es auditable.'
      ],
      evidenciaPorDefecto: 'Descripción del método de verificación de identidad con factores y nivel de garantía, y traza del punto del flujo en el que se aplica.'
    },
    {
      id: 'R.037',
      desplegable: false,
      enunciado: 'Documentar y someter a aprobación de CRO las instrucciones y restricciones del prompt de sistema.',
      objetivo: 'Acreditar que las instrucciones y restricciones del prompt de sistema existen, están documentadas y han sido revisadas y aprobadas por CRO.',
      explicacion: 'Documento con el prompt de sistema y sus guardarraíles, captura de la configuración desplegada y evidencia formal de la validación por el equipo CRO: acta, correo de aprobación o firma con fecha y alcance revisado.',
      criterios: [
        'El prompt de sistema documentado coincide con el desplegado en el entorno productivo.',
        'La aprobación de CRO es formal e identifica fecha, aprobador y alcance revisado.',
        'Existe control de versiones del prompt que permite saber qué versión estaba vigente en cada momento.'
      ],
      evidenciaPorDefecto: 'Documento del prompt de sistema con sus guardarraíles, captura de la configuración desplegada y evidencia formal de aprobación por CRO con fecha y alcance.'
    },
    {
      id: 'R.038',
      desplegable: false,
      enunciado: 'Disponer de un punto de control que inspeccione y filtre entradas y salidas antes de llegar al modelo.',
      objetivo: 'Demostrar que existe un punto de control que inspecciona y filtra las entradas y salidas entre el usuario y la aplicación antes de llegar al modelo.',
      explicacion: 'Diagrama de arquitectura señalando la ubicación del guardarraíl en el flujo, captura de su configuración y capturas de pruebas mostrando el bloqueo de una entrada y de una salida no permitidas, con su registro en el log.',
      criterios: [
        'El diagrama sitúa el guardarraíl en el flujo de forma que no puede eludirse llamando directamente al modelo.',
        'Se aportan pruebas de bloqueo tanto de una entrada como de una salida no permitidas.',
        'Ambos bloqueos quedan registrados en el log con identificador de sesión y motivo.'
      ],
      evidenciaPorDefecto: 'Diagrama de arquitectura con la ubicación del guardarraíl, captura de su configuración y pruebas de bloqueo de entrada y de salida con su registro.'
    },
    {
      id: 'R.062',
      desplegable: false,
      enunciado: 'Desplegar únicamente los componentes esenciales, reduciendo la superficie de ataque.',
      objetivo: 'Demostrar que el sistema se despliega únicamente con los componentes esenciales, reduciendo la superficie de ataque.',
      explicacion: 'Inventario de servicios, módulos y funciones activos en el entorno productivo con su justificación.',
      criterios: [
        'El inventario cubre todos los servicios, módulos y funciones activos en producción.',
        'Cada elemento activo tiene justificación funcional; no hay componentes de desarrollo o depuración habilitados.',
        'El inventario está fechado y corresponde al despliegue vigente.'
      ],
      evidenciaPorDefecto: 'Inventario fechado de servicios, módulos y funciones activos en producción con la justificación de cada uno y mención expresa de lo deshabilitado.'
    },
    {
      id: 'R.085',
      desplegable: false,
      enunciado: 'Exponer únicamente el comportamiento de la librería que la aplicación necesita realmente.',
      objetivo: 'Reducir la superficie de ataque exponiendo únicamente el comportamiento de la librería que la aplicación necesita realmente.',
      explicacion: 'Fragmento de código o diagrama que muestre la capa envolvente (wrapper o fachada) sobre la librería, indicando qué métodos se exponen y cuáles quedan encapsulados.',
      criterios: [
        'Existe una capa envolvente y la aplicación no invoca la librería directamente fuera de ella.',
        'Se identifica qué métodos se exponen y cuáles quedan encapsulados.',
        'La superficie expuesta se corresponde con necesidades funcionales reales y documentadas.'
      ],
      evidenciaPorDefecto: 'Fragmento de código de la capa envolvente y diagrama o listado de los métodos expuestos frente a los encapsulados.'
    },
    {
      id: 'R.087',
      desplegable: false,
      enunciado: 'Realizar operaciones sobre ficheros, procesos y red mediante APIs seguras y no comandos del sistema.',
      objetivo: 'Garantizar que las operaciones sobre ficheros, procesos y red se realizan mediante APIs seguras del lenguaje o plataforma y no invocando comandos del sistema.',
      explicacion: 'Fragmentos de código o resultado del análisis estático que acrediten el uso de APIs nativas para estas operaciones, junto con la evidencia de la ausencia de llamadas del tipo exec, system o shell con parámetros procedentes de la entrada de usuario.',
      criterios: [
        'Las operaciones sobre ficheros, procesos y red se realizan mediante APIs nativas del lenguaje o plataforma.',
        'El análisis estático no detecta llamadas a exec, system o shell con parámetros procedentes de entrada de usuario.',
        'Las excepciones justificadas, si existen, están documentadas y saneadas mediante lista blanca.'
      ],
      evidenciaPorDefecto: 'Fragmentos de código representativos y salida del análisis estático que acrediten el uso de APIs nativas y la ausencia de invocación de comandos del sistema con entrada de usuario.'
    },
    {
      id: 'R.091',
      desplegable: false,
      enunciado: 'Impedir que datos no confiables sean interpretados como parte de una sentencia SQL.',
      objetivo: 'Impedir que datos no confiables sean interpretados como parte de una sentencia SQL, previniendo la inyección SQL.',
      explicacion: 'Fragmentos de código representativos donde se aprecie el uso de sentencias preparadas con parámetros vinculados (nunca concatenación de cadenas).',
      criterios: [
        'Todas las consultas con datos de entrada emplean sentencias preparadas con parámetros vinculados.',
        'No se encuentra concatenación ni interpolación de cadenas en la construcción de consultas.',
        'Los nombres de tabla o columna dinámicos, si existen, se resuelven mediante lista blanca.'
      ],
      evidenciaPorDefecto: 'Fragmentos de código de la capa de acceso a datos con sentencias preparadas y parámetros vinculados, incluyendo el tratamiento de cualquier parte dinámica de la consulta.'
    },
    {
      id: 'R.092',
      desplegable: false,
      enunciado: 'Validar los datos de entrada y codificar los de salida, neutralizando metacaracteres.',
      objetivo: 'Garantizar que los datos que entran se validan y que los que salen se codifican, neutralizando metacaracteres que puedan alterar el significado de una consulta o de una respuesta.',
      explicacion: 'Fragmentos de código con las funciones de validación de entrada (listas blancas, tipos y longitudes) y de codificación de salida según el contexto (HTML, JS, SQL o URL), junto con pruebas que envíen metacaracteres típicos y muestren que se tratan como datos literales y no como código.',
      criterios: [
        'La validación de entrada se basa en listas blancas con tipo y longitud definidos.',
        'La codificación de salida se aplica según el contexto de destino (HTML, JS, SQL o URL).',
        'Las pruebas con metacaracteres típicos muestran que se tratan como datos literales.'
      ],
      evidenciaPorDefecto: 'Fragmentos de código de validación de entrada y de codificación de salida por contexto, acompañados de pruebas con metacaracteres representativos y su resultado.'
    },
    {
      id: 'R.093',
      desplegable: false,
      enunciado: 'Garantizar que cada variable empleada en consultas tiene un tipo definido y verificado.',
      objetivo: 'Reducir el riesgo de inyección y de errores de conversión garantizando que cada variable tiene un tipo definido y verificado.',
      explicacion: 'Fragmentos de código con la declaración tipada de las variables empleadas en las consultas, junto con el resultado del análisis estático o del verificador de tipos sin errores, y una prueba que rechace una entrada de tipo no esperado.',
      criterios: [
        'Las variables empleadas en consultas están declaradas con tipo explícito.',
        'El verificador de tipos o el análisis estático se ejecuta sin errores sobre el código aportado.',
        'Existe una prueba que rechaza una entrada de tipo no esperado con un error controlado.'
      ],
      evidenciaPorDefecto: 'Fragmentos de código con declaración tipada, salida del verificador de tipos sin errores y prueba que rechaza una entrada de tipo no esperado.'
    },
    {
      id: 'R.098',
      desplegable: false,
      enunciado: 'Evitar el agotamiento del pool de conexiones y reducir la ventana de exposición de sesiones abiertas.',
      objetivo: 'Evitar el agotamiento del pool de conexiones y reducir la ventana de exposición de sesiones abiertas.',
      explicacion: 'Fragmentos de código donde se aprecie el cierre determinista de la conexión (bloques try-with-resources, using o context manager) y la configuración del pool con sus tiempos máximos de vida e inactividad, junto con una captura de monitorización que muestre que no existen conexiones huérfanas o inactivas persistentes.',
      criterios: [
        'El cierre de la conexión es determinista en todas las rutas de ejecución, incluidas las de error.',
        'La configuración del pool declara tiempo máximo de vida y de inactividad.',
        'La monitorización aportada no muestra conexiones huérfanas ni inactivas persistentes.'
      ],
      evidenciaPorDefecto: 'Fragmentos de código con cierre determinista de conexiones, configuración del pool con sus tiempos y captura de monitorización del estado de las conexiones.'
    },
    {
      id: 'R.114',
      desplegable: false,
      enunciado: 'Aplicar las comprobaciones de tipo en el servidor y no solo en el cliente.',
      objetivo: 'Garantizar que las comprobaciones de tipo se aplican en el servidor y no solo en el cliente, donde pueden eludirse.',
      explicacion: 'Fragmentos de código o captura de la configuración de validación en el servidor con las restricciones aplicadas (rangos numéricos, valores enumerados permitidos y tipos MIME admitidos).',
      criterios: [
        'La validación se ejecuta en el servidor para todos los parámetros de entrada.',
        'Las restricciones incluyen rangos numéricos, valores enumerados permitidos y tipos MIME admitidos cuando aplique.',
        'Una petición que elude el cliente y envía valores fuera de rango es rechazada por el servidor.'
      ],
      evidenciaPorDefecto: 'Fragmentos de código o configuración de validación en servidor con sus restricciones, y prueba de una petición directa que elude el cliente y resulta rechazada.'
    },
    {
      id: 'R.151',
      desplegable: false,
      enunciado: 'Impedir el acceso transversal a datos de otros inquilinos o de niveles de confidencialidad superiores.',
      objetivo: 'Impedir el acceso transversal a datos de otros inquilinos o de niveles de confidencialidad superiores mediante consultas manipuladas.',
      explicacion: 'Fragmentos de código o captura de la capa de acceso a datos donde se aprecie la inyección obligatoria de los filtros de seguridad (identificador de inquilino, etiquetas de confidencialidad y ámbito de usuario) en toda consulta.',
      criterios: [
        'Los filtros de seguridad se inyectan de forma obligatoria en la capa de acceso a datos y no dependen de cada consulta concreta.',
        'Los filtros cubren identificador de inquilino, etiquetas de confidencialidad y ámbito de usuario.',
        'Existe una prueba de acceso transversal manipulado que resulta denegada.'
      ],
      evidenciaPorDefecto: 'Fragmentos de código de la capa de acceso a datos con la inyección obligatoria de filtros de seguridad y prueba de un intento de acceso transversal denegado.'
    },
    {
      id: 'R.152',
      desplegable: false,
      enunciado: 'Evitar que un fallo en la evaluación de autorización derive en un acceso indebido.',
      objetivo: 'Evitar que un fallo en la evaluación de autorización derive en un acceso indebido en nombre de otro usuario.',
      explicacion: 'Fragmento de código o captura del manejo de errores mostrando la cancelación inmediata de la consulta y la devolución de un código de error de autorización explícito.',
      criterios: [
        'Ante un fallo en la evaluación de autorización, la operación se cancela de inmediato sin continuar la consulta.',
        'Se devuelve un código de error de autorización explícito, sin revertir a un comportamiento permisivo por defecto.',
        'El fallo queda registrado con identificador de usuario, sesión y recurso solicitado.'
      ],
      evidenciaPorDefecto: 'Fragmento de código del manejo de errores de autorización mostrando la cancelación inmediata, el código de error devuelto y su registro.'
    }
  ];

  var autores = [
    'a.moreno@empresa.com',
    'l.gutierrez@empresa.com',
    'contratista.externo@proveedor.com',
    'ci-bot@empresa.com',
    'j.ramos@empresa.com',
    'm.silva@empresa.com'
  ];

  CRO.catalog = {
    requisitos: requisitos,
    autores: autores,
    veredictos: {
      conforme: 'Conforme',
      'no-conforme': 'No conforme',
      'no-evaluable': 'No evaluable'
    },
    porId: function (id) {
      for (var i = 0; i < requisitos.length; i++) {
        if (requisitos[i].id === id) return requisitos[i];
      }
      return null;
    },
    desplegables: function (todos) {
      return todos ? requisitos : requisitos.filter(function (r) { return r.desplegable; });
    }
  };
})(window);
