/*
 * catalog.js — Catálogo MOCK de controles de ciberseguridad sobre repositorios Git.
 *
 * Cada control define:
 *   - metadatos (marco de referencia, objetivo sugerido)
 *   - checks: verificaciones concretas que compondrán el plan de ejecución
 *   - evidencia: campos de evidencia recomendados para ese control
 *   - plantillas: hallazgos simulados que el motor mock puede materializar
 *
 * Todo el contenido es ficticio y sirve únicamente para prototipar la interfaz.
 */
(function (global) {
  'use strict';

  var CRO = (global.CRO = global.CRO || {});

  var SEVERIDADES = {
    critica: { etiqueta: 'Crítica', peso: 25, orden: 5 },
    alta: { etiqueta: 'Alta', peso: 15, orden: 4 },
    media: { etiqueta: 'Media', peso: 8, orden: 3 },
    baja: { etiqueta: 'Baja', peso: 3, orden: 2 },
    info: { etiqueta: 'Informativa', peso: 1, orden: 1 }
  };

  var CAMPOS_EVIDENCIA = [
    { id: 'ubicacion', etiqueta: 'Ruta y línea del hallazgo', defecto: true },
    { id: 'commit', etiqueta: 'Commit, autor y fecha', defecto: true },
    { id: 'snippet', etiqueta: 'Fragmento de código / extracto', defecto: true },
    { id: 'impacto', etiqueta: 'Impacto potencial', defecto: true },
    { id: 'recomendacion', etiqueta: 'Recomendación de remediación', defecto: true },
    { id: 'referencia', etiqueta: 'Referencia normativa (CWE / OWASP / ISO)', defecto: true },
    { id: 'cvss', etiqueta: 'Puntuación CVSS estimada', defecto: false },
    { id: 'trazabilidad', etiqueta: 'Identificador de trazabilidad para auditoría', defecto: false }
  ];

  var FORMATOS_EVIDENCIA = [
    { id: 'markdown', etiqueta: 'Informe Markdown' },
    { id: 'json', etiqueta: 'JSON estructurado' },
    { id: 'csv', etiqueta: 'CSV para hoja de cálculo' },
    { id: 'ejecutivo', etiqueta: 'Resumen ejecutivo (tabla)' }
  ];

  var controles = [
    {
      id: 'CTRL-SEC-001',
      nombre: 'Exposición de secretos y credenciales',
      marco: 'OWASP ASVS V2 · NIST SSDF PW.4 · ISO 27001 A.8.24',
      descripcion:
        'Verifica que el repositorio y su histórico no contengan credenciales, tokens, claves privadas ' +
        'ni material criptográfico en claro.',
      objetivoSugerido:
        'Comprobar que no existan secretos en claro en el código ni en el histórico de commits, y que ' +
        'los que existieron estén revocados y rotados.',
      promptSugerido:
        'Analiza el histórico completo de la rama principal buscando credenciales, tokens de API, claves ' +
        'privadas y cadenas de conexión. Para cada coincidencia indica el fichero, la línea, el commit que ' +
        'la introdujo y si el secreto sigue siendo válido. Descarta ejemplos evidentes de documentación y ' +
        'ficheros de test, indicando por qué se descartan. Entrega la evidencia con el secreto enmascarado ' +
        '(solo 4 primeros caracteres) y una recomendación de rotación priorizada.',
      checks: [
        { id: 'SEC-001.1', nombre: 'Secretos en el árbol de trabajo actual' },
        { id: 'SEC-001.2', nombre: 'Secretos en el histórico de commits' },
        { id: 'SEC-001.3', nombre: 'Ficheros .env y de configuración versionados' },
        { id: 'SEC-001.4', nombre: 'Claves privadas y certificados en el repositorio' }
      ],
      plantillas: [
        {
          titulo: 'Token de API en claro dentro del código fuente',
          severidad: 'critica',
          check: 'SEC-001.1',
          archivos: ['src/config/api-client.js', 'app/services/payments.py', 'internal/client/http.go'],
          snippet: 'const API_TOKEN = "sk_live_9f2c****************************";',
          impacto: 'Un atacante con acceso de lectura al repositorio podría operar contra el proveedor externo suplantando a la organización.',
          recomendacion: 'Revocar y rotar el token, moverlo a un gestor de secretos e inyectarlo por variable de entorno en despliegue.',
          referencia: 'CWE-798 · OWASP ASVS 2.10.4',
          cvss: 9.1
        },
        {
          titulo: 'Fichero .env con credenciales de base de datos versionado',
          severidad: 'alta',
          check: 'SEC-001.3',
          archivos: ['.env', 'config/.env.production', 'deploy/.env.staging'],
          snippet: 'DATABASE_URL=postgres://admin:P4ss****@db.interno.local:5432/core',
          impacto: 'Exposición de credenciales de acceso directo a la base de datos de producción.',
          recomendacion: 'Eliminar el fichero del control de versiones, añadirlo a .gitignore y purgar el histórico con git filter-repo.',
          referencia: 'CWE-540 · ISO 27001 A.8.24',
          cvss: 8.2
        },
        {
          titulo: 'Clave privada RSA presente en el histórico de commits',
          severidad: 'critica',
          check: 'SEC-001.2',
          archivos: ['deploy/keys/id_rsa', 'infra/ssh/deploy_key', 'ops/certs/server.key'],
          snippet: '-----BEGIN RSA PRIVATE KEY-----\nMIIEow****************************',
          impacto: 'Permite acceso SSH no autorizado a los servidores de despliegue aunque el fichero ya no esté en HEAD.',
          recomendacion: 'Revocar la clave en todos los hosts, generar un nuevo par y reescribir el histórico del repositorio.',
          referencia: 'CWE-321 · NIST SSDF PW.4.1',
          cvss: 9.4
        },
        {
          titulo: 'Cadena de conexión con contraseña en fichero de pruebas',
          severidad: 'media',
          check: 'SEC-001.1',
          archivos: ['tests/integration/setup.js', 'tests/fixtures/config.yaml'],
          snippet: 'mongodb://ci_user:ci_p4ss****@mongo-test:27017/fixtures',
          impacto: 'Credenciales de entorno de pruebas reutilizables si comparten política con otros entornos.',
          recomendacion: 'Sustituir por credenciales efímeras generadas en tiempo de ejecución por el pipeline de CI.',
          referencia: 'CWE-259 · OWASP ASVS 2.10.1',
          cvss: 5.3
        },
        {
          titulo: 'Token de webhook en documentación interna',
          severidad: 'baja',
          check: 'SEC-001.1',
          archivos: ['docs/integraciones.md', 'README.md'],
          snippet: 'curl -H "X-Hook-Token: whk_3a91****" https://api.interno/hooks',
          impacto: 'Riesgo limitado, pero facilita el reconocimiento de la superficie de integración.',
          recomendacion: 'Sustituir por un marcador genérico del tipo <TOKEN> en la documentación.',
          referencia: 'CWE-532',
          cvss: 3.1
        }
      ]
    },
    {
      id: 'CTRL-SEC-002',
      nombre: 'Vulnerabilidades en dependencias (SCA)',
      marco: 'OWASP Top 10 A06:2021 · NIST SSDF PW.3 · ISO 27001 A.8.8',
      descripcion:
        'Evalúa las dependencias declaradas y transitivas en busca de vulnerabilidades conocidas y de ' +
        'versiones sin soporte.',
      objetivoSugerido:
        'Identificar dependencias con CVE conocidas de severidad alta o crítica y verificar la existencia ' +
        'de un proceso de actualización documentado.',
      promptSugerido:
        'Revisa los manifiestos de dependencias y sus ficheros de bloqueo. Para cada dependencia vulnerable ' +
        'indica versión instalada, versión corregida, CVE, vector de explotación y si la ruta vulnerable es ' +
        'alcanzable desde el código de la aplicación. Prioriza por explotabilidad real, no solo por CVSS, y ' +
        'entrega un plan de actualización en tres olas: inmediata, 30 días y siguiente release.',
      checks: [
        { id: 'SEC-002.1', nombre: 'CVE conocidas en dependencias directas' },
        { id: 'SEC-002.2', nombre: 'CVE conocidas en dependencias transitivas' },
        { id: 'SEC-002.3', nombre: 'Ficheros de bloqueo (lockfile) presentes y coherentes' },
        { id: 'SEC-002.4', nombre: 'Dependencias sin mantenimiento o fuera de soporte' }
      ],
      plantillas: [
        {
          titulo: 'Dependencia directa con vulnerabilidad crítica de ejecución remota',
          severidad: 'critica',
          check: 'SEC-002.1',
          archivos: ['package.json', 'requirements.txt', 'pom.xml'],
          snippet: '"serialize-lib": "^2.4.1"   → corregido en 2.6.0 (CVE-2024-MOCK-1188)',
          impacto: 'Deserialización insegura alcanzable desde un endpoint público de la aplicación.',
          recomendacion: 'Actualizar a la versión parcheada y validar con la batería de pruebas de regresión.',
          referencia: 'CWE-502 · OWASP A06:2021',
          cvss: 9.8
        },
        {
          titulo: 'Vulnerabilidad de denegación de servicio en dependencia transitiva',
          severidad: 'alta',
          check: 'SEC-002.2',
          archivos: ['package-lock.json', 'poetry.lock', 'go.sum'],
          snippet: 'parser-core 1.2.3 (vía http-toolkit@4.0.0) → corregido en 1.2.9',
          impacto: 'Entradas manipuladas pueden agotar CPU del servicio de ingesta.',
          recomendacion: 'Forzar resolución a la versión corregida mediante overrides del gestor de paquetes.',
          referencia: 'CWE-400',
          cvss: 7.5
        },
        {
          titulo: 'Ausencia de fichero de bloqueo de dependencias',
          severidad: 'media',
          check: 'SEC-002.3',
          archivos: ['package.json', 'requirements.txt'],
          snippet: 'No se encuentra package-lock.json ni yarn.lock en la raíz del repositorio.',
          impacto: 'Builds no reproducibles y exposición a ataques de sustitución de dependencias.',
          recomendacion: 'Generar y versionar el lockfile; habilitar instalación en modo estricto en CI.',
          referencia: 'NIST SSDF PW.3.1',
          cvss: 5.9
        },
        {
          titulo: 'Librería sin mantenimiento desde hace más de 36 meses',
          severidad: 'media',
          check: 'SEC-002.4',
          archivos: ['package.json', 'build.gradle'],
          snippet: 'legacy-xml-utils 0.9.4 — último release hace 41 meses, repositorio archivado.',
          impacto: 'Sin canal de parcheo ante futuras vulnerabilidades.',
          recomendacion: 'Planificar sustitución por una alternativa mantenida o asumir el mantenimiento internamente.',
          referencia: 'ISO 27001 A.8.8',
          cvss: 4.3
        },
        {
          titulo: 'Dependencia con licencia incompatible con la política interna',
          severidad: 'baja',
          check: 'SEC-002.1',
          archivos: ['package.json', 'go.mod'],
          snippet: 'strong-copyleft-lib 3.1.0 — licencia AGPL-3.0',
          impacto: 'Riesgo legal en distribución del producto.',
          recomendacion: 'Validar con el área legal o sustituir por una alternativa con licencia permisiva.',
          referencia: 'ISO 27001 A.5.32',
          cvss: 2.5
        }
      ]
    },
    {
      id: 'CTRL-SEC-003',
      nombre: 'Gobierno del repositorio y protección de ramas',
      marco: 'NIST SSDF PO.3 · SLSA Nivel 2 · ISO 27001 A.8.4',
      descripcion:
        'Comprueba que existan reglas de protección de rama, revisión obligatoria por pares y firma de ' +
        'commits en las ramas productivas.',
      objetivoSugerido:
        'Verificar que ningún cambio llegue a la rama productiva sin revisión aprobada, comprobaciones de ' +
        'CI superadas y trazabilidad del autor.',
      promptSugerido:
        'Evalúa la configuración de gobierno del repositorio: protección de la rama principal, número de ' +
        'aprobaciones requeridas, prohibición de push forzado, firma de commits y propietarios de código. ' +
        'Contrasta la configuración declarada con el comportamiento real observado en los últimos 100 ' +
        'commits y señala toda excepción. La evidencia debe incluir la configuración detectada y al menos ' +
        'un ejemplo real de incumplimiento cuando exista.',
      checks: [
        { id: 'SEC-003.1', nombre: 'Protección de la rama principal activa' },
        { id: 'SEC-003.2', nombre: 'Revisión por pares obligatoria antes de la fusión' },
        { id: 'SEC-003.3', nombre: 'Firma de commits verificada' },
        { id: 'SEC-003.4', nombre: 'Fichero CODEOWNERS definido y vigente' }
      ],
      plantillas: [
        {
          titulo: 'Rama principal sin reglas de protección',
          severidad: 'alta',
          check: 'SEC-003.1',
          archivos: ['.github/settings.yml', '(configuración del servidor Git)'],
          snippet: 'branch_protection: { main: null } — se permiten push directos y forzados.',
          impacto: 'Un único usuario comprometido puede introducir código en producción sin revisión.',
          recomendacion: 'Activar protección de rama con revisión obligatoria y bloqueo de push forzado.',
          referencia: 'NIST SSDF PO.3.2 · SLSA L2',
          cvss: 7.4
        },
        {
          titulo: 'Fusiones sin aprobación registrada en los últimos 90 días',
          severidad: 'media',
          check: 'SEC-003.2',
          archivos: ['(histórico de pull requests)'],
          snippet: '7 de 42 fusiones a main sin revisión aprobada por un segundo usuario.',
          impacto: 'Se rompe el principio de segregación de funciones en el flujo de cambios.',
          recomendacion: 'Exigir al menos una aprobación y bloquear la autoaprobación del autor.',
          referencia: 'ISO 27001 A.8.32',
          cvss: 5.4
        },
        {
          titulo: 'Commits sin firma verificada en rama productiva',
          severidad: 'media',
          check: 'SEC-003.3',
          archivos: ['(histórico de commits)'],
          snippet: '63 % de los commits de main carecen de firma GPG/SSH verificada.',
          impacto: 'No se puede acreditar la autoría de los cambios ante una investigación.',
          recomendacion: 'Exigir commits firmados y distribuir claves de firma mediante la gestión de identidades.',
          referencia: 'SLSA L2 · NIST SSDF PS.2',
          cvss: 4.8
        },
        {
          titulo: 'CODEOWNERS ausente para directorios sensibles',
          severidad: 'baja',
          check: 'SEC-003.4',
          archivos: ['.github/CODEOWNERS'],
          snippet: 'No hay propietarios asignados para /infra ni para /src/auth.',
          impacto: 'Cambios en componentes críticos pueden revisarse por perfiles sin contexto de seguridad.',
          recomendacion: 'Definir CODEOWNERS con el equipo de seguridad como revisor obligatorio de esas rutas.',
          referencia: 'NIST SSDF PO.2.1',
          cvss: 3.4
        }
      ]
    },
    {
      id: 'CTRL-SEC-004',
      nombre: 'Seguridad de la cadena de CI/CD',
      marco: 'SLSA Nivel 3 · OWASP Top 10 CI/CD · NIST SSDF PO.5',
      descripcion:
        'Analiza los flujos de integración y despliegue continuo en busca de permisos excesivos, acciones ' +
        'no fijadas y ejecución de código no confiable.',
      objetivoSugerido:
        'Asegurar que los pipelines no puedan ser utilizados para exfiltrar secretos ni para introducir ' +
        'artefactos no autorizados en producción.',
      promptSugerido:
        'Revisa las definiciones de pipeline del repositorio. Busca acciones o imágenes referenciadas por ' +
        'etiqueta móvil en lugar de por hash, permisos de token amplios, ejecución de código procedente de ' +
        'forks y uso de secretos en pasos que ejecutan entradas no confiables. Entrega por cada hallazgo el ' +
        'fichero de workflow, el trabajo y el paso concreto, además del escenario de abuso paso a paso.',
      checks: [
        { id: 'SEC-004.1', nombre: 'Acciones y contenedores fijados por hash' },
        { id: 'SEC-004.2', nombre: 'Permisos mínimos del token del pipeline' },
        { id: 'SEC-004.3', nombre: 'Ejecución de código de fuentes no confiables' },
        { id: 'SEC-004.4', nombre: 'Gestión de secretos en el pipeline' }
      ],
      plantillas: [
        {
          titulo: 'Acción de terceros referenciada por etiqueta móvil',
          severidad: 'alta',
          check: 'SEC-004.1',
          archivos: ['.github/workflows/ci.yml', '.gitlab-ci.yml', '.github/workflows/release.yml'],
          snippet: 'uses: vendor-externo/deploy-action@v3   # etiqueta mutable, no fijada por SHA',
          impacto: 'El mantenedor de la acción o quien la comprometa puede ejecutar código arbitrario con acceso a los secretos del pipeline.',
          recomendacion: 'Fijar la acción a un SHA completo y revisar periódicamente las actualizaciones.',
          referencia: 'SLSA L3 · CICD-SEC-4',
          cvss: 8.1
        },
        {
          titulo: 'Token del pipeline con permisos de escritura globales',
          severidad: 'alta',
          check: 'SEC-004.2',
          archivos: ['.github/workflows/ci.yml'],
          snippet: 'permissions: write-all',
          impacto: 'Cualquier paso comprometido podría modificar el repositorio o publicar releases.',
          recomendacion: 'Declarar permisos mínimos por trabajo (contents: read) y elevar solo donde sea imprescindible.',
          referencia: 'CICD-SEC-5 · NIST SSDF PO.5.1',
          cvss: 7.6
        },
        {
          titulo: 'Workflow con disparador pull_request_target y checkout del fork',
          severidad: 'critica',
          check: 'SEC-004.3',
          archivos: ['.github/workflows/pr-checks.yml'],
          snippet: 'on: pull_request_target\n  steps:\n    - uses: actions/checkout@v4\n      with: { ref: ${{ github.event.pull_request.head.sha }} }',
          impacto: 'Permite a un contribuidor externo ejecutar código con acceso a los secretos del repositorio.',
          recomendacion: 'Separar el pipeline de validación no confiable del pipeline con secretos y exigir aprobación manual.',
          referencia: 'CICD-SEC-4 · CWE-829',
          cvss: 9.3
        },
        {
          titulo: 'Secreto expuesto en la salida de registro del pipeline',
          severidad: 'media',
          check: 'SEC-004.4',
          archivos: ['.github/workflows/deploy.yml', 'ci/scripts/publish.sh'],
          snippet: 'echo "Desplegando con clave ${DEPLOY_KEY}"',
          impacto: 'El valor del secreto queda registrado en artefactos de ejecución accesibles al equipo.',
          recomendacion: 'Eliminar la traza, registrar únicamente identificadores y activar el enmascarado de secretos.',
          referencia: 'CWE-532 · CICD-SEC-6',
          cvss: 6.5
        }
      ]
    },
    {
      id: 'CTRL-SEC-005',
      nombre: 'Configuración insegura de infraestructura como código',
      marco: 'CIS Benchmarks · NIST SP 800-53 CM-6 · ISO 27001 A.8.9',
      descripcion:
        'Revisa manifiestos de infraestructura como código en busca de configuraciones que expongan ' +
        'servicios o debiliten los controles de acceso.',
      objetivoSugerido:
        'Detectar recursos definidos como código que se desplegarían con acceso público, cifrado ' +
        'desactivado o privilegios excesivos.',
      promptSugerido:
        'Analiza los manifiestos de infraestructura como código del repositorio. Para cada recurso ' +
        'inseguro indica el fichero, el bloque de recurso, el valor actual y el valor esperado según el ' +
        'estándar interno. Diferencia entre entornos (desarrollo, preproducción, producción) y prioriza ' +
        'producción. Entrega la evidencia incluyendo el fragmento del manifiesto y el comando de ' +
        'verificación que permitiría reproducir el hallazgo.',
      checks: [
        { id: 'SEC-005.1', nombre: 'Recursos expuestos a redes públicas' },
        { id: 'SEC-005.2', nombre: 'Cifrado en reposo y en tránsito' },
        { id: 'SEC-005.3', nombre: 'Privilegios de contenedores y cargas de trabajo' },
        { id: 'SEC-005.4', nombre: 'Registro y auditoría habilitados' }
      ],
      plantillas: [
        {
          titulo: 'Grupo de seguridad abierto a 0.0.0.0/0 en puerto administrativo',
          severidad: 'critica',
          check: 'SEC-005.1',
          archivos: ['infra/terraform/network.tf', 'deploy/aws/security-groups.tf'],
          snippet: 'ingress { from_port = 22, to_port = 22, cidr_blocks = ["0.0.0.0/0"] }',
          impacto: 'Exposición del acceso administrativo a toda Internet.',
          recomendacion: 'Restringir a rangos corporativos o sustituir por acceso mediante bastión con autenticación fuerte.',
          referencia: 'CIS AWS 5.2 · CWE-284',
          cvss: 9.0
        },
        {
          titulo: 'Almacenamiento de objetos sin cifrado en reposo',
          severidad: 'alta',
          check: 'SEC-005.2',
          archivos: ['infra/terraform/storage.tf', 'infra/pulumi/buckets.ts'],
          snippet: 'resource "bucket" "datos" { encryption = false }',
          impacto: 'Datos sensibles almacenados sin cifrado gestionado.',
          recomendacion: 'Activar cifrado con clave gestionada por la organización y política de rotación.',
          referencia: 'NIST SP 800-53 SC-28',
          cvss: 7.1
        },
        {
          titulo: 'Contenedor ejecutándose como root con privilegios elevados',
          severidad: 'alta',
          check: 'SEC-005.3',
          archivos: ['k8s/deployment.yaml', 'Dockerfile', 'helm/values.yaml'],
          snippet: 'securityContext:\n  privileged: true\n  runAsUser: 0',
          impacto: 'Un compromiso del contenedor permitiría escapar al nodo anfitrión.',
          recomendacion: 'Ejecutar con usuario sin privilegios, deshabilitar privileged y aplicar perfiles seccomp.',
          referencia: 'CIS Kubernetes 5.2.5 · CWE-250',
          cvss: 8.4
        },
        {
          titulo: 'Registros de auditoría deshabilitados en el plano de control',
          severidad: 'media',
          check: 'SEC-005.4',
          archivos: ['infra/terraform/logging.tf'],
          snippet: 'audit_logs { enabled = false }',
          impacto: 'Imposibilidad de investigar incidentes con trazas fiables.',
          recomendacion: 'Habilitar auditoría con retención mínima de 12 meses y envío al SIEM corporativo.',
          referencia: 'ISO 27001 A.8.15',
          cvss: 5.3
        }
      ]
    },
    {
      id: 'CTRL-SEC-006',
      nombre: 'Patrones inseguros en el código fuente (SAST)',
      marco: 'OWASP Top 10 · CWE Top 25 · NIST SSDF PW.7',
      descripcion:
        'Búsqueda de patrones de código que habitualmente derivan en vulnerabilidades explotables.',
      objetivoSugerido:
        'Identificar inyecciones, validación de entrada insuficiente y uso de primitivas criptográficas ' +
        'obsoletas en el código de la aplicación.',
      promptSugerido:
        'Realiza un análisis estático orientado a flujo de datos: identifica fuentes de entrada no ' +
        'confiable y sigue su recorrido hasta los sumideros sensibles (consultas, comandos del sistema, ' +
        'plantillas, deserialización). Para cada hallazgo entrega la traza fuente → sumidero, el fichero y ' +
        'la línea de ambos extremos, y una prueba de concepto no destructiva. Marca explícitamente los ' +
        'falsos positivos descartados y el motivo.',
      checks: [
        { id: 'SEC-006.1', nombre: 'Inyección en consultas y comandos' },
        { id: 'SEC-006.2', nombre: 'Validación y saneamiento de entradas' },
        { id: 'SEC-006.3', nombre: 'Uso de criptografía obsoleta o insegura' },
        { id: 'SEC-006.4', nombre: 'Gestión de errores y fuga de información' }
      ],
      plantillas: [
        {
          titulo: 'Consulta SQL construida por concatenación de entrada de usuario',
          severidad: 'critica',
          check: 'SEC-006.1',
          archivos: ['src/repositories/user-repository.js', 'app/dao/orders.py', 'internal/store/query.go'],
          snippet: 'db.query("SELECT * FROM usuarios WHERE email = \'" + req.query.email + "\'")',
          impacto: 'Permite extraer o modificar datos arbitrarios de la base de datos.',
          recomendacion: 'Usar consultas parametrizadas o el ORM con enlazado de parámetros.',
          referencia: 'CWE-89 · OWASP A03:2021',
          cvss: 9.8
        },
        {
          titulo: 'Ejecución de comando del sistema con entrada no saneada',
          severidad: 'alta',
          check: 'SEC-006.1',
          archivos: ['src/utils/convert.js', 'scripts/process.py'],
          snippet: 'exec("ffmpeg -i " + nombreArchivoUsuario + " salida.mp4")',
          impacto: 'Ejecución remota de comandos en el servidor de procesamiento.',
          recomendacion: 'Invocar el binario con lista de argumentos y validar el nombre contra una lista blanca.',
          referencia: 'CWE-78',
          cvss: 8.8
        },
        {
          titulo: 'Uso de algoritmo de hash obsoleto para contraseñas',
          severidad: 'alta',
          check: 'SEC-006.3',
          archivos: ['src/auth/password.js', 'app/security/hashing.py'],
          snippet: 'const hash = crypto.createHash("md5").update(password).digest("hex");',
          impacto: 'Las contraseñas pueden recuperarse con ataques de diccionario acelerados por GPU.',
          recomendacion: 'Migrar a Argon2id o bcrypt con parámetros de coste revisados anualmente.',
          referencia: 'CWE-327 · OWASP ASVS 2.4.1',
          cvss: 7.5
        },
        {
          titulo: 'Traza de excepción devuelta al cliente en respuesta de error',
          severidad: 'media',
          check: 'SEC-006.4',
          archivos: ['src/middleware/error-handler.js', 'app/api/handlers.py'],
          snippet: 'res.status(500).json({ error: err.stack });',
          impacto: 'Revela rutas internas, versiones y estructura del sistema a un atacante.',
          recomendacion: 'Devolver un identificador de error y registrar el detalle únicamente en el sistema de trazas.',
          referencia: 'CWE-209',
          cvss: 5.3
        },
        {
          titulo: 'Validación de entrada ausente en parámetro de paginación',
          severidad: 'baja',
          check: 'SEC-006.2',
          archivos: ['src/controllers/list-controller.js'],
          snippet: 'const limite = req.query.limit; // sin límite máximo ni conversión segura',
          impacto: 'Permite solicitudes que degradan el rendimiento del servicio.',
          recomendacion: 'Validar el rango permitido y aplicar un máximo por defecto.',
          referencia: 'CWE-20',
          cvss: 3.7
        }
      ]
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
    severidades: SEVERIDADES,
    camposEvidencia: CAMPOS_EVIDENCIA,
    formatosEvidencia: FORMATOS_EVIDENCIA,
    controles: controles,
    autores: autores,
    porId: function (id) {
      for (var i = 0; i < controles.length; i++) {
        if (controles[i].id === id) return controles[i];
      }
      return null;
    }
  };
})(window);
