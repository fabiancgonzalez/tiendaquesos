# TIENDAQUESOS - CRUD Web + Firebase

Aplicación Node.js con frontend HTML para administrar datos con **CRUD completo en Firebase Firestore** y desplegar en **Vercel**.

Ahora incluye:

- autenticación real en backend con cookie HTTP-only
- carrito y pedido web desde la portada
- subida real de imágenes a `uploads/products`
- actualización automática de `stock_actual` en ventas y compras
- aviso de pedido por WhatsApp y correo para comprador y administrador

## Requisitos

- Node.js 18+
- Proyecto Firebase con Firestore habilitado
- Clave de cuenta de servicio de Firebase (JSON)

## Instalación

```bash
npm install
```

Copia `.env.example` a `.env` y completa la clave:

```bash
copy .env.example .env
```

## Ejecutar en local

```bash
npm run dev
```

API local en `http://localhost:3000`.

Frontend web en `http://localhost:3000`.

## Firebase en .env

Puedes configurar Firebase de dos maneras:

1. `FIREBASE_SERVICE_ACCOUNT_KEY` con el JSON serializado en una sola linea.
2. Variables separadas: `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` y relacionadas.

La segunda opcion suele ser mas estable cuando trabajas con `.env` locales o Vercel.

## Endpoints

- `GET /health`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/store/products`
- `POST /api/store/orders`
- `GET /api/notifications/whatsapp/status`
- `POST /api/uploads/product-image`
- `GET /api/collections`
  - Lista colecciones de Firestore.
- `GET /api/collections/:collection/items`
  - Lista registros de la colección.
- `POST /api/collections/:collection/items`
  - Crea registro (body JSON).
- `PUT /api/collections/:collection/items/:id`
  - Actualiza registro.
- `DELETE /api/collections/:collection/items/:id`
  - Elimina registro.

## Uso sin Excel (flujo principal)

1. Arranca la app con `npm run dev`.
2. Abre `http://localhost:3000`.
3. Cada modulo tiene su pagina HTML independiente:
  - `http://localhost:3000/articulos.html`
  - `http://localhost:3000/clientes.html`
  - `http://localhost:3000/proveedores.html`
  - `http://localhost:3000/categorias.html`
  - `http://localhost:3000/ventas.html`
  - `http://localhost:3000/registros.html`
  - `http://localhost:3000/reportes.html`
4. El modulo `Ventas` incluye cabecera de factura y detalle de lineas.
5. `Registros` permite explorar colecciones en forma global.
6. `Reportes` muestra conteo por coleccion y totales de ventas.
7. La portada funciona como tienda web con carrito y generación de pedidos.
8. Al registrar ventas o compras, el backend ajusta stock automáticamente.
9. En artículos puedes cargar una URL de imagen o subir un archivo.
10. El carrito aparece como ícono en el menú y abre un panel para corregir productos o confirmar el pedido.

## Autenticación

- El login ahora se valida en backend.
- La sesión se guarda en una cookie HTTP-only.
- Usuario admin por defecto: `admin@tiendaquesos.local` / `admin123`
- Si existen usuarios antiguos con contraseña en texto plano, se migran a hash al iniciar sesión por primera vez.

## Imágenes

- Las imágenes locales subidas desde artículos se guardan en `uploads/products`.
- En Vercel ese almacenamiento es efímero; para producción conviene migrarlo a Firebase Storage o similar.

## Notificaciones de pedido

- Al finalizar pedido, el backend intenta enviar WhatsApp con `src/whatsappweb` para comprador y admin.
- Si `whatsappweb` no está listo (QR/sesión), devuelve enlace `wa.me` como respaldo para envío manual.
- Si SMTP está configurado (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`), envía correos automáticamente a comprador y administrador.
- Si SMTP no está configurado, se abren borradores `mailto:` para envío manual.
- Variables recomendadas: `ADMIN_EMAIL`, `ADMIN_WHATSAPP`, `WHATSAPPWEB_ENABLED`, `WHATSAPPWEB_CLIENT_ID`.

## Importación desde Excel (opcional)

Si necesitas importar datos iniciales desde Excel:

- `GET /excel/sheets`
- `POST /excel/import`

Body ejemplo:

```json
{
  "filePath": "./Fabian Gonzalez FACTURASV3.xlsx",
  "sheets": ["articulos", "Datos", "Clientes"],
  "replaceExisting": true
}
```

Si no envías `sheets`, importa todas las hojas con datos.

## Importar por CLI

```bash
npm run import
```

Opcional con otra ruta:

```bash
node src/import.js "C:/ruta/archivo.xlsx"
```

## Seed de base de datos desde Excel

Para llenar Firestore con las hojas de `FACTURASV3.xlsx`:

```bash
npm run seed
```

Opciones útiles:

```bash
# Validar hojas y filas sin escribir en Firestore
node src/seed.js --dry-run

# Seed desde otro archivo
node src/seed.js "C:/ruta/otro.xlsx"

# Seed solo de hojas específicas
node src/seed.js --sheets=articulos,clientes,proveedores

# Agregar registros sin borrar colecciones existentes
node src/seed.js --append
```

## Despliegue en Vercel

1. Sube este proyecto a GitHub.
2. Importa el repo en Vercel.
3. En **Environment Variables** agrega:
  - `FIREBASE_SERVICE_ACCOUNT_KEY` o las variables separadas de Firebase
  - `EXCEL_FILE_PATH` (solo si usarás importación desde Excel)
4. Deploy.

## Nota de colecciones

Cada hoja del Excel se guarda en una colección Firestore:

- Nombre de colección = nombre de hoja normalizado (minúsculas y `_`)
- Cada fila = un documento
