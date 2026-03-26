// Incluye la librería xlsx desde CDN para exportar a Excel
if (!window.XLSX) {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  document.head.appendChild(script);
}

function exportTableToExcel(table, filename = 'reporte.xlsx') {
  if (!window.XLSX) {
    alert('La librería XLSX no está cargada.');
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.table_to_sheet(table);
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  XLSX.writeFile(wb, filename);
}

// Reportes
window.addEventListener('DOMContentLoaded', () => {
  // Ventas del día por vendedor
  const btnSummary = document.getElementById('downloadExcelSummary');
  const tableSummary = document.querySelector('tbody#summaryBody')?.closest('table');
  if (btnSummary && tableSummary) {
    btnSummary.addEventListener('click', () => exportTableToExcel(tableSummary, 'ventas_dia_vendedor.xlsx'));
  }

  // Ventas por vendedor
  const btnSeller = document.getElementById('downloadExcelSeller');
  const tableSeller = document.querySelector('tbody#sellerSummaryBody')?.closest('table');
  if (btnSeller && tableSeller) {
    btnSeller.addEventListener('click', () => exportTableToExcel(tableSeller, 'ventas_por_vendedor.xlsx'));
  }

  // Ventas por tipo de queso
  const btnCheese = document.getElementById('downloadExcelCheese');
  const tableCheese = document.querySelector('tbody#cheeseSummaryBody')?.closest('table');
  if (btnCheese && tableCheese) {
    btnCheese.addEventListener('click', () => exportTableToExcel(tableCheese, 'ventas_por_queso.xlsx'));
  }

  // Finanzas
  const btnFinanzas = document.getElementById('downloadExcelFinanzas');
  const tableFinanzas = document.querySelector('#dataTable');
  if (btnFinanzas && tableFinanzas) {
    btnFinanzas.addEventListener('click', () => exportTableToExcel(tableFinanzas, 'finanzas.xlsx'));
  }
});