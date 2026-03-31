// PDF pedidos por fecha
const pdfDateInput = document.getElementById("pdfDateInput");
const buscarPDFBtn = document.getElementById("buscarPDFBtn");
const pdfList = document.getElementById("pdfList");

async function buscarPDFsPorFecha() {
  if (!pdfDateInput || !pdfList) return;
  const fecha = pdfDateInput.value;
  pdfList.innerHTML = "<li>Cargando...</li>";
  if (!fecha) {
    pdfList.innerHTML = "<li>Selecciona una fecha</li>";
    return;
  }
  try {
    const res = await fetch(`/api/pedidosPDF?fecha=${fecha}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error consultando PDFs");
    if (!data.pdfs || !data.pdfs.length) {
      pdfList.innerHTML = `<li>No hay PDFs para la fecha ${fecha}</li>`;
      return;
    }
    pdfList.innerHTML = data.pdfs.map(pdf => `<li><a href="${pdf.url}" target="_blank">${pdf.name}</a></li>`).join("");
  } catch (e) {
    pdfList.innerHTML = `<li>Error: ${e.message}</li>`;
  }
}

if (buscarPDFBtn) buscarPDFBtn.addEventListener("click", buscarPDFsPorFecha);
const statusEl = document.getElementById("status");
const summaryBody = document.getElementById("summaryBody");
const totalsContainer = document.getElementById("totalsContainer");
const collectionsChart = document.getElementById("collectionsChart");
const salesChart = document.getElementById("salesChart");
const cheeseSummaryBody = document.getElementById("cheeseSummaryBody");
const sellerSummaryBody = document.getElementById("sellerSummaryBody");
const fromDateInput = document.getElementById("fromDate");
const toDateInput = document.getElementById("toDate");
const sellerFilter = document.getElementById("sellerFilter");
const reportSearch = document.getElementById("reportSearch");
const refreshReportBtn = document.getElementById("refreshReportBtn");

const state = {
  sales: [],
  products: [],
};

function setStatus(message) {
  statusEl.textContent = message;
}

async function getItems(collection) {
  const response = await fetch(`/api/collections/${encodeURIComponent(collection)}/items?limit=1000`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `No se pudo leer ${collection}`);
  }

  return data.items || [];
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function excelSerialToDate(value) {
  if (typeof value !== "number") {
    return null;
  }

  const utcDays = Math.floor(value - 25569);
  const utcValue = utcDays * 86400;
  return new Date(utcValue * 1000);
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    return excelSerialToDate(value);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateInputValue(date) {
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameDay(dateA, dateB) {
  if (!dateA || !dateB) {
    return false;
  }

  return (
    dateA.getFullYear() === dateB.getFullYear()
    && dateA.getMonth() === dateB.getMonth()
    && dateA.getDate() === dateB.getDate()
  );
}

function formatMoney(value) {
  return value.toFixed(2);
}

function renderPieChart(container, rows, formatter) {
  if (!container) {
    return;
  }

  if (!rows.length) {
    container.innerHTML = '<p class="small">Sin datos para graficar.</p>';
    return;
  }

  const palette = [
    "#22c55e",
    "#38bdf8",
    "#f59e0b",
    "#f43f5e",
    "#a78bfa",
    "#14b8a6",
    "#fb7185",
    "#84cc16",
    "#f97316",
    "#06b6d4",
  ];
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);

  if (!total) {
    container.innerHTML = '<p class="small">Sin datos para graficar.</p>';
    return;
  }

  let accumulated = 0;
  const slices = rows.map((row, index) => {
    const value = Number(row.value || 0);
    const percentage = total ? (value / total) * 100 : 0;
    const start = accumulated;
    accumulated += percentage;
    const color = palette[index % palette.length];

    return {
      ...row,
      color,
      percentage,
      start,
      end: accumulated,
    };
  });

  const gradient = slices
    .map((slice) => `${slice.color} ${slice.start.toFixed(2)}% ${slice.end.toFixed(2)}%`)
    .join(", ");

  container.innerHTML = `
    <div class="pie-chart-wrap">
      <div class="pie-chart" style="background: conic-gradient(${gradient});"></div>
      <div class="pie-legend">
        ${slices
          .map(
            (slice) => `
              <div class="pie-legend-item">
                <span class="pie-color" style="background:${slice.color};"></span>
                <span class="pie-label">${slice.label}</span>
                <span class="pie-value">${formatter(slice.value)} (${slice.percentage.toFixed(1)}%)</span>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function extractLinesFromLegacySale(item) {
  const lines = [];

  for (let index = 1; index <= 20; index += 1) {
    const quantity = toNumber(item[`cantidad_linea${index}`]);
    const concept = item[`concepto_linea${index}`];
    const price = toNumber(item[`precio_linea${index}`]);
    const tax = toNumber(item[`linea_impuesto${index}`]);

    if (!quantity && !concept && !price) {
      continue;
    }

    lines.push({
      cantidad: quantity,
      concepto: concept || `Linea ${index}`,
      precio: price,
      impuesto: tax,
      total_linea: Number((quantity * price).toFixed(2)),
    });
  }

  return lines;
}

function getSaleLines(item) {
  if (Array.isArray(item.lineas) && item.lineas.length > 0) {
    return item.lineas.map((line) => ({
      cantidad: toNumber(line.cantidad),
      concepto: line.concepto || "Sin concepto",
      precio: toNumber(line.precio),
      impuesto: toNumber(line.impuesto),
      total_linea: toNumber(line.total_linea || toNumber(line.cantidad) * toNumber(line.precio)),
    }));
  }

  return extractLinesFromLegacySale(item);
}

function getFilteredSales() {
  const fromDate = fromDateInput.value ? new Date(fromDateInput.value) : null;
  const toDate = toDateInput.value ? new Date(toDateInput.value) : null;
  const seller = sellerFilter.value.trim().toLowerCase();
  const search = reportSearch.value.trim().toLowerCase();

  if (toDate) {
    toDate.setHours(23, 59, 59, 999);
  }

  return state.sales.filter((item) => {
    const saleDate = normalizeDate(item.fecha);
    const sellerValue = String(item.vendedor || "Sin vendedor").toLowerCase();
    const haystack = JSON.stringify(item).toLowerCase();

    if (fromDate && saleDate && saleDate < fromDate) {
      return false;
    }

    if (toDate && saleDate && saleDate > toDate) {
      return false;
    }

    if (seller && sellerValue !== seller) {
      return false;
    }

    if (search && !haystack.includes(search)) {
      return false;
    }

    return true;
  });
}

function renderTodaySellerSummary() {
  const today = new Date();
  const sellerMap = new Map();

  state.sales.forEach((sale) => {
    const saleDate = normalizeDate(sale.fecha);

    if (!isSameDay(saleDate, today)) {
      return;
    }

    const seller = sale.vendedor || "Sin vendedor";
    const current = sellerMap.get(seller) || { seller, amount: 0, kilos: 0 };
    current.amount += toNumber(sale.total || sale.subtotal || 0);
    current.kilos += getSaleLines(sale).reduce((sum, line) => sum + toNumber(line.cantidad), 0);
    sellerMap.set(seller, current);
  });

  const rows = Array.from(sellerMap.values()).sort((a, b) => b.amount - a.amount);

  summaryBody.innerHTML = rows.length
    ? rows
        .map(
          (row) => `<tr><td>${row.seller}</td><td>${formatMoney(row.amount)}</td><td>${row.kilos.toFixed(2)}</td></tr>`
        )
        .join("")
    : '<tr><td colspan="3">Sin ventas registradas para hoy.</td></tr>';
}

function renderTotals(filteredSales) {
  const totalKg = filteredSales.reduce((acc, item) => acc + getSaleLines(item).reduce((sum, line) => sum + toNumber(line.cantidad), 0), 0);
  const totalVentas = filteredSales.reduce((acc, item) => acc + toNumber(item.total || item.subtotal || 0), 0);
  const totalClientes = new Set(filteredSales.map((item) => item.cliente).filter(Boolean)).size;
  const totalVendedores = new Set(filteredSales.map((item) => item.vendedor || "Sin vendedor")).size;

  totalsContainer.innerHTML = `
    <div class="summary-grid">
      <div class="card" style="margin:0">
        <h3>Ventas totales</h3>
        <p class="small">$ <strong>${formatMoney(totalVentas)}</strong></p>
      </div>
      <div class="card" style="margin:0">
        <h3>Kilos vendidos</h3>
        <p class="small"><strong>${totalKg.toFixed(2)}</strong> KG</p>
      </div>
      <div class="card" style="margin:0">
        <h3>Cobertura</h3>
        <p class="small"><strong>${totalClientes}</strong> clientes | <strong>${totalVendedores}</strong> vendedores</p>
      </div>
    </div>
  `;
}

function renderCheeseSummary(filteredSales) {
  const stockByProduct = new Map(
    state.products.map((product) => [String(product.nombre || "").toLowerCase(), product])
  );
  const totals = new Map();

  filteredSales.forEach((sale) => {
    getSaleLines(sale).forEach((line) => {
      const name = String(line.concepto || "Sin queso");
      const key = name.toLowerCase();
      const current = totals.get(key) || { name, kilos: 0, amount: 0, stock: "-" };
      current.kilos += toNumber(line.cantidad);
      current.amount += toNumber(line.total_linea || toNumber(line.cantidad) * toNumber(line.precio));
      const product = stockByProduct.get(key);
      current.stock = product ? product.stock_actual ?? "-" : current.stock;
      totals.set(key, current);
    });
  });

  const rows = Array.from(totals.values()).sort((a, b) => b.amount - a.amount);

  cheeseSummaryBody.innerHTML = rows.length
    ? rows
        .map((row) => {
          const badgeClass = toNumber(row.stock) <= 10 ? "badge" : "small";
          return `<tr><td>${row.name}</td><td>${row.kilos.toFixed(2)}</td><td>${formatMoney(row.amount)}</td><td><span class="${badgeClass}">${row.stock}</span></td></tr>`;
        })
        .join("")
    : '<tr><td colspan="4">Sin datos para el filtro seleccionado.</td></tr>';

  renderPieChart(
    collectionsChart,
    rows.slice(0, 10).map((row) => ({ label: row.name, value: row.amount })),
    (value) => value.toFixed(2)
  );

  renderPieChart(
    salesChart,
    rows.slice(0, 10).map((row) => ({ label: row.name, value: row.kilos })),
    (value) => value.toFixed(2)
  );
}

function renderSellerSummary(filteredSales) {
  const sellerMap = new Map();

  filteredSales.forEach((sale) => {
    const sellerName = sale.vendedor || "Sin vendedor";
    const current = sellerMap.get(sellerName) || {
      seller: sellerName,
      kilos: 0,
      amount: 0,
      cheeses: new Set(),
      clients: new Map(),
    };

    current.amount += toNumber(sale.total || sale.subtotal || 0);
    current.clients.set(
      sale.cliente || "Sin cliente",
      toNumber(current.clients.get(sale.cliente || "Sin cliente")) + toNumber(sale.total || sale.subtotal || 0)
    );

    getSaleLines(sale).forEach((line) => {
      current.kilos += toNumber(line.cantidad);
      if (line.concepto) {
        current.cheeses.add(line.concepto);
      }
    });

    sellerMap.set(sellerName, current);
  });

  const rows = Array.from(sellerMap.values()).sort((a, b) => b.amount - a.amount);

  sellerSummaryBody.innerHTML = rows.length
    ? rows
        .map((row) => {
          const clients = Array.from(row.clients.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([client, amount]) => `${client}: $${formatMoney(amount)}`)
            .join("<br />");
          return `
            <tr>
              <td>${row.seller}</td>
              <td>${row.kilos.toFixed(2)}</td>
              <td>${formatMoney(row.amount)}</td>
              <td>${Array.from(row.cheeses).join(", ") || "-"}</td>
              <td>${clients || "-"}</td>
            </tr>
          `;
        })
        .join("")
    : '<tr><td colspan="5">Sin datos para el filtro seleccionado.</td></tr>';
}

function populateSellerFilter() {
  const sellers = Array.from(new Set(state.sales.map((item) => item.vendedor || "Sin vendedor"))).sort();
  const current = sellerFilter.value;
  sellerFilter.innerHTML = `<option value="">Todos</option>${sellers
    .map((seller) => `<option value="${seller}">${seller}</option>`)
    .join("")}`;
  sellerFilter.value = sellers.includes(current) ? current : "";
}

async function bootstrapData() {
  state.sales = await getItems("datos");
  state.products = await getItems("articulos");

  const salesDates = state.sales.map((item) => normalizeDate(item.fecha)).filter(Boolean).sort((a, b) => a - b);
  if (salesDates.length) {
    fromDateInput.value = fromDateInput.value || toDateInputValue(salesDates[0]);
    toDateInput.value = toDateInput.value || toDateInputValue(salesDates[salesDates.length - 1]);
  }

  populateSellerFilter();
}

async function loadReport() {
  try {
    setStatus("Calculando reportes...");
    await bootstrapData();
    const filteredSales = getFilteredSales();

    renderTodaySellerSummary();
    renderTotals(filteredSales);
    renderCheeseSummary(filteredSales);
    renderSellerSummary(filteredSales);

    setStatus(`Reporte generado con ${filteredSales.length} ventas filtradas`);
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  }
}

refreshReportBtn.addEventListener("click", loadReport);
fromDateInput.addEventListener("change", loadReport);
toDateInput.addEventListener("change", loadReport);
sellerFilter.addEventListener("change", loadReport);
reportSearch.addEventListener("input", loadReport);

loadReport();
