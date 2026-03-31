const moduleForm = document.getElementById("moduleForm");
const fieldsContainer = document.getElementById("fieldsContainer");
const moduleExtrasContainer = document.getElementById("moduleExtrasContainer");
const dataTableHead = document.querySelector("#dataTable thead");
const dataTableBody = document.querySelector("#dataTable tbody");
const statusEl = document.getElementById("status");
const formTitle = document.getElementById("formTitle");
const moduleDescription = document.getElementById("moduleDescription");
const saveBtn = document.getElementById("saveBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const searchInput = document.getElementById("searchInput");
const filterFieldSelect = document.getElementById("filterFieldSelect");
const filterValueInput = document.getElementById("filterValueInput");
const clearFiltersBtn = document.getElementById("clearFiltersBtn");
const filterDateFromInput = document.getElementById("filterDateFrom");
const filterDateToInput = document.getElementById("filterDateTo");
const fetchItemsBtn = document.getElementById("fetchItemsBtn");
const newBtn = document.getElementById("newBtn");
const formCard = document.getElementById("formCard");
const closeFormBtn = document.getElementById("closeFormBtn");
const PENDING_OPEN_ITEM_KEY = "tiendaquesos_open_item";

const MODULES = {
  articulos: {
    title: "Articulos",
    collection: "articulos",
    description: "Gestiona productos, stock, precio e impuesto.",
    tableColumns: ["imagen", "nombre", "tipo_queso", "precio", "stock_inicial", "stock_actual", "unidad"],
    fields: [
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "tipo_queso", label: "Tipo de queso", type: "text" },
      { name: "precio", label: "Precio", type: "number", step: "0.01", required: true },
      { name: "impuesto", label: "Impuesto", type: "number", step: "0.01" },
      { name: "stock_inicial", label: "Stock inicial", type: "number" },
      { name: "stock_actual", label: "Stock actual", type: "number" },
      { name: "unidad", label: "Unidad", type: "select", options: ["kg", "unidad"] },
      { name: "imagen", label: "Imagen", type: "text" },
    ],
  },
  clientes: {
    title: "Clientes",
    collection: "clientes",
    description: "Administra nombre, documento y datos de contacto.",
    fields: [
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "dni", label: "DNI", type: "text" },
      { name: "direccion", label: "Direccion", type: "text" },
      { name: "telefono", label: "Telefono", type: "text" },
      { name: "localidad", label: "Localidad", type: "text" },
      { name: "email", label: "Email", type: "email" },
    ],
  },
  proveedores: {
    title: "Proveedores",
    collection: "proveedores",
    description: "Registra proveedores y su ubicacion.",
    fields: [
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "codigo_interno", label: "Codigo interno", type: "text" },
      { name: "direccion", label: "Direccion", type: "text" },
      { name: "cp", label: "Codigo postal", type: "text" },
      { name: "localidad", label: "Localidad", type: "text" },
    ],
  },
  categorias: {
    title: "Categorias",
    collection: "categorias",
    description: "Clasifica productos o gastos por tipo y categoria.",
    fields: [
      { name: "tipo_gasto", label: "Tipo", type: "text", required: true },
      { name: "categoria", label: "Categoria", type: "text", required: true },
      { name: "descripcion", label: "Descripcion", type: "textarea" },
    ],
  },
  ventas: {
    title: "Ventas",
    collection: "datos",
    description: "Carga ventas/facturas con cabecera y detalle de lineas.",
    tableColumns: ["fecha", "vendedor", "cliente", "n_factura", "forma_de_pago", "subtotal", "retencion", "total", "kilos_totales", "lineas_count"],
    fields: [
      { name: "vendedor", label: "Vendedor", type: "autocomplete", autocompleteSource: "usuarios", autocompleteField: "nombre", required: true },
      { name: "cliente", label: "Cliente", type: "autocomplete", autocompleteSource: "clientes", autocompleteField: "nombre", required: true },
      { name: "n_factura", label: "Numero factura", type: "text", required: true },
      { name: "fecha", label: "Fecha", type: "date" },
      { name: "subtotal", label: "Subtotal", type: "number", step: "0.01" },
      { name: "retencion", label: "Retencion", type: "number", step: "0.01" },
      { name: "total", label: "Total", type: "number", step: "0.01", required: true },
      { name: "forma_de_pago", label: "Forma de pago", type: "select", options: ["Efectivo", "Transferencia", "Tarjeta", "Cuenta corriente", "Cheque"] },
      { name: "observaciones", label: "Observaciones", type: "textarea", full: true },
    ],
    lineFields: [
      { name: "cantidad", label: "Cantidad", type: "number", step: "0.01" },
      { name: "concepto", label: "Articulo", type: "autocomplete", autocompleteSource: "articulos", autocompleteField: "nombre", autofill: [{ fromField: "precio", toField: "precio" }, { fromField: "impuesto", toField: "impuesto" }] },
      { name: "precio", label: "Precio", type: "number", step: "0.01" },
      { name: "impuesto", label: "Impuesto", type: "number", step: "0.01" },
    ],
  },
  compras: {
    title: "Compras",
    collection: "compras",
    description: "Registra compras a proveedores y detalle de insumos o mercaderia.",
    tableColumns: ["fecha", "proveedor", "n_factura", "tipo_gasto", "categoria", "subtotal", "total", "lineas_count"],
    fields: [
      { name: "proveedor", label: "Proveedor", type: "autocomplete", autocompleteSource: "proveedores", autocompleteField: "nombre", required: true },
      { name: "n_factura", label: "Numero factura", type: "text" },
      { name: "fecha", label: "Fecha", type: "date" },
      { name: "tipo_gasto", label: "Tipo de gasto", type: "text" },
      { name: "categoria", label: "Categoria", type: "text" },
      { name: "subtotal", label: "Subtotal", type: "number", step: "0.01" },
      { name: "total", label: "Total", type: "number", step: "0.01", required: true },
      { name: "estado_pago", label: "Estado de pago", type: "select", options: ["Pendiente", "Pagado", "Parcial"] },
      { name: "observaciones", label: "Observaciones", type: "textarea", full: true },
    ],
    lineFields: [
      { name: "cantidad", label: "Cantidad", type: "number", step: "0.01" },
      { name: "concepto", label: "Concepto", type: "text" },
      { name: "precio", label: "Precio", type: "number", step: "0.01" },
      { name: "impuesto", label: "Impuesto", type: "number", step: "0.01" },
    ],
  },
  finanzas: {
    title: "Finanzas",
    collection: "finanzas",
    description: "Administra cobros a clientes y pagos a proveedores.",
    tableColumns: ["fecha", "origen", "documento", "tipo_movimiento", "tercero", "concepto", "monto", "medio_pago", "estado"],
    fields: [
      { name: "fecha", label: "Fecha", type: "date", required: true },
      { name: "tipo_movimiento", label: "Movimiento", type: "select", options: ["Cobro cliente", "Pago proveedor"], required: true },
      { name: "tercero", label: "Cliente / Proveedor", type: "text", required: true },
      { name: "concepto", label: "Concepto", type: "text", required: true },
      { name: "monto", label: "Monto", type: "number", step: "0.01", required: true },
      { name: "medio_pago", label: "Medio de pago", type: "select", options: ["Efectivo", "Transferencia", "Tarjeta", "Cheque"] },
      { name: "estado", label: "Estado", type: "select", options: ["Pendiente", "Pagado", "Cobrado"] },
      { name: "referencia", label: "Referencia", type: "text" },
      { name: "observaciones", label: "Observaciones", type: "textarea", full: true },
    ],
  },
  admin: {
    title: "Admin / Usuarios",
    collection: "usuarios",
    description: "Gestiona usuarios del sistema, incluyendo administradores y vendedores.",
    tableColumns: ["nombre", "email", "rol", "activo", "telefono"],
    fields: [
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "password", label: "Contraseña", type: "text", required: true },
      { name: "rol", label: "Rol", type: "select", options: ["admin", "vendedor", "caja"], required: true },
      { name: "activo", label: "Activo", type: "select", options: ["si", "no"], required: true },
      { name: "telefono", label: "Telefono", type: "text" },
      { name: "observaciones", label: "Observaciones", type: "textarea", full: true },
    ],
  },
};

const moduleKey = document.body.dataset.module;
const moduleConfig = MODULES[moduleKey];

let editingId = null;
let currentItems = [];
let currentVisibleItems = [];

function showFormCard() {
  if (formCard) {
    formCard.classList.remove("hidden");
  }
}

function hideFormCard() {
  if (formCard) {
    formCard.classList.add("hidden");
  }
}

function setStatus(message) {
  statusEl.textContent = message;
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);

  if (response.status === 401) {
    TiendaAuth.clearSession();
    window.location.href = "./login.html";
    return response;
  }

  return response;
}

// --- Autocomplete helpers ---
const autocompleteCache = {};

async function loadAutocompleteSource(collection) {
  if (autocompleteCache[collection]) return autocompleteCache[collection];
  try {
    const res = await apiFetch(`/api/collections/${encodeURIComponent(collection)}/items?limit=500`);
    const data = await res.json();
    autocompleteCache[collection] = data.items || [];
  } catch (_) {
    autocompleteCache[collection] = [];
  }
  return autocompleteCache[collection];
}

function ensureDatalist(listId, items, displayField) {
  let dl = document.getElementById(listId);
  if (!dl) {
    dl = document.createElement("datalist");
    dl.id = listId;
    document.body.appendChild(dl);
  }
  dl.innerHTML = items
    .map((item) => {
      const val = String(item[displayField] || item.nombre || "").replace(/"/g, "&quot;");
      return `<option value="${val}"></option>`;
    })
    .join("");
  return dl;
}

async function uploadProductImage(file) {
  const formData = new FormData();
  formData.append("image", file);

  const response = await apiFetch("/api/uploads/product-image", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "No se pudo subir la imagen");
  }

  return data.url;
}

function createImageUploadControls(targetInput, initialValue) {
  const wrapper = document.createElement("div");
  wrapper.className = "field full";

  const helper = document.createElement("div");
  helper.className = "upload-row";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";

  const uploadButton = document.createElement("button");
  uploadButton.type = "button";
  uploadButton.className = "secondary";
  uploadButton.textContent = "Subir imagen";

  const preview = document.createElement("img");
  preview.className = "preview-thumb";
  preview.alt = "Vista previa";
  preview.src = initialValue || "https://placehold.co/320x220/0f172a/e5e7eb?text=Producto";

  const hint = document.createElement("p");
  hint.className = "small";
  hint.textContent = "Puedes pegar una URL o subir un archivo local.";

  targetInput.addEventListener("input", () => {
    preview.src = targetInput.value.trim() || "https://placehold.co/320x220/0f172a/e5e7eb?text=Producto";
  });

  uploadButton.addEventListener("click", async () => {
    const file = fileInput.files?.[0];

    if (!file) {
      setStatus("Selecciona una imagen antes de subirla.");
      return;
    }

    try {
      setStatus("Subiendo imagen...");
      uploadButton.disabled = true;
      const imageUrl = await uploadProductImage(file);
      targetInput.value = imageUrl;
      preview.src = imageUrl;
      setStatus("Imagen subida correctamente.");
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      uploadButton.disabled = false;
    }
  });

  helper.appendChild(fileInput);
  helper.appendChild(uploadButton);
  wrapper.appendChild(helper);
  wrapper.appendChild(hint);
  wrapper.appendChild(preview);
  return wrapper;
}

function createInput(field, value = "") {
  if (field.type === "select") {
    const select = document.createElement("select");
    select.name = field.name;
    select.required = Boolean(field.required);

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = `Seleccionar ${field.label}`;
    select.appendChild(placeholderOption);

    (field.options || []).forEach((option) => {
      const optionElement = document.createElement("option");
      optionElement.value = option;
      optionElement.textContent = option;
      select.appendChild(optionElement);
    });

    select.value = value || field.defaultValue || "";
    return select;
  }

  if (field.type === "textarea") {
    const textarea = document.createElement("textarea");
    textarea.name = field.name;
    textarea.value = value;
    textarea.required = Boolean(field.required);
    return textarea;
  }

  if (field.type === "autocomplete") {
    const input = document.createElement("input");
    input.type = "text";
    input.name = field.name;
    input.value = value;
    input.required = Boolean(field.required);
    input.autocomplete = "off";
    const listId = `autocomplete_list_${field.autocompleteSource}`;
    input.setAttribute("list", listId);
    if (!document.getElementById(listId)) {
      const dl = document.createElement("datalist");
      dl.id = listId;
      document.body.appendChild(dl);
    }
    loadAutocompleteSource(field.autocompleteSource).then((items) => {
      ensureDatalist(listId, items, field.autocompleteField || "nombre");
    });
    return input;
  }

  const input = document.createElement("input");
  input.type = field.type || "text";
  input.name = field.name;
  input.value = value;
  input.required = Boolean(field.required);

  if (field.step) {
    input.step = field.step;
  }

  return input;
}

function parseValue(field, rawValue) {
  if (rawValue === "") {
    return "";
  }

  if (field.type === "number") {
    return Number(rawValue);
  }

  return rawValue;
}

function stringifyCellValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (typeof value.nombre === "string" && value.nombre.trim()) {
      return value.nombre;
    }
  }

  if (Array.isArray(value) || (value && typeof value === "object")) {
    return JSON.stringify(value, null, 2);
  }

  return String(value ?? "");
}

function defineHiddenMeta(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

function normalizeDateValue(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function renderCellContent(column, value) {
  if (column === "imagen" && value) {
    return `<img class="table-thumb" src="${String(value)}" alt="Producto" />`;
  }

  const css = Array.isArray(value) || typeof value === "object" ? "mono" : "";
  return `<span class="${css}">${stringifyCellValue(value)}</span>`;
}

function buildFinanceMovements(financeItems, salesItems, purchaseItems) {
  const manualRows = (financeItems || []).map((item) => {
    const row = {
      ...item,
      fecha: item.fecha || "",
      origen: "Finanzas",
      documento: item.referencia || item.n_factura || "-",
      tipo_movimiento: item.tipo_movimiento || "Movimiento manual",
      tercero: item.tercero || "-",
      concepto: item.concepto || item.referencia || "Movimiento manual",
      monto: Number(item.monto || 0),
      medio_pago: item.medio_pago || "-",
      estado: item.estado || "-",
    };

    defineHiddenMeta(row, "_sourceCollection", "finanzas");
    defineHiddenMeta(row, "_sourceId", item.id);
    return row;
  });

  const salesRows = (salesItems || []).map((item) => {
    const row = {
      id: `venta:${item.id}`,
      fecha: item.fecha || item.created_at || "",
      origen: "Ventas",
      documento: item.n_factura || item.id || "-",
      tipo_movimiento: "Cobro cliente",
      tercero: typeof item.cliente === "object" ? item.cliente?.nombre || item.cliente_detalle?.nombre || "Sin cliente" : item.cliente || item.cliente_detalle?.nombre || "Sin cliente",
      concepto: item.n_factura || item.observaciones || "Venta",
      monto: Number(item.total || item.subtotal || 0),
      medio_pago: item.forma_de_pago || "-",
      estado: item.forma_de_pago === "Pendiente" ? "Pendiente" : "Cobrado",
    };

    defineHiddenMeta(row, "_sourceCollection", "datos");
    defineHiddenMeta(row, "_sourceId", item.id);
    return row;
  });

  const purchaseRows = (purchaseItems || []).map((item) => {
    const row = {
      id: `compra:${item.id}`,
      fecha: item.fecha || item.created_at || "",
      origen: "Compras",
      documento: item.n_factura || item.id || "-",
      tipo_movimiento: "Pago proveedor",
      tercero: item.proveedor || "Sin proveedor",
      concepto: item.n_factura || item.categoria || item.tipo_gasto || "Compra",
      monto: Number(item.total || item.subtotal || 0),
      medio_pago: item.forma_de_pago || "-",
      estado: item.estado_pago || "Pendiente",
    };

    defineHiddenMeta(row, "_sourceCollection", "compras");
    defineHiddenMeta(row, "_sourceId", item.id);
    return row;
  });

  return [...manualRows, ...salesRows, ...purchaseRows].sort((a, b) => {
    const first = normalizeDateValue(a.fecha)?.getTime() || 0;
    const second = normalizeDateValue(b.fecha)?.getTime() || 0;
    return second - first;
  });
}

function getDisplayColumns(items) {
  if (moduleConfig.tableColumns) {
    return moduleConfig.tableColumns.filter((column) => column !== "id");
  }

  const declaredColumns = moduleConfig.fields.map((field) => field.name);
  const extraColumns = new Set();

  items.forEach((item) => {
    Object.keys(item).forEach((key) => {
      if (key !== "id" && !key.startsWith("_") && !declaredColumns.includes(key)) {
        extraColumns.add(key);
      }
    });
  });

  return [...declaredColumns, ...Array.from(extraColumns)];
}

function updateFilterFieldOptions(columns) {
  const current = filterFieldSelect.value;
  filterFieldSelect.innerHTML = `<option value="">Filtrar por campo...</option>${columns
    .map((column) => `<option value="${column}">${column}</option>`)
    .join("")}`;
  filterFieldSelect.value = columns.includes(current) ? current : "";
}

function getLineItemsContainer() {
  return moduleExtrasContainer.querySelector("#lineItemsContainer");
}

function createLineItemRow(line = {}) {
  const row = document.createElement("div");
  row.className = "line-item";

  moduleConfig.lineFields.forEach((field) => {
    const input = createInput(field, line[field.name] ?? "");
    input.dataset.lineField = field.name;
    input.placeholder = field.label;
    if (field.type === "autocomplete" && field.autofill) {
      input.addEventListener("change", () => {
        const selectedVal = input.value.trim();
        const items = autocompleteCache[field.autocompleteSource] || [];
        const df = field.autocompleteField || "nombre";
        const matched = items.find((it) => (it[df] || "").toLowerCase() === selectedVal.toLowerCase());
        if (matched) {
          field.autofill.forEach((af) => {
            const target = row.querySelector(`[data-line-field="${af.toField}"]`);
            if (target && matched[af.fromField] != null) {
              target.value = matched[af.fromField];
            }
          });
        }
      });
    }
    row.appendChild(input);
  });

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "danger";
  removeButton.textContent = "Quitar";
  removeButton.addEventListener("click", () => row.remove());
  row.appendChild(removeButton);

  return row;
}

function renderSalesLineEditor(lines = []) {
  const title = document.createElement("h4");
  title.className = "section-title";
  title.textContent = "Detalle de lineas";

  const container = document.createElement("div");
  container.id = "lineItemsContainer";
  container.className = "line-items";

  const initialLines = Array.isArray(lines) && lines.length > 0 ? lines : [{}];
  initialLines.forEach((line) => container.appendChild(createLineItemRow(line)));

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "ghost";
  addButton.textContent = "+ Agregar linea";
  addButton.addEventListener("click", () => container.appendChild(createLineItemRow()));

  moduleExtrasContainer.appendChild(title);
  moduleExtrasContainer.appendChild(container);
  moduleExtrasContainer.appendChild(addButton);
}

function collectSalesLines() {
  const container = getLineItemsContainer();

  if (!container || !moduleConfig.lineFields) {
    return [];
  }

  return Array.from(container.querySelectorAll(".line-item"))
    .map((row) => {
      const line = {};

      moduleConfig.lineFields.forEach((field) => {
        const element = row.querySelector(`[data-line-field="${field.name}"]`);
        const rawValue = element ? element.value.trim() : "";

        if (rawValue === "") {
          return;
        }

        line[field.name] = parseValue(field, rawValue);
      });

      if (typeof line.cantidad === "number" && typeof line.precio === "number") {
        line.total_linea = Number((line.cantidad * line.precio).toFixed(2));
      }

      return line;
    })
    .filter((line) => Object.keys(line).length > 0);
}

function renderForm(item = null) {
  formTitle.textContent = item ? `Editar ${moduleConfig.title}` : `Nuevo ${moduleConfig.title}`;
  moduleDescription.textContent = moduleConfig.description;
  fieldsContainer.innerHTML = "";
  moduleExtrasContainer.innerHTML = "";

  moduleConfig.fields.forEach((field) => {
    const wrapper = document.createElement("div");
    wrapper.className = `field${field.full ? " full" : ""}`;

    const label = document.createElement("label");
    label.setAttribute("for", `field_${field.name}`);
    label.textContent = field.label;

    const input = createInput(field, item ? String(item[field.name] ?? "") : "");
    input.id = `field_${field.name}`;

    if (moduleKey === "admin" && field.name === "password" && item) {
      input.required = false;
      input.placeholder = "Dejar vacío para conservar la contraseña actual";
    }

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    fieldsContainer.appendChild(wrapper);

    if (moduleKey === "articulos" && field.name === "imagen") {
      fieldsContainer.appendChild(createImageUploadControls(input, item ? String(item[field.name] ?? "") : ""));
    }
  });

  if (moduleConfig.lineFields) {
    renderSalesLineEditor(item ? item.lineas || [] : []);
  }

  editingId = item ? item.id : null;
  cancelEditBtn.style.display = item ? "inline-block" : "none";
}

function getFormPayload() {
  const payload = {};

  moduleConfig.fields.forEach((field) => {
    const element = moduleForm.elements.namedItem(field.name);
    const rawValue = element ? element.value.trim() : "";
    payload[field.name] = parseValue(field, rawValue);
  });

  if (moduleConfig.lineFields) {
    const lineas = collectSalesLines();
    const subtotalCalculado = lineas.reduce((total, line) => total + Number(line.total_linea || 0), 0);
    const kilosTotales = lineas.reduce((total, line) => total + Number(line.cantidad || 0), 0);

    payload.lineas = lineas;
    payload.lineas_count = lineas.length;
    payload.subtotal_calculado = Number(subtotalCalculado.toFixed(2));
    payload.kilos_totales = Number(kilosTotales.toFixed(2));

    if (payload.subtotal === "") {
      payload.subtotal = payload.subtotal_calculado;
    }
  }

  return payload;
}

function resetForm() {
  renderForm();
}

function getPendingOpenItem() {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_OPEN_ITEM_KEY) || "null");
  } catch (_error) {
    return null;
  }
}

function clearPendingOpenItem() {
  sessionStorage.removeItem(PENDING_OPEN_ITEM_KEY);
}

function openPendingItemIfNeeded() {
  const pending = getPendingOpenItem();

  if (!pending || pending.module !== moduleKey) {
    return;
  }

  clearPendingOpenItem();

  const item = currentItems.find((entry) => entry.id === pending.id);

  if (!item) {
    setStatus(`No se encontró el registro solicitado en ${moduleConfig.title}.`);
    return;
  }

  renderForm(item);
  showFormCard();
  formCard?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderTable(items) {
  const columns = getDisplayColumns(currentItems);
  updateFilterFieldOptions(columns);

  if (!items.length) {
    dataTableHead.innerHTML = `<tr>${columns.map((column) => `<th>${column}</th>`).join("")}<th>acciones</th></tr>`;
    dataTableBody.innerHTML = `<tr><td colspan="${columns.length + 1}">No hay registros en esta coleccion.</td></tr>`;
    return;
  }

  dataTableHead.innerHTML = `<tr>${columns.map((column) => `<th>${column}</th>`).join("")}<th>acciones</th></tr>`;

  dataTableBody.innerHTML = items
    .map((item) => {
      const canModify = moduleKey !== "finanzas" || item._sourceCollection === "finanzas";
      const canOpenSource = moduleKey === "finanzas" && ["datos", "compras"].includes(item._sourceCollection);
      const cells = columns
        .map((column) => {
          return `<td>${renderCellContent(column, item[column])}</td>`;
        })
        .join("");

      return `
        <tr>
          ${cells}
          <td>
            ${canModify
              ? `<div class="actions">
                  <button type="button" class="secondary" onclick="editItem('${item.id}')">Editar</button>
                  <button type="button" class="danger" onclick="removeItem('${item.id}')">Eliminar</button>
                </div>`
              : canOpenSource
                ? `<div class="actions">
                    <button type="button" class="secondary" onclick="openSourceItem('${item.id}')">Abrir origen</button>
                  </div>`
                : '<span class="small">Solo lectura</span>'}
          </td>
        </tr>
      `;
    })
    .join("");
}

function applyFilters() {
  const textQuery = searchInput.value.trim().toLowerCase();
  const fieldName = filterFieldSelect.value;
  const fieldValue = filterValueInput.value.trim().toLowerCase();
  const fromDate = filterDateFromInput?.value ? new Date(filterDateFromInput.value) : null;
  const toDate = filterDateToInput?.value ? new Date(filterDateToInput.value) : null;

  if (toDate) {
    toDate.setHours(23, 59, 59, 999);
  }

  currentVisibleItems = currentItems.filter((item) => {
    const matchesText = !textQuery || JSON.stringify(item).toLowerCase().includes(textQuery);
    const matchesField =
      !fieldName || !fieldValue || stringifyCellValue(item[fieldName]).toLowerCase().includes(fieldValue);
    const itemDate = moduleKey === "finanzas" ? normalizeDateValue(item.fecha) : null;
    const matchesDateFrom = !fromDate || (itemDate && itemDate >= fromDate);
    const matchesDateTo = !toDate || (itemDate && itemDate <= toDate);

    return matchesText && matchesField && matchesDateFrom && matchesDateTo;
  });

  renderTable(currentVisibleItems);
  setStatus(`Coleccion: ${moduleConfig.collection} | Registros: ${currentVisibleItems.length} de ${currentItems.length}`);
}

async function loadItems() {
  try {
    setStatus("Cargando registros...");
    if (moduleKey === "finanzas") {
      const limit = 5000;
      const [financeResponse, salesResponse, purchasesResponse] = await Promise.all([
        apiFetch(`/api/collections/${encodeURIComponent(moduleConfig.collection)}/items?limit=${limit}`),
        apiFetch(`/api/collections/datos/items?limit=${limit}`),
        apiFetch(`/api/collections/compras/items?limit=${limit}`),
      ]);

      const [financeData, salesData, purchasesData] = await Promise.all([
        financeResponse.json(),
        salesResponse.json(),
        purchasesResponse.json(),
      ]);

      if (!financeResponse.ok) {
        throw new Error(financeData.error || "Error cargando finanzas");
      }

      if (!salesResponse.ok) {
        throw new Error(salesData.error || "Error cargando ventas");
      }

      if (!purchasesResponse.ok) {
        throw new Error(purchasesData.error || "Error cargando compras");
      }

      currentItems = buildFinanceMovements(financeData.items || [], salesData.items || [], purchasesData.items || []);
    } else {
      const response = await apiFetch(`/api/collections/${encodeURIComponent(moduleConfig.collection)}/items?limit=500`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error de carga");
      }

      currentItems = data.items || [];
    }

    applyFilters();
    openPendingItemIfNeeded();
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  }
}

async function saveItem() {
  const payload = getFormPayload();
  const isEditing = Boolean(editingId);
  const endpoint = isEditing
    ? `/api/collections/${encodeURIComponent(moduleConfig.collection)}/items/${editingId}`
    : `/api/collections/${encodeURIComponent(moduleConfig.collection)}/items`;
  const method = isEditing ? "PUT" : "POST";

  try {
    const response = await apiFetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Error guardando registro");
    }

    resetForm();
    hideFormCard();
    await loadItems();
    setStatus(isEditing ? "Registro actualizado" : "Registro creado");
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  }
}

window.editItem = function editItem(id) {
  const item = currentItems.find((entry) => entry.id === id);

  if (!item) {
    return;
  }

  renderForm(item);
  showFormCard();
  formCard?.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.removeItem = async function removeItem(id) {
  const confirmed = window.confirm("¿Eliminar este registro?");

  if (!confirmed) {
    return;
  }

  try {
    const response = await apiFetch(`/api/collections/${encodeURIComponent(moduleConfig.collection)}/items/${id}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Error eliminando registro");
    }

    await loadItems();
    setStatus("Registro eliminado");
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  }
};

window.openSourceItem = function openSourceItem(id) {
  const item = currentItems.find((entry) => entry.id === id);

  if (!item) {
    return;
  }

  const targetModule = item._sourceCollection === "datos"
    ? "ventas"
    : item._sourceCollection === "compras"
      ? "compras"
      : null;

  if (!targetModule || !item._sourceId) {
    return;
  }

  sessionStorage.setItem(PENDING_OPEN_ITEM_KEY, JSON.stringify({
    module: targetModule,
    id: item._sourceId,
  }));

  window.location.href = `./${targetModule}.html`;
};

saveBtn.addEventListener("click", saveItem);
cancelEditBtn.addEventListener("click", () => {
  resetForm();
  hideFormCard();
});
newBtn?.addEventListener("click", () => {
  resetForm();
  showFormCard();
});
closeFormBtn?.addEventListener("click", () => {
  resetForm();
  hideFormCard();
});
searchInput.addEventListener("input", applyFilters);
filterFieldSelect.addEventListener("change", applyFilters);
filterValueInput.addEventListener("input", applyFilters);
filterDateFromInput?.addEventListener("change", applyFilters);
filterDateToInput?.addEventListener("change", applyFilters);
fetchItemsBtn?.addEventListener("click", loadItems);
clearFiltersBtn.addEventListener("click", () => {
  searchInput.value = "";
  filterFieldSelect.value = "";
  filterValueInput.value = "";
  if (filterDateFromInput) {
    filterDateFromInput.value = "";
  }
  if (filterDateToInput) {
    filterDateToInput.value = "";
  }
  applyFilters();
});

if (!moduleConfig) {
  setStatus("Modulo no configurado.");
} else {
  renderForm();
  hideFormCard();
  loadItems();
}
