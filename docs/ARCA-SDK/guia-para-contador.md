# Guía breve para habilitar la facturación electrónica

Hola. Estamos preparando el sistema para emitir facturas electrónicas desde el local. Para conectarlo con ARCA necesitamos su ayuda con algunos pasos de configuración.

El sistema usará el **punto de venta 265** y trabajará en **producción**. La meta es dejar todo listo para que cada factura autorizada reciba su CAE.

## Resumen rápido

1. Confirmar los datos fiscales del negocio.
2. Habilitar el punto de venta 265 para facturación electrónica por Web Services.
3. Cargar una solicitud de certificado que enviaremos desde el equipo técnico.
4. Asociar ese certificado al servicio de facturación electrónica.
5. Enviarnos el certificado emitido por ARCA y las confirmaciones indicadas abajo.

## 1. Confirmar datos fiscales

Por favor, confirmar:

- CUIT y razón social del negocio.
- Condición frente al IVA. Esperamos que sea **Responsable Inscripto**, pero necesitamos su confirmación.
- Actividad y domicilio fiscal declarados.
- Alícuotas de IVA aplicables al comercio.
- Tipos de comprobante que corresponde habilitar: **Factura A** y **Factura B**.

## 2. Habilitar el punto de venta

Crear o verificar el **punto de venta 265** para el local.

Debe quedar habilitado para emitir comprobantes electrónicos mediante **Web Services**. Si el número 265 ya está siendo usado, por favor avisarnos antes de crear otro punto de venta.

Al finalizar, solo necesitamos una confirmación de que el punto de venta quedó activo y los tipos de comprobante que permite emitir.

## 3. Gestionar el certificado

El equipo técnico va a enviar un archivo de solicitud de certificado, con extensión **`.csr`**. No contiene contraseñas ni información sensible.

Con Clave Fiscal, el titular o una persona autorizada debe:

1. Ingresar a **Administración de Certificados Digitales**.
2. Crear un alias, por ejemplo: `pdv-265-webservices`.
3. Cargar el archivo `.csr` que recibirá del equipo técnico.
4. Descargar el certificado emitido por ARCA, normalmente un archivo **`.crt`**.

## 4. Asociar el certificado

En el Administrador de Relaciones de Clave Fiscal, asociar el certificado emitido al servicio de facturación electrónica por Web Services.

La asociación debe quedar activa para el CUIT del negocio y el punto de venta 265.

## Qué necesitamos que nos envíen

- El certificado emitido por ARCA (`.crt`).
- Confirmación de que el punto de venta 265 está habilitado para Web Services.
- Confirmación de los comprobantes habilitados.
- Confirmación de la condición frente al IVA y las alícuotas aplicables.

## Información de seguridad

No necesitamos, ni deben enviarnos:

- Clave Fiscal.
- Contraseñas.
- Claves privadas.

La clave privada se genera y se mantiene protegida por el equipo técnico. El certificado `.crt` sí debe ser entregado por un canal seguro acordado con nosotros.

## Importante sobre el uso inicial

Antes de comenzar a facturar normalmente, haremos una primera emisión controlada en producción para comprobar que ARCA autoriza el comprobante y asigna el CAE correctamente.

Las facturas emitidas en producción son comprobantes fiscales reales. Ante un error, se deberá aplicar el procedimiento fiscal que corresponda; no se elimina una factura ya autorizada.

## Estado actual

El sistema hoy está preparado para emitir **Factura B a Consumidor Final**. La emisión de **Factura A** se incorporará luego de completar el flujo necesario para registrar y validar los datos fiscales del cliente.

## Checklist final

- [ ] Datos fiscales confirmados.
- [ ] Punto de venta 265 habilitado para Web Services.
- [ ] Comprobantes habilitados confirmados.
- [ ] Certificado emitido y asociado al servicio.
- [ ] Certificado `.crt` enviado al equipo técnico.
- [ ] Primera factura controlada revisada.
