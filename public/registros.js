const collectionSelect = document.getElementById("collectionSelect");
const refreshCollectionsBtn = document.getElementById("refreshCollectionsBtn");
const loadBtn = document.getElementById("loadBtn");
const collectionInput = document.getElementById("collectionInput");
const statusEl = document.getElementById("status");
const searchInput = document.getElementById("searchInput");
const dataTableHead = document.querySelector("#dataTable thead");
const dataTableBody = document.querySelector("#dataTable tbody");

let currentCollection = "";
let currentItems = [];

function setStatus(message) {
  statusEl.textContent = message;
}

function stringifyCellValue(value) {
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return JSON.stringify(value, null, 2);
  }

  return String(value ?? "");
}

async function fetchCollections() {
  try {
    const response = await fetch("/api/collections");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar colecciones");
    }

    collectionSelect.innerHTML = `<option value="">Seleccionar coleccion...</option>${(data.collections || [])
      .map((name) => `<option value="${name}">${name}</option>`)
      .join("")}`;
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  }
}

function renderTable(items) {
  if (!items.length) {
    dataTableHead.innerHTML = "";
    dataTableBody.innerHTML = '<tr><td>No hay datos para mostrar.</td></tr>';
    return;
  }

  const columns = Array.from(
    items.reduce((set, item) => {
      Object.keys(item).forEach((key) => set.add(key));
      return set;
    }, new Set())
  ).filter((column) => column !== "id");

  dataTableHead.innerHTML = `<tr>${columns.map((column) => `<th>${column}</th>`).join("")}<th>acciones</th></tr>`;

  dataTableBody.innerHTML = items
    .map((item) => {
      const cells = columns
        .map((column) => {
          const css = Array.isArray(item[column]) || typeof item[column] === "object" ? "mono" : "";
          return `<td class="${css}">${stringifyCellValue(item[column])}</td>`;
        })
        .join("");

      return `
        <tr>
          ${cells}
          <td>
            <button type="button" class="danger" onclick="deleteItem('${item.id}')">Eliminar</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function applySearch() {
  const query = searchInput.value.trim().toLowerCase();

  if (!query) {
    renderTable(currentItems);
    return;
  }

  const filtered = currentItems.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
  renderTable(filtered);
  setStatus(`Coleccion: ${currentCollection} | Registros filtrados: ${filtered.length} de ${currentItems.length}`);
}

async function loadItems() {
  const selected = (collectionInput.value || collectionSelect.value || "").trim();

  if (!selected) {
    setStatus("Selecciona una coleccion para cargar registros.");
    return;
  }

  currentCollection = selected;
  collectionInput.value = selected;

  try {
    setStatus("Cargando...");
    const response = await fetch(`/api/collections/${encodeURIComponent(currentCollection)}/items?limit=1000`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Error cargando registros");
    }

    currentItems = data.items || [];
    renderTable(currentItems);
    setStatus(`Coleccion: ${currentCollection} | Registros: ${currentItems.length}`);
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  }
}

window.deleteItem = async function deleteItem(id) {
  if (!currentCollection) {
    return;
  }

  const confirmed = window.confirm("¿Eliminar este registro?");

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`/api/collections/${encodeURIComponent(currentCollection)}/items/${id}`, {
      method: "DELETE",
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Error eliminando");
    }

    await loadItems();
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  }
};

refreshCollectionsBtn.addEventListener("click", fetchCollections);
loadBtn.addEventListener("click", loadItems);
searchInput.addEventListener("input", applySearch);
collectionSelect.addEventListener("change", () => {
  collectionInput.value = collectionSelect.value;
});

fetchCollections();
