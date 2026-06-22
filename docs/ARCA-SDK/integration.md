----
url: https://www.afipts.com/basic-use.html
----

[Skip to content](#VPContent)

# 🚀 Uso Básico [​](#🚀-uso-basico)

A continuación, veremos cómo instanciar la SDK y realizar una operación básica: crear una factura electrónica.

***

## Inicialización [​](#inicializacion)

Para comenzar, necesitas instanciar la clase principal `Arca`. Esta clase actúa como el punto de entrada a todos los servicios.

Requisitos

Asegúrate de tener a mano tu **clave privada** (`key`) y tu **certificado** (`cert`) generados en el portal de ARCA.

ts

```
import { Arca } from "@arcasdk/core";

// Instancia la SDK con tus credenciales
const arca = new Arca({
  cuit: 20111111112,
  cert: "contenido_del_certificado", // O path al archivo .crt
  key: "contenido_de_la_clave_privada", // O path al archivo .key
});
```

***

## Ejemplo: Crear Factura (CAE) [​](#ejemplo-crear-factura-cae)

El siguiente ejemplo muestra cómo generar un comprobante (Factura B) para un consumidor final.

Gestión Automática

La SDK maneja automáticamente la obtención del ticket de acceso (TA) si este ha expirado. ¡No necesitas preocuparte por la autenticación manual!

ts

```
try {
  const invoice = await arca.electronicBillingService.createVoucher({
    CantReg: 1, // Cantidad de registros
    PtoVta: 1, // Punto de venta configurado en ARCA
    CbteTipo: 6, // 6 = Factura B
    Concepto: 1, // 1 = Productos
    DocTipo: 99, // 99 = Consumidor Final
    DocNro: 0, // 0 para Consumidor Final
    CbteDesde: 1, // Número de comprobante (debe ser el próximo libre)
    CbteHasta: 1,
    CbteFch: "20240101", // Fecha del comprobante (YYYYMMDD como string)
    ImpTotal: 121, // Importe Total
    ImpTotConc: 0, // Importe Neto no Gravado
    ImpNeto: 100, // Importe Neto Gravado
    ImpOpEx: 0, // Importe Exento
    ImpIVA: 21, // Importe IVA
    ImpTrib: 0, // Importe Tributos
    MonId: "PES", // Moneda
    MonCotiz: 1, // Cotización

    // Detalle de IVA (21%)
    Iva: [
      {
        Id: 5, // 5 = 21%
        BaseImp: 100,
        Importe: 21,
      },
    ],
  });

  console.log("CAE Asignado:", invoice.CAE);
  console.log("Vencimiento CAE:", invoice.CAEFchVto);
} catch (error) {
  console.error("Error al facturar:", error.message);
}
```

Ver respuesta completa de ARCA

json

```
{
  "CAE": "74154876254185",
  "CAEFchVto": "20240111",
  "Resultado": "A",
  "Reproceso": "N",
  "PtoVta": 1,
  "CbteTipo": 6
}
```

***

## Respuesta de ARCA [​](#respuesta-de-arca)

La respuesta incluye el **CAE (Código de Autorización Electrónica)** que es el dato más importante:

| Campo         | Descripción                                    |
| ------------- | ---------------------------------------------- |
| **CAE**       | Código único de autorización del comprobante   |
| **CAEFchVto** | Fecha de vencimiento del CAE (YYYYMMDD)        |
| **Resultado** | `A` = Aceptado, `R` = Rechazado, `P` = Parcial |
| **Reproceso** | `S` = Sí, `N` = No                             |
| **PtoVta**    | Punto de venta utilizado                       |
| **CbteTipo**  | Tipo de comprobante                            |

***

## Próximos Pasos [​](#proximos-pasos)

* [Facturación Electrónica](/services/facturacion_electronica.html) — Explora todas las opciones de facturación
* [Padrón Alcance 4](/services/consulta_padron_alcance_4.html) — Consulta datos de contribuyentes
* [Configuración](/config.html) — Personaliza la SDK para tu entorno
* [Gestión de Credenciales](/credential_management.html) — Mejores prácticas de seguridad

----
url: https://www.afipts.com/services/facturacion_electronica.html
----

[Skip to content](#VPContent)

# Facturación Electrónica [​](#facturacion-electronica)

El servicio `electronicBillingService` permite la gestión completa de comprobantes electrónicos (Facturas, Notas de Crédito, Débito, etc.) a través del Web Service de Facturación Electrónica (WSFE).

Documentación Oficial

[Manual del Desarrollador - ARCA (PDF)](http://www.arca.gob.ar/fe/documentos/manual_desarrollador_COMPG_v2_10.pdf)

***

## Crear Comprobante (CAE) [​](#crear-comprobante-cae)

El método principal para generar una factura y obtener el CAE.

### Parámetros de `createVoucher` [​](#parametros-de-createvoucher)

| Parámetro    | Tipo        | Descripción                                  |
| ------------ | ----------- | -------------------------------------------- |
| `CantReg`    | number      | Cantidad de registros (normalmente `1`)      |
| `PtoVta`     | number      | Punto de venta (1-9999)                      |
| `CbteTipo`   | number      | Tipo de comprobante (ver tabla)              |
| `Concepto`   | number      | Tipo de concepto (ver tabla)                 |
| `DocTipo`    | number      | Tipo de documento del receptor (ver tabla)   |
| `DocNro`     | number      | Nro de documento (`0` para Consumidor Final) |
| `CbteDesde`  | number      | Número de comprobante desde                  |
| `CbteHasta`  | number      | Número de comprobante hasta                  |
| `CbteFch`    | string      | Fecha en formato `YYYYMMDD`                  |
| `ImpTotal`   | number      | Importe total                                |
| `ImpNeto`    | number      | Importe neto gravado                         |
| `ImpIVA`     | number      | Importe IVA total                            |
| `ImpTotConc` | number      | Importe no gravado                           |
| `ImpOpEx`    | number      | Importe operaciones exentas                  |
| `ImpTrib`    | number      | Importe de tributos                          |
| `MonId`      | string      | Moneda (`PES`, `DOL`, etc.)                  |
| `MonCotiz`   | number      | Cotización de la moneda                      |
| `Iva`        | IVA\[]      | Alícuotas de IVA aplicadas                   |
| `Tributos`   | Tributo\[]  | *(opcional)* Tributos adicionales            |
| `CbtesAsoc`  | CbteAsoc\[] | *(opcional)* Comprobantes asociados (NC/ND)  |

### Tipos de Comprobante (`CbteTipo`) [​](#tipos-de-comprobante-cbtetipo)

| Código | Descripción                        |
| ------ | ---------------------------------- |
| 1      | Factura A                          |
| 2      | Nota de Débito A                   |
| 3      | Nota de Crédito A                  |
| 6      | Factura B                          |
| 7      | Recibo B                           |
| 8      | Nota de Débito B                   |
| 9      | Nota de Crédito B                  |
| 11     | Factura C                          |
| 12     | Recibo C                           |
| 13     | Nota de Débito C                   |
| 14     | Nota de Crédito C                  |
| 51     | Factura M                          |
| 81     | Tique Factura A                    |
| 82     | Tique Factura B                    |
| 83     | Tique                              |
| 91     | Remito R                           |
| 118    | Tique Factura T                    |
| 201    | Factura de Crédito MiPyMEs (FCE) A |
| 206    | Factura de Crédito MiPyMEs (FCE) B |
| 211    | Factura de Crédito MiPyMEs (FCE) C |

### Tipos de Documento (`DocTipo`) [​](#tipos-de-documento-doctipo)

| Código | Descripción         |
| ------ | ------------------- |
| 80     | CUIT                |
| 86     | CUIL                |
| 87     | DNI                 |
| 89     | Libreta Cívica (LC) |
| 90     | Extranjeros         |
| 91     | Pasaporte           |
| 92     | Documento Mercosur  |
| 99     | Consumidor Final    |

### Conceptos (`Concepto`) [​](#conceptos-concepto)

| Código | Descripción           |
| ------ | --------------------- |
| 1      | Productos             |
| 2      | Servicios             |
| 3      | Productos y Servicios |

### Códigos de Alícuota IVA (`Iva[].Id`) [​](#codigos-de-alicuota-iva-iva-id)

| ID | Tasa  |
| -- | ----- |
| 3  | 0%    |
| 4  | 10.5% |
| 5  | 21%   |
| 6  | 27%   |
| 7  | 5%    |
| 8  | 2.5%  |

### Respuesta [​](#respuesta)

ts

```
{
  CAE: string; // Código de Autorización Electrónica
  CAEFchVto: string; // Vencimiento del CAE (YYYYMMDD)
  Resultado: "A" | "R" | "P"; // Aceptado, Rechazado, Parcial
  Reproceso: "S" | "N";
  PtoVta: number;
  CbteTipo: number;
}
```

### Ejemplo Básico [​](#ejemplo-basico)

ts

```
const invoice = await arca.electronicBillingService.createVoucher({
  CantReg: 1,
  PtoVta: 1,
  CbteTipo: 6, // Factura B
  Concepto: 1, // Productos
  DocTipo: 99, // Consumidor Final
  DocNro: 0,
  CbteDesde: 1,
  CbteHasta: 1,
  CbteFch: "20240101", // String en formato YYYYMMDD
  ImpTotal: 121,
  ImpTotConc: 0,
  ImpNeto: 100,
  ImpOpEx: 0,
  ImpIVA: 21,
  ImpTrib: 0,
  MonId: "PES",
  MonCotiz: 1,
  Iva: [
    {
      Id: 5, // 21%
      BaseImp: 100,
      Importe: 21,
    },
  ],
});
```

Ver respuesta completa

json

```
{
  "CAE": "74154876254185",
  "CAEFchVto": "20240111",
  "Resultado": "A",
  "Reproceso": "N",
  "PtoVta": 1,
  "CbteTipo": 6
}
```

***

## Siguiente Comprobante Automático [​](#siguiente-comprobante-automatico)

`createNextVoucher` combina `getLastVoucher` + `createVoucher` en un solo paso. No requiere `CbteDesde` ni `CbteHasta`.

ts

```
const invoice = await arca.electronicBillingService.createNextVoucher({
  CantReg: 1,
  PtoVta: 1,
  CbteTipo: 6,
  Concepto: 1,
  DocTipo: 99,
  DocNro: 0,
  CbteFch: "20240501",
  ImpTotal: 121,
  ImpTotConc: 0,
  ImpNeto: 100,
  ImpOpEx: 0,
  ImpIVA: 21,
  ImpTrib: 0,
  MonId: "PES",
  MonCotiz: 1,
  Iva: [{ Id: 5, BaseImp: 100, Importe: 21 }],
});
```

***

## Consultar Último Comprobante [​](#consultar-ultimo-comprobante)

Obtiene el número del último comprobante autorizado para un punto de venta y tipo específico.

ts

```
const lastVoucher = await arca.electronicBillingService.getLastVoucher(1, 6);
console.log(`Último comprobante: ${lastVoucher}`);
```

***

## Información de Comprobante [​](#informacion-de-comprobante)

Recupera los datos de un comprobante ya emitido.

ts

```
const voucherInfo = await arca.electronicBillingService.getVoucherInfo(1, 1, 6);
// getVoucherInfo(nroComprobante, puntoVenta, tipoComprobante)

if (voucherInfo) {
  console.log("Datos del comprobante:", voucherInfo);
} else {
  console.log("El comprobante no existe.");
}
```

***

## Tablas de Referencia [​](#tablas-de-referencia)

Métodos auxiliares para obtener los códigos y tipos disponibles en ARCA.

Puntos de VentaTipos ComprobanteConceptosDocumentosAlícuotasMonedasTributos

ts

```
const salesPoints = await arca.electronicBillingService.getSalesPoints();
```

ts

```
const voucherTypes = await arca.electronicBillingService.getVoucherTypes();
```

ts

```
const conceptTypes = await arca.electronicBillingService.getConceptTypes();
```

ts

```
const documentTypes = await arca.electronicBillingService.getDocumentTypes();
```

ts

```
const aliquotTypes = await arca.electronicBillingService.getAliquotTypes();
```

ts

```
const currencies = await arca.electronicBillingService.getCurrenciesTypes();
```

ts

```
const taxTypes = await arca.electronicBillingService.getTaxTypes();
```

***

## Estado del Servidor [​](#estado-del-servidor)

Verifica si los servicios de ARCA están operativos.

ts

```
const status = await arca.electronicBillingService.getServerStatus();
console.log(status);
```

----
url: https://www.afipts.com/soap-engines.html
----

[Skip to content](#VPContent)

# Engines SOAP y Runtimes [​](#engines-soap-y-runtimes)

Esta guía explica cómo el SDK selecciona el transporte SOAP según el entorno de ejecución y cómo inyectar un engine personalizado.

***

## Selección automática de engine [​](#seleccion-automatica-de-engine)

El SDK detecta el runtime y selecciona un engine SOAP:

* **Node.js**: usa `HttpClient` de `soap`.
* **Universal**: `fetch` para Workers, navegadores y demás entornos no-Node.

La detección se realiza con `detectSoapRuntime` y el engine se crea con `createSoapEngine`.

## Compatibilidad con ARCA/AFIP [​](#compatibilidad-con-arca-afip)

* En **Node.js** se puede habilitar compatibilidad TLS legacy (`useHttpsAgent`) para servidores que lo requieran.
* En **Universal** (Workers, edge, etc.) no existe `https.Agent`; dependen de la pila TLS del runtime.

Si un endpoint requiere renegociación o parámetros TLS legacy específicos, el entorno recomendado es Node.js.

## Inyectar un engine personalizado [​](#inyectar-un-engine-personalizado)

Podés inyectar tu propio transporte SOAP pasando `httpClient` al crear el cliente.\
Cuando `httpClient` está definido, no se usa el engine default del SDK.

ts

```
import type { IHttpClient } from "soap";
import { SoapClient } from "@arcasdk/core";

const customEngine: IHttpClient = {
  request(rurl, data, callback, exheaders, exoptions) {
    // Implementación custom del transporte
    callback(null, { statusCode: 200, headers: {}, body: "", data: "" }, "");
  },
};

const soapClient = new SoapClient();
const client = await soapClient.createClient("wsaa.wsdl", {
  httpClient: customEngine,
});
```

## Forzar runtime explícitamente [​](#forzar-runtime-explicitamente)

También podés forzar el runtime sin inyectar `httpClient`, para obligar al SDK a usar un engine interno específico.

ts

```
import { SoapClient } from "@arcasdk/core";
import { SoapRuntime } from "@arcasdk/core";

const soapClient = new SoapClient();
const client = await soapClient.createClient("wsaa.wsdl", {
  runtime: SoapRuntime.Universal,
});
```

## Cuándo usar cada enfoque [​](#cuando-usar-cada-enfoque)

* Usar engine default: recomendado para la mayoría de los casos.
* Inyectar `httpClient`: útil si necesitás observabilidad, retry policies custom o un transporte propio.

----
url: https://www.afipts.com/config.html
----

[Skip to content](#VPContent)

# ⚙️ Contexto [​](#⚙️-contexto)

### Contexto de Arca: [​](#contexto-de-arca)

La clase `Arca` recibe un objeto de tipo `Context` como parámetro, el cual proporciona los datos básicos necesarios para utilizar los servicios web de ARCA, así como también cómo deben comportarse:

ts

```
const instancia = new Arca(Contexto);
```

* `Contexto`:

  * `production` (booleano): Flag que permite especificar si se utilizarán los servicios de producción o de homologación (pruebas).
  * `cert` \*(cadena): Contenido del certificado `(.crt)`.
  * `key` \*(cadena): Contenido de la llave privada.
  * `cuit` \*(número): CUIT del usuario que se utilizará.
  * `credentials` (ILoginCredentials): Un objeto de tipo `ILoginCredentials` que contiene las credenciales de autenticación si ya se tienen guardadas. Este objeto debe tener la estructura `{ header: {...}, credentials: {...} }` obtenida de un `AccessTicket` mediante el método `toLoginCredentials()`.
  * `handleTicket` (booleano): Flag que indica si los tickets de autenticación son gestionados automáticamente por el paquete o si serán proporcionados por el desarrollador (más adelante se explicará cómo hacer inicio de sesión y luego pasar los tokens antes de llamar al servicio web deseado). Esto es útil cuando se desea utilizar el paquete en una función `lambda` o en algun lugar que no se tenga almacenamiento.
  * `ticketPath` (cadena): La ruta preferida donde se desean guardar los tokens obtenidos del servicio WSAA si no se desea utilizar la carpeta predeterminada.
  * `useSoap12` (booleano, opcional): Flag que indica si se debe usar SOAP 1.2 en lugar de SOAP 1.1 para el servicio de Facturación Electrónica. Por defecto es `true` (usa SOAP 1.2).
  * `useHttpsAgent` (booleano, opcional): Flag que habilita el uso de un agente HTTPS con configuración legacy para servidores ARCA/AFIP antiguos. **Por defecto es `false`** (deshabilitado). Ver más detalles abajo.

Context Type:

ts

```
type Context = {
  /**
   * Flag for production or testing environment
   *
   * @var boolean
   **/
  production?: boolean;

  /**
   * Content file for the X.509 certificate in PEM format
   *
   * @var string
   **/
  cert: string;

  /**
   * Content file for the private key corresponding to CERT (PEM)
   *
   * @var string
   **/
  key: string;

  /**
   * The CUIT to use
   *
   * @var int
   **/
  cuit: number;

  /**
   * Tokens object if you have one created before
   *
   * @var credentials
   **/
  credentials?: ILoginCredentials;

  /**
   * Flag that if is true, the access tickets data is handled by the developer, otherwise is saved locally.
   */
  handleTicket?: boolean;

  /**
   * The path of the auth obj if the package is auto managed
   */
  ticketPath?: string;

  /**
   * Use SOAP 1.2 instead of SOAP 1.1 for Electronic Billing service
   * @default true (uses SOAP 1.2 by default)
   */
  useSoap12?: boolean;

  /**
   * Enable HTTPS Agent for Node.js environments (required for legacy ARCA servers)
   * Set to true when running in Node.js environments that require legacy HTTPS agent
   * Set to false when running in Cloudflare Workers or other edge runtimes
   * @default false (disabled by default)
   */
  useHttpsAgent?: boolean;
};
```

## 🔧 Parámetros Avanzados [​](#🔧-parametros-avanzados)

### `useHttpsAgent` [​](#usehttpsagent)

Este parámetro controla si se utiliza un agente HTTPS con configuración legacy para conectarse a los servidores de ARCA/AFIP.

Cambio Importante

**Desde la versión 0.3.5, el valor por defecto cambió de `true` a `false`.**

Este cambio mejora la compatibilidad con entornos edge como Cloudflare Workers y otros runtimes modernos que no requieren configuración SSL legacy.

#### Cuándo usar `useHttpsAgent: false` (por defecto) [​](#cuando-usar-usehttpsagent-false-por-defecto)

El valor por defecto `false` es adecuado para:

* **Cloudflare Workers** y otros entornos edge
* **Entornos Node.js modernos** que no requieren configuración SSL legacy
* **Mayoría de casos de uso** donde no se experimentan problemas de conexión SSL

#### Cuándo usar `useHttpsAgent: true` [​](#cuando-usar-usehttpsagent-true)

Debes habilitar este parámetro (`true`) solo si:

* ⚠️ Estás ejecutando en **Node.js** (no en edge runtimes)
* ⚠️ Experimentas errores de conexión SSL relacionados con parámetros Diffie-Hellman débiles
* ⚠️ Te conectas a **servidores ARCA/AFIP legacy** que requieren configuración SSL legacy

#### Errores TLS en Producción [​](#errores-tls-en-produccion)

Para errores como `EPROTO`, `dh key too small` o fallas de handshake TLS en producción, consulta la sección especial de errores frecuentes:

* [Errores de conexión SSL/TLS en Producción](/faq/errors.html#errores-de-conexion-ssl-tls-en-produccion-issue-112)

#### Ejemplo de uso [​](#ejemplo-de-uso)

ts

```
import { Arca } from "@arcasdk/core";

// Configuración por defecto (recomendada para la mayoría de casos)
const arca = new Arca({
  cuit: 20111111112,
  cert: "contenido_del_certificado",
  key: "contenido_de_la_clave_privada",
  // useHttpsAgent no se especifica, usa false por defecto
});

// Habilitar HTTPS Agent solo si es necesario (Node.js con servidores legacy)
const arcaLegacy = new Arca({
  cuit: 20111111112,
  cert: "contenido_del_certificado",
  key: "contenido_de_la_clave_privada",
  useHttpsAgent: true, // Solo si experimentas problemas SSL en Node.js
});
```

Nota Técnica

El agente HTTPS legacy se crea solo cuando:

1. `useHttpsAgent` está en `true`
2. El código se ejecuta en un entorno Node.js (detectado automáticamente)

En entornos edge como Cloudflare Workers, el agente se omite automáticamente incluso si está habilitado, ya que estos entornos no soportan el módulo `https` de Node.js.

----
url: https://www.afipts.com/credential_management.html
----

[Skip to content](#VPContent)

# Gestión de Credenciales [​](#gestion-de-credenciales)

***

## Introducción [​](#introduccion)

Cuando usas la SDK, necesitas **autenticarte con ARCA (WSAA)** para obtener un token de acceso. Este token es válido por 12 horas y tiene restricciones de solicitud (máximo 1 cada 2 minutos en producción).

La SDK ofrece dos formas de gestionar estos tokens:

1. **Automática (por defecto):** La SDK se encarga de todo
2. **Manual:** Tú controlas dónde y cuándo guardar/reutilizar tokens

***

## Opción 1: Automática (Recomendado) [​](#opcion-1-automatica-recomendado)

La SDK genera, almacena y reutiliza tokens automáticamente. No necesitas hacer nada especial.

ts

```
import { Arca } from "@arcasdk/core";

const arca = new Arca({
  cuit: 20111111112,
  cert: "contenido_del_certificado",
  key: "contenido_de_la_clave_privada",
  production: false,
  // Automáticamente:
  // 1. Obtiene token de WSAA
  // 2. Lo almacena en: lib/infrastructure/storage/auth/tickets
  // 3. Lo reutiliza durante 12 horas
});

// Usar normalmente - el token se maneja internamente
const result = await arca.registerScopeFourService.getTaxpayerDetails(20111111111);
```

**Para personalizar ubicación de almacenamiento:**

ts

```
const arca = new Arca({
  cuit: 20111111112,
  cert: "...",
  key: "...",
  ticketPath: "/mi/ruta/personalizada/tickets", // Cambiar dónde guardar tokens
});
```

***

## Opción 2: Manual (Para Serverless) [​](#opcion-2-manual-para-serverless)

Usar cuando necesites control total sobre dónde guardar tokens (base de datos, Redis, S3, etc.).

**¿Por qué?** En entornos serverless (AWS Lambda, Vercel, etc.), el sistema de archivos es efímero, por lo que guardar tokens localmente no funciona.

### Paso 1: Entender la estructura de credenciales [​](#paso-1-entender-la-estructura-de-credenciales)

Las credenciales son un objeto `ILoginCredentials` con esta estructura:

ts

```
interface ILoginCredentials {
  header: {
    // Información de autenticación
  };
  credentials: {
    // Token y firma
  };
}
```

Este objeto se obtiene desde un `AccessTicket` llamando al método `toLoginCredentials()`. Se define en la documentación de configuración como:

> Un objeto de tipo `ILoginCredentials` que contiene las credenciales de autenticación si ya se tienen guardadas. Este objeto debe tener la estructura `{ header: {...}, credentials: {...} }` obtenida de un `AccessTicket` mediante el método `toLoginCredentials()`.

### Paso 2: Generar credenciales con AuthRepository [​](#paso-2-generar-credenciales-con-authrepository)

En modo manual, el flujo correcto es:

1. Crear `AuthRepository`
2. Solicitar ticket con `requestLogin(serviceName)`
3. Convertir el ticket a `ILoginCredentials` con `toLoginCredentials()`
4. Guardar esas credenciales en tu storage

ts

```
import { AuthRepository, ServiceNamesEnum } from "@arcasdk/core";

const authRepository = new AuthRepository({
  cuit: 20111111112,
  cert: "contenido_del_certificado",
  key: "contenido_de_la_clave_privada",
  production: false,
  handleTicket: true,
});

const ticket = await authRepository.requestLogin(ServiceNamesEnum.WSFE);
const credentials = ticket.toLoginCredentials();
```

### Paso 3: Guardar las credenciales [​](#paso-3-guardar-las-credenciales)

Después de obtener `credentials`, debes:

1. Acceder a las credenciales internas (varía según tu implementación)
2. Guardarlas en tu BD/S3/Redis con su timestamp
3. Reutilizarlas en próximas llamadas dentro del período de validez (12 horas)

**Ejemplo con base de datos:**

ts

```
// Guardar después del primer uso
async function saveCredentials(cuit: number, credentials: ILoginCredentials) {
  const expiresAt = new Date(credentials.header[1].expirationtime);

  await database.credentialCache.upsert({
    cuit,
    credentials: JSON.stringify(credentials),
    expiresAt, // Usar expiración real enviada por WSAA
  });
}

// Recuperar para uso posterior
async function getCredentials(cuit: number) {
  const record = await database.credentialCache.findOne({ cuit });

  if (!record) return null;

  // Verificar que no haya expirado
  if (new Date() > new Date(record.expiresAt)) {
    await database.credentialCache.delete({ cuit });
    return null;
  }

  return JSON.parse(record.credentials);
}
```

### Paso 4: Reutilizar credenciales al crear Arca [​](#paso-4-reutilizar-credenciales-al-crear-arca)

En tu próxima función/request, pasa las credenciales guardadas:

ts

```
// Obtener credenciales guardadas
const savedCredentials = await getCredentials(20111111112);

const arca = new Arca({
  cuit: 20111111112,
  cert: "contenido_del_certificado",
  key: "contenido_de_la_clave_privada",
  production: false,
  handleTicket: true,
  credentials: savedCredentials, // Reutilizar token existente
});

// Usar servicio con token ya cargado en credentials
const result = await arca.electronicBillingService.createVoucher({
  CantReg: 1,
  PtoVta: 1,
  CbteTipo: 6,
  // ... resto de parámetros
});
```

### Paso 5: Detectar expiración y renovar [​](#paso-5-detectar-expiracion-y-renovar)

Si el token expiró (12 horas), debes generar uno nuevo con `AuthRepository` y volver a guardar:

ts

```
async function ensureValidCredentials(cuit: number) {
  let credentials = await getCredentials(cuit);

  // Si no hay o expiró, generar nuevo
  if (!credentials) {
    const authRepository = new AuthRepository({
      cuit,
      cert: "...",
      key: "...",
      production: false,
      handleTicket: true,
    });

    const ticket = await authRepository.requestLogin(ServiceNamesEnum.WSFE);
    credentials = ticket.toLoginCredentials();
    await saveCredentials(cuit, credentials);
  }

  return credentials;
}
```

***

## Parámetro `credentials` (Referencia) [​](#parametro-credentials-referencia)

La configuración completa según [config.md](./config.html):

ts

```
const arca = new Arca({
  cuit: 20111111112,
  cert: "...",
  key: "...",
  credentials: {
    // Tipo: ILoginCredentials
    header: {
      // Información de autenticación
    },
    credentials: {
      // Token y firma
    },
  },
  handleTicket: true, // Necesario cuando usas credentials
});
```

**Nota:** Este parámetro:

* Solo se usa en modo manual (`handleTicket: true`)
* Contiene un token ya generado previamente
* Es opcional - si no lo pasas, SDK genera uno nuevo en la primera llamada
* Es válido por 12 horas desde su generación
* Se obtiene con `AuthRepository.requestLogin(...).toLoginCredentials()`

***

## Flujo de Autenticación [​](#flujo-de-autenticacion)

***

## Comparativa Rápida [​](#comparativa-rapida)

| Aspecto                  | Automático       | Manual                            |
| ------------------------ | ---------------- | --------------------------------- |
| **Configuración**        | Simple           | Requiere setup                    |
| **Almacenamiento**       | Archivos locales | Tu elección (BD, S3, Redis, etc.) |
| **Renovación de tokens** | Automática       | Manual                            |
| **Uso en serverless**    | No               | Sí                                |
| **Flexibilidad**         | Baja             | Alta                              |

**Cuándo usar cada uno:**

| Escenario                                | Usar           |
| ---------------------------------------- | -------------- |
| Servidor tradicional, desarrollo local   | **Automático** |
| AWS Lambda, Vercel, Cloudflare Workers   | **Manual**     |
| Necesitas persistencia personalizada     | **Manual**     |
| Quieres la solución más simple           | **Automático** |
| Múltiples instancias compartiendo tokens | **Manual**     |

***

## Preguntas Frecuentes [​](#preguntas-frecuentes)

**¿Los tokens son seguros?** Sí, son tokens de corta vida (12 horas) y están firmados criptográficamente por ARCA. Están protegidos en tránsito y en almacenamiento.

**¿Puedo guardar tokens en base de datos?** Sí, usando modo manual (`handleTicket: true`) puedes guardar/recuperar de cualquier lugar (BD, Redis, S3, etc.). Solo asegúrate de:

* Guardarlos de forma segura (cifrados)
* Validar que no hayan expirado antes de usarlos
* Tener un mecanismo para generar nuevos si expiran

**¿Qué pasa si el token expira?**

* En modo automático, la SDK genera uno nuevo automáticamente
* En modo manual, tu código debe detectar la expiración (12 horas) y generar uno nuevo

**¿Hay un ejemplo completo?** Sí, en esta misma guía (sección "Opción 2: Manual") tienes el flujo completo para serverless.

**¿Cómo extraigo las credenciales después del primer uso?** Esto depende de tu implementación. Consulta cómo accedes a las credenciales internas en tu versión de la SDK. Generalmente se usa el método `toLoginCredentials()` en un `AccessTicket`.

----
url: https://www.afipts.com/behaviour.html
----

[Skip to content](#VPContent)

# Comportamientos [​](#comportamientos)

***

## Autenticación (WSAA) [​](#autenticacion-wsaa)

### El Desafío [​](#el-desafio)

Para interactuar con los servicios web de ARCA, es esencial autenticarse a través de su servicio [WSAA](https://www.arca.gob.ar/ws/WSAA/WSAAmanualDev.pdf), que proporciona tokens con validez de **12 horas**.

Pero hay restricciones importantes:

* **Producción:** 1 solicitud cada 2 minutos
* **Homologación (testing):** 1 solicitud cada 10 minutos

**Conclusión:** No puedes solicitar un token en cada request. Debes generar una vez y reutilizar durante 12 horas.

### El Problema con Almacenamiento Local [​](#el-problema-con-almacenamiento-local)

Muchas librerías resuelven esto guardando tokens en archivos locales del servidor (usando `fs` de Node). Esto funciona bien en servidores tradicionales, pero **falla en entornos serverless** (AWS Lambda, Vercel, Cloudflare Workers, etc.) donde el sistema de archivos es efímero.

### La Solución: Dos Formas de Gestionar Tokens [​](#la-solucion-dos-formas-de-gestionar-tokens)

Esta SDK ofrece **dos estrategias complementarias**:

#### 1. Automática (por defecto) [​](#_1-automatica-por-defecto)

La SDK genera, almacena y reutiliza tokens internamente. Los guarda en:

* Local: `lib/infrastructure/storage/auth/tickets` (predeterminado)
* O en una ubicación personalizada con `ticketPath`

**Ideal para:** Servidores tradicionales, desarrollo local.

#### 2. Manual (para serverless) [​](#_2-manual-para-serverless)

Tú controlas dónde guardar credenciales. Obtienes el token, lo extraes y lo almacenas en tu infraestructura:

* Base de datos
* Redis
* S3
* Cualquier storage persistente

Luego reutilizas ese token en próximos requests pasándolo a la SDK.

**Ideal para:** AWS Lambda, Vercel, entornos edge, compartir tokens entre instancias.

***

## Resumen Conceptual [​](#resumen-conceptual)

| Aspecto                | Automática                | Manual                     |
| ---------------------- | ------------------------- | -------------------------- |
| **Ubicación de token** | FS local (predeterminado) | Tu BD/Redis/S3             |
| **Generación**         | SDK automática            | SDK + Extraes credenciales |
| **Almacenamiento**     | SDK automático            | Tú guardas                 |
| **Reutilización**      | SDK busca en FS           | Tú pasas al crear Arca     |
| **Serverless**         | ✗ No funciona bien        | ✓ Funciona                 |
| **Complejidad**        | Baja                      | Media                      |

***

## Implementación [​](#implementacion)

Para ver ejemplos prácticos y paso a paso de cómo implementar ambas estrategias, consulta [Gestión de Credenciales](./credential_management.html).

----
url: https://www.afipts.com/introduction.html
----

[Skip to content](#VPContent)

# 🎉 Introducción [​](#🎉-introduccion)

Bienvenido a **Arca SDK**, la herramienta definitiva para integrar los servicios de ARCA (ex AFIP) en tus aplicaciones Node.js.

> Desarrollada para ser robusta, fácil de usar y moderna. Con tipado estático, gestión automática de credenciales y arquitectura modular.

***

## Características Principales [​](#caracteristicas-principales)

| Característica              | Descripción                                                                    |
| --------------------------- | ------------------------------------------------------------------------------ |
| **Tipado Estático**         | Desarrollado en TypeScript para garantizar seguridad de tipos y autocompletado |
| **Gestión de Credenciales** | Manejo automático de tickets de acceso (WSAA) y renovación de tokens           |
| **Modular**                 | Arquitectura basada en servicios independientes (Facturación, Padrón, etc.)    |
| **Isomórfico**              | Compatible con entornos Node.js y Edge runtimes                                |

***

## Servicios Disponibles [​](#servicios-disponibles)

La SDK ofrece soporte de primera clase para los servicios más críticos:

[🔐](https://www.arca.gob.ar/ws/WSAA/WSAAmanualDev.pdf)

[**Autenticación (WSAA)**&#x4D;anejo de tickets de acceso](https://www.arca.gob.ar/ws/WSAA/WSAAmanualDev.pdf)

[💸](https://www.arca.gob.ar/fe/ayuda//documentos/Manual-desarrollador-V.2.21.pdf)

[**Facturación Electrónica**Emisión de comprobantes (WSFE)](https://www.arca.gob.ar/fe/ayuda//documentos/Manual-desarrollador-V.2.21.pdf)

[4️⃣](https://www.arca.gob.ar/ws/ws_sr_padron_a4/manual_ws_sr_padron_a4_v1.2.pdf)

[**Padrón Alcance 4**Consulta de contribuyentes](https://www.arca.gob.ar/ws/ws_sr_padron_a4/manual_ws_sr_padron_a4_v1.2.pdf)

[5️⃣](https://www.arca.gob.ar/ws/ws_sr_padron_a5/manual_ws_sr_padron_a5_v1.0.pdf)

[**Padrón Alcance 5**Datos completos](https://www.arca.gob.ar/ws/ws_sr_padron_a5/manual_ws_sr_padron_a5_v1.0.pdf)

[🔟](https://www.arca.gob.ar/ws/ws_sr_padron_a10/manual_ws_sr_padron_a10_v1.1.pdf)

[**Padrón Alcance 10**Exentos y Monotributo](https://www.arca.gob.ar/ws/ws_sr_padron_a10/manual_ws_sr_padron_a10_v1.1.pdf)

[1️⃣3️⃣](https://www.arca.gob.ar/ws/ws-padron-a13/manual-ws-sr-padron-a13-v1.2.pdf)

[**Padrón Alcance 13**Actividades económicas](https://www.arca.gob.ar/ws/ws-padron-a13/manual-ws-sr-padron-a13-v1.2.pdf)

***

## Instalación [​](#instalacion)

npmyarnpnpm

sh

```
npm i @arcasdk/core --save
```

sh

```
yarn add @arcasdk/core
```

sh

```
pnpm add @arcasdk/core
```

***

## Requisitos Previos [​](#requisitos-previos)

Certificados Requeridos

Para utilizar esta SDK, debes tener los **certificados emitidos por ARCA** (homologación o producción). Son necesarios para la autenticación WSAA.

[Ver guía de certificados](/tutorial/enable_testing_certificates.html)

***

## Próximos Pasos [​](#proximos-pasos)

* [Uso Básico](/basic-use.html) — Aprende cómo instanciar y hacer tu primera operación
* [Configuración](/config.html) — Configura tu entorno
* [Gestión de Credenciales](/credential_management.html) — Maneja credenciales de forma segura
* [Documentación de Servicios](/services/facturacion_electronica.html) — Explora todos los servicios disponibles

***

Contribuciones

¿Necesitas otro servicio? ¡El proyecto es Open Source! Puedes hacer un [fork en GitHub](https://github.com/ralcorta/arcasdk) y enviar un PR.

----
url: https://www.afipts.com/
----

[Skip to content](#VPContent)

# Arca SDKTu conexión directa con ARCA

La biblioteca TypeScript más robusta y moderna para integrar los servicios de ARCA (ex AFIP) en tus aplicaciones Node.js.

[🚀 Comenzar Ahora](/introduction.html)

[📖 Ver Documentación](/basic-use.html)

[🐙 GitHub](https://github.com/ralcorta/arcasdk)

quick-start.ts

npmyarnpnpm

bash

```
npm i @arcasdk/core
```

bash

```
yarn add @arcasdk/core
```

bash

```
pnpm add @arcasdk/core
```

ts

```
import { Arca } from "@arcasdk/core";

const arca = new Arca({
  cuit: 20111111112,
  cert: process.env.AFIP_CERT,
  key: process.env.AFIP_KEY,
});

// ¡Listo para facturar!
const invoice = await arca.electronicBillingService.createVoucher({
  // ... tu magia aquí
});
```

🛡️

### Type-Safe por Diseño

Disfruta de una experiencia de desarrollo superior con tipos estáticos completos. Olvídate de los errores en tiempo de ejecución.

⚡

### Serverless Ready

Diseñada pensando en la nube. Funciona perfectamente en AWS Lambda, Vercel, Cloudflare Workers y contenedores.

🆓

### 100% Gratuito y Libre

Sin costos, sin suscripciones y sin intermediarios. Conéctate directamente a ARCA usando tus propias credenciales. Siempre gratis.

🌐

### Universal & Versátil

Funciona donde lo necesites: Backend, Frontend (Next.js, Remix) o Scripts. Pensada para integrarse en cualquier arquitectura moderna.

## 🌟 Servicios de Poder [​](#🌟-servicios-de-poder)

Explora la suite completa de herramientas diseñadas para potenciar tu negocio.

[💸](/services/facturacion_electronica)

### [Facturación Electrónica](/services/facturacion_electronica)

[Emisión y autorización de comprobantes (CAE) automatizada. Soporte para facturas A, B, C, notas de crédito y más.](/services/facturacion_electronica)

[🔍](/services/consulta_padron_alcance_4)

### [Consulta de Padrón](/services/consulta_padron_alcance_4)

[Accede a la base de datos de contribuyentes más actualizada. Valida CUITs y obtén datos fiscales en tiempo real.](/services/consulta_padron_alcance_4)

[📄](/services/consulta_padron_constancia_inscripcion)

### [Constancia de Inscripción](/services/consulta_padron_constancia_inscripcion)

[Obtén y verifica las constancias de inscripción de forma programática y segura.](/services/consulta_padron_constancia_inscripcion)

## 📚 Explora la Documentación Completa

Accede a guías detalladas, tutoriales paso a paso y referencias de API

[Ir a Documentación →](/introduction)

----
url: https://www.afipts.com/services/factura_credito_electronica.html
----

[Skip to content](#VPContent)

# Factura de Crédito Electrónica MiPyMEs [​](#factura-de-credito-electronica-mipymes)

El servicio `wsfecredService` permite gestionar Facturas de Crédito Electrónicas MiPyMEs (FCE) a través del Web Service de Factura de Crédito (WSFECred).

Documentación Oficial

[Manual del Desarrollador WSFECred - ARCA](https://www.afip.gob.ar/facturadecreditoelectronica/documentos/manual-desarrollador-V2.19.pdf)

***

## Aceptar Factura de Crédito [​](#aceptar-factura-de-credito)

Acepta una Factura de Crédito Electrónica recibida.

ts

```
const result = await arca.wsfecredService.aceptarFECred({
  idCtaCte: { CUITEmisor: 20111111112, codTipoCmp: 201, ptoVta: 1, nroCmp: 1 },
  arrayConfirmarNotasDC: { confirmarNotaDC: [] },
  arrayFormasCancelacion: {
    formaCancelacion: [{ codigo: 1, descripcion: "Acreditación en cuenta" }],
  },
  arrayRetenciones: { retencion: [] },
  arrayAjustesOperacion: { ajusteOperacion: [] },
  tipoCancelacion: "TOT",
  importeCancelado: 10000,
  importeTotalRetPesos: 0,
  importeEmbargoPesos: 0,
  saldoAceptado: 10000,
  codMoneda: "PES",
  cotizacionMonedaUlt: 1,
  informaCBU: "N",
  CBUComprador: "",
});
```

***

## Rechazar Factura de Crédito [​](#rechazar-factura-de-credito)

Rechaza una Factura de Crédito Electrónica recibida.

ts

```
const result = await arca.wsfecredService.rechazarFECred({
  idCtaCte: { CUITEmisor: 20111111112, codTipoCmp: 201, ptoVta: 1, nroCmp: 1 },
  arrayMotivosRechazo: {
    motivoRechazo: [{ codigo: 1, descripcion: "No corresponde" }],
  },
});
```

***

## Rechazar Nota de Débito/Crédito [​](#rechazar-nota-de-debito-credito)

Rechaza una Nota de Débito o Crédito asociada a una FCE.

ts

```
const result = await arca.wsfecredService.rechazarNotaDC({
  idComprobante: {
    CUITEmisor: 20111111112,
    codTipoCmp: 202,
    ptoVta: 1,
    nroCmp: 1,
  },
  arrayMotivosRechazo: {
    motivoRechazo: [{ codigo: 2, descripcion: "Importe incorrecto" }],
  },
});
```

***

## Informar Cancelación Total [​](#informar-cancelacion-total)

Informa la cancelación total de una cuenta corriente FCE.

ts

```
const result = await arca.wsfecredService.informarCancelacionTotalFECred({
  idCtaCte: { CUITEmisor: 20111111112, codTipoCmp: 201, ptoVta: 1, nroCmp: 1 },
  arrayFormasCancelacion: {
    formaCancelacion: [{ codigo: 1, descripcion: "Acreditación en cuenta" }],
  },
  importeCancelacion: 10000,
});
```

***

## Modificar Opción de Transferencia [​](#modificar-opcion-de-transferencia)

Modifica la opción de transferencia de una cuenta corriente (SCA o ADC).

ts

```
const result = await arca.wsfecredService.modificarOpcionTransferencia({
  idCtaCte: { CUITEmisor: 20111111112, codTipoCmp: 201, ptoVta: 1, nroCmp: 1 },
  opcionTransferencia: "SCA", // o "ADC"
});
```

***

## Consultar Comprobantes [​](#consultar-comprobantes)

Consulta comprobantes de FCE según filtros.

ts

```
const result = await arca.wsfecredService.consultarComprobantes({
  rolCUITRepresentada: "Emisor", // o "Receptor"
  CUITContraparte: 30716756411,
  codTipoCmp: 201,
  estadoCmp: "Aceptado",
  fecha: { desde: "2024-01-01", hasta: "2024-12-31" },
  codCtaCte: 0,
  estadoCtaCte: "Aceptada",
  nroPagina: 1,
});

console.log(result.consultarCmpReturn);
```

***

## Consultar Cuentas Corrientes [​](#consultar-cuentas-corrientes)

Consulta las cuentas corrientes de FCE.

ts

```
const result = await arca.wsfecredService.consultarCtasCtes({
  rolCUITRepresentada: "Receptor",
  CUITContraparte: 30716756411,
  fecha: { desde: "2024-01-01", hasta: "2024-12-31" },
  estadoCtaCte: "Aceptada",
  nroPagina: 1,
  opcionTransferencia: "SCA",
});

console.log(result.consultarCtasCtesReturn);
```

***

## Consultar Cuenta Corriente Individual [​](#consultar-cuenta-corriente-individual)

Consulta una cuenta corriente específica.

ts

```
const result = await arca.wsfecredService.consultarCtaCte({
  idCtaCte: { CUITEmisor: 20111111112, codTipoCmp: 201, ptoVta: 1, nroCmp: 1 },
});

console.log(result.consultarCtaCteReturn);
```

***

## Consultar Obligado a Recepción [​](#consultar-obligado-a-recepcion)

Verifica si un CUIT está obligado a recepcionar FCE.

ts

```
const result = await arca.wsfecredService.consultarObligadoRecepcion({
  cuitConsultada: 30716756411,
});

console.log(result.consultarObligadoRecepcionReturn);
```

***

## Consultar Monto Obligado Recepción [​](#consultar-monto-obligado-recepcion)

Consulta el monto a partir del cual un CUIT está obligado a recepcionar FCE.

ts

```
const result = await arca.wsfecredService.consultarMontoObligadoRecepcion({
  cuitConsultada: 30716756411,
});

console.log(result.consultarMontoObligadoRecepcionReturn);
```

***

## Historial de Estados [​](#historial-de-estados)

### Historial de un Comprobante [​](#historial-de-un-comprobante)

ts

```
const result = await arca.wsfecredService.consultarHistorialEstadosComprobante({
  idComprobante: {
    CUITEmisor: 20111111112,
    codTipoCmp: 201,
    ptoVta: 1,
    nroCmp: 1,
  },
});

console.log(result.consultarHistorialEstadosCmpReturn);
```

### Historial de una Cuenta Corriente [​](#historial-de-una-cuenta-corriente)

ts

```
const result = await arca.wsfecredService.consultarHistorialEstadosCtaCte({
  idCtaCte: { CUITEmisor: 20111111112, codTipoCmp: 201, ptoVta: 1, nroCmp: 1 },
});

console.log(result.consultarHistorialEstadosCtaCteReturn);
```

***

## Agente de Depósito Colectivo [​](#agente-de-deposito-colectivo)

### Informar Factura a Agente [​](#informar-factura-a-agente)

ts

```
const result = await arca.wsfecredService.informarFacturaAgtDptoCltv({
  idCtaCte: { CUITEmisor: 20111111112, codTipoCmp: 201, ptoVta: 1, nroCmp: 1 },
  ctaAgente: { cuit: 30000000001, nroCuenta: "1234567890" },
});
```

### Consultar Facturas en Agente [​](#consultar-facturas-en-agente)

ts

```
const result = await arca.wsfecredService.consultarFacturasAgtDptoCltv({
  idCtaCte: { CUITEmisor: 20111111112, codTipoCmp: 201, ptoVta: 1, nroCmp: 1 },
  filtroFecha: { desde: "2024-01-01", hasta: "2024-12-31" },
});
```

### Consultar Cuentas en Agente [​](#consultar-cuentas-en-agente)

ts

```
const result = await arca.wsfecredService.consultarCuentasEnAgtDptoCltv();
console.log(result.consultarCuentasEnAgtDptoCltvReturn);
```

***

## Obtener Remitos [​](#obtener-remitos)

Obtiene los remitos asociados a un comprobante FCE.

ts

```
const result = await arca.wsfecredService.obtenerRemitos({
  idComprobante: {
    CUITEmisor: 20111111112,
    codTipoCmp: 201,
    ptoVta: 1,
    nroCmp: 1,
  },
});

console.log(result.obtenerRemitosReturn);
```

***

## Tablas de Referencia [​](#tablas-de-referencia)

Métodos para obtener los códigos y tipos válidos.

Tipos de RetencionesMotivos de RechazoFormas de CancelaciónAjustes de Operación

ts

```
const result = await arca.wsfecredService.consultarTiposRetenciones();
console.log(result.consultarTiposRetencionesReturn);
```

ts

```
const result = await arca.wsfecredService.consultarTiposMotivosRechazo();
console.log(result.codigoDescripcionReturn);
```

ts

```
const result = await arca.wsfecredService.consultarTiposFormasCancelacion();
console.log(result.codigoDescripcionReturn);
```

ts

```
const result = await arca.wsfecredService.consultarTiposAjustesOperacion();
console.log(result.codigoDescripcionReturn);
```

***

## Estados de Comprobante [​](#estados-de-comprobante)

| Estado             | Descripción                       |
| ------------------ | --------------------------------- |
| PendienteRecepcion | Pendiente de recepción por MiPyME |
| Recepcionado       | Recepcionado por MiPyME           |
| Aceptado           | Aceptado                          |
| Rechazado          | Rechazado                         |
| InformadaAgDpto    | Informada a Agente de Depósito    |

## Estados de Cuenta Corriente [​](#estados-de-cuenta-corriente)

| Estado          | Descripción                              |
| --------------- | ---------------------------------------- |
| Modificable     | Aún puede recibir notas de DC            |
| Aceptada        | Aceptada por el receptor                 |
| Rechazada       | Rechazada por el receptor                |
| CanceladaTotal  | Cancelada totalmente                     |
| InformadaAgDpto | Informada a Agente de Depósito Colectivo |

## Tipos de Cancelación [​](#tipos-de-cancelacion)

| Código | Descripción         |
| ------ | ------------------- |
| PAR    | Cancelación parcial |
| TOT    | Cancelación total   |

## Opciones de Transferencia [​](#opciones-de-transferencia)

| Código | Descripción                      |
| ------ | -------------------------------- |
| SCA    | Sin Cláusula de No Transferencia |
| ADC    | A Disposición del Comprador      |

----
url: https://www.afipts.com/services/facturacion_electronica_exportacion.html
----

[Skip to content](#VPContent)

# Facturación Electrónica de Exportación [​](#facturacion-electronica-de-exportacion)

El servicio `wsfexService` permite la gestión de comprobantes electrónicos de exportación a través del Web Service de Facturación Electrónica de Exportación (WSFEX).

Documentación Oficial

[Manual del Desarrollador WSFEX - ARCA (PDF)](https://www.afip.gob.ar/fe/documentos/WSFEX-Manualparaeldesarrollador_V1.7.pdf)

***

## Autorizar Comprobante de Exportación [​](#autorizar-comprobante-de-exportacion)

El método `authorize` genera un comprobante de exportación y obtiene el CAE.

### Parámetros de `authorize` [​](#parametros-de-authorize)

| Parámetro               | Tipo   | Descripción                        |
| ----------------------- | ------ | ---------------------------------- |
| `Cmp.Id`                | number | ID único de la solicitud           |
| `Cmp.Fecha_cbte`        | string | Fecha del comprobante (`YYYYMMDD`) |
| `Cmp.Cbte_Tipo`         | number | Tipo de comprobante (ver tabla)    |
| `Cmp.Punto_vta`         | number | Punto de venta                     |
| `Cmp.Cbte_nro`          | number | Número de comprobante              |
| `Cmp.Tipo_expo`         | number | Tipo de exportación (ver tabla)    |
| `Cmp.Permiso_existente` | string | `"S"` o `"N"`                      |
| `Cmp.Permisos`          | object | Permisos de embarque               |
| `Cmp.Dst_cmp`           | number | País de destino (código)           |
| `Cmp.Cliente`           | string | Nombre del cliente                 |
| `Cmp.Cuit_pais_cliente` | number | CUIT del país del cliente          |
| `Cmp.Domicilio_cliente` | string | Domicilio del cliente              |
| `Cmp.Id_impositivo`     | string | ID impositivo del cliente          |
| `Cmp.Moneda_Id`         | string | Moneda (`DOL`, `PES`, etc.)        |
| `Cmp.Moneda_ctz`        | number | Cotización de la moneda            |
| `Cmp.Imp_total`         | number | Importe total                      |
| `Cmp.Obs`               | string | Observaciones                      |
| `Cmp.Forma_pago`        | string | Forma de pago                      |
| `Cmp.Incoterms`         | string | Código Incoterm                    |
| `Cmp.Incoterms_Ds`      | string | Descripción Incoterm               |
| `Cmp.Idioma_cbte`       | number | Idioma del comprobante (ver tabla) |
| `Cmp.Items`             | object | Detalle de ítems                   |
| `Cmp.Fecha_pago`        | string | Fecha de pago (`YYYYMMDD`)         |

### Ejemplo [​](#ejemplo)

ts

```
const result = await arca.wsfexService.authorize({
  Cmp: {
    Id: 1,
    Fecha_cbte: "20240601",
    Cbte_Tipo: 19, // Factura E
    Punto_vta: 1,
    Cbte_nro: 1,
    Tipo_expo: 1, // Exportación definitiva
    Permiso_existente: "N",
    Permisos: { Permiso: [] },
    Dst_cmp: 203, // Brasil
    Cliente: "Cliente Exportación SA",
    Cuit_pais_cliente: 50000000016,
    Domicilio_cliente: "Av. Paulista 1000, São Paulo",
    Id_impositivo: "123456789",
    Moneda_Id: "DOL",
    Moneda_ctz: 900.5,
    CanMisMonExt: "N",
    Obs_comerciales: "",
    Imp_total: 1000,
    Obs: "",
    Cmps_asoc: { Cmp_asoc: [] },
    Forma_pago: "Transferencia bancaria",
    Incoterms: "FOB",
    Incoterms_Ds: "Free on Board",
    Idioma_cbte: 1, // Español
    Items: {
      Item: [
        {
          Pro_codigo: "001",
          Pro_ds: "Servicio de consultoría",
          Pro_qty: 1,
          Pro_umed: 7, // Unidad
          Pro_precio_uni: 1000,
          Pro_total_item: 1000,
        },
      ],
    },
    Opcionales: { Opcional: [] },
    Fecha_pago: "20240615",
    Actividades: { Actividad: [] },
  },
});
```

***

## Consultar Comprobante [​](#consultar-comprobante)

Recupera los datos de un comprobante de exportación ya emitido.

ts

```
const result = await arca.wsfexService.getCmp({
  Cmp: {
    Cbte_tipo: 19,
    Punto_vta: 1,
    Cbte_nro: 1,
  },
});

console.log(result.FEXGetCMPResult);
```

***

## Último Comprobante Autorizado [​](#ultimo-comprobante-autorizado)

Obtiene el último comprobante autorizado para el CUIT autenticado.

ts

```
const result = await arca.wsfexService.getLastCmp({});
console.log(result.FEXGetLast_CMPResult);
```

***

## Último ID de Solicitud [​](#ultimo-id-de-solicitud)

Obtiene el último ID de solicitud utilizado.

ts

```
const result = await arca.wsfexService.getLastId({});
console.log(result.FEXGetLast_IDResult);
```

***

## Verificar Permiso de Embarque [​](#verificar-permiso-de-embarque)

Verifica si un permiso de embarque es válido para un destino.

ts

```
const result = await arca.wsfexService.checkPermiso({
  ID_Permiso: "01234567890123",
  Dst_merc: 203, // Brasil
});

console.log(result.FEXCheck_PermisoResult);
```

***

## Cotización de Moneda [​](#cotizacion-de-moneda)

Obtiene la cotización de una moneda para una fecha dada.

ts

```
const result = await arca.wsfexService.getParamCtz({
  Mon_id: "DOL",
  FchCotiz: "20240601",
});

console.log(result.FEXGetPARAM_CtzResult);
```

***

## Tablas de Referencia [​](#tablas-de-referencia)

Métodos para obtener los códigos y tipos válidos.

Tipos ComprobanteTipos ExportaciónIncotermsIdiomasUnidades de MedidaPaíses DestinoCUIT DestinoMonedasMonedas con CotizaciónPuntos de VentaOpcionalesActividades

ts

```
const result = await arca.wsfexService.getParamCbteTipo({});
// Factura E (19), NC E (20), ND E (21)
```

ts

```
const result = await arca.wsfexService.getParamTipoExpo({});
// 1: Definitiva, 2: Bienes bajo suspensión, etc.
```

ts

```
const result = await arca.wsfexService.getParamIncoterms({});
// FOB, CIF, EXW, etc.
```

ts

```
const result = await arca.wsfexService.getParamIdiomas({});
// 1: Español, 2: Inglés, 3: Portugués
```

ts

```
const result = await arca.wsfexService.getParamUMed({});
// 7: Unidad, 1: Kg, etc.
```

ts

```
const result = await arca.wsfexService.getParamDstPais({});
// 203: Brasil, 212: Chile, etc.
```

ts

```
const result = await arca.wsfexService.getParamDstCuit({});
```

ts

```
const result = await arca.wsfexService.getParamMon({});
// DOL, PES, EUR, etc.
```

ts

```
const result = await arca.wsfexService.getParamMonConCotizacion({
  Fecha_CTZ: "20240601",
});
```

ts

```
const result = await arca.wsfexService.getParamPtoVenta({});
```

ts

```
const result = await arca.wsfexService.getParamOpcionales({});
```

ts

```
const result = await arca.wsfexService.getParamActividades({});
```

***

## Tipos de Comprobante de Exportación [​](#tipos-de-comprobante-de-exportacion)

| Código | Descripción                      |
| ------ | -------------------------------- |
| 19     | Factura de Exportación E         |
| 20     | Nota de Débito de Exportación E  |
| 21     | Nota de Crédito de Exportación E |

## Tipos de Exportación [​](#tipos-de-exportacion)

| Código | Descripción                      |
| ------ | -------------------------------- |
| 1      | Exportación definitiva de bienes |
| 2      | Servicios                        |
| 4      | Otros                            |

***

## Estado del Servidor [​](#estado-del-servidor)

Verifica si los servicios de WSFEX están operativos.

ts

```
const status = await arca.wsfexService.dummy();
console.log(status.FEXDummyResult);
// { AppServer: "OK", DbServer: "OK", AuthServer: "OK" }
```