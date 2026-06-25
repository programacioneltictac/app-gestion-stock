import ExcelJS from 'exceljs';

// Mismos colores/etiquetas de estado que la grilla del control.
const STOCK_STATUS_NAMES = {
  1: 'Generar Pedido',
  2: 'Stock Óptimo',
  3: 'Sobrestock',
};

// Etiqueta legible de "ya pedido" según el destino de la orden (espeja
// ORDER_DEST_LABELS de StockControlShow, pero en texto plano para el Excel).
const ORDER_DEST_TEXT = {
  hub: 'Pedido a Hub',
  external: 'Pedido a proveedor',
  both: 'Pedido (Hub+proveedor)',
};

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1976D2' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };

function styleHeader(sheet, columnCount) {
  const headerRow = sheet.getRow(1);
  headerRow.font = HEADER_FONT;
  headerRow.fill = HEADER_FILL;
  headerRow.alignment = { vertical: 'middle' };
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columnCount },
  };
}

// Etiqueta de la columna "¿Pedido?": "—" si no se pidió; si se pidió, el destino.
function orderedLabel(item) {
  if (!item.orderedAt) return '—';
  return ORDER_DEST_TEXT[item.orderDest] || 'Pedido';
}

// Construye la hoja "Control" con los mismos campos visibles en la grilla.
// `isHub` agrega la columna "Comprom." (solo el control del Nodo Hub).
function buildControlSheet(workbook, items, isHub) {
  const sheet = workbook.addWorksheet('Control');

  const columns = [
    { header: 'Producto', key: 'displayName', width: 40 },
    { header: 'Rubro', key: 'categoryName', width: 16 },
    { header: 'Condición', key: 'conditionName', width: 16 },
    { header: 'Req.', key: 'stockRequire', width: 10 },
    { header: 'Actual', key: 'stockCurrent', width: 10 },
    ...(isHub ? [{ header: 'Comprom.', key: 'committed', width: 12 }] : []),
    { header: 'Dif.', key: 'stockDifference', width: 10 },
    { header: 'Compliance', key: 'compliance', width: 12 },
    { header: 'Estado', key: 'stockStatusName', width: 18 },
    { header: '¿Pedido?', key: 'ordered', width: 20 },
  ];
  sheet.columns = columns;

  items.forEach((it) => {
    // En el Hub, "Dif." descuenta lo comprometido (igual que la grilla).
    const diff = isHub
      ? (Number(it.stockDifference) || 0) - (Number(it.committed) || 0)
      : Number(it.stockDifference) || 0;
    sheet.addRow({
      displayName: it.displayName,
      categoryName: it.categoryName,
      conditionName: it.conditionName || '—',
      stockRequire: it.stockRequire,
      stockCurrent: it.stockCurrent,
      ...(isHub ? { committed: it.committed > 0 ? -it.committed : 0 } : {}),
      stockDifference: diff,
      compliance: (Number(it.compliance) || 0) / 100,
      stockStatusName: it.stockStatusName || STOCK_STATUS_NAMES[it.stockStatusId] || '',
      ordered: orderedLabel(it),
    });
  });

  sheet.getColumn('compliance').numFmt = '0.0%';
  styleHeader(sheet, columns.length);
  return sheet;
}

// Construye la hoja "Discontinuos" (solo lectura): producto, stock, costo y
// total valorizado (= stock * costo), igual que la tab del componente.
function buildDiscontinuedSheet(workbook, discontinued) {
  const sheet = workbook.addWorksheet('Discontinuos');

  const columns = [
    { header: 'Producto', key: 'displayName', width: 44 },
    { header: 'Rubro', key: 'categoryName', width: 16 },
    { header: 'Stock', key: 'stock', width: 10 },
    { header: 'Costo unit.', key: 'avgCost', width: 14 },
    { header: 'Total valorizado', key: 'totalValue', width: 18 },
  ];
  sheet.columns = columns;

  discontinued.forEach((d) => {
    const stock = Number(d.stock) || 0;
    const cost = Number(d.avgCost) || 0;
    sheet.addRow({
      displayName: d.displayName,
      categoryName: d.categoryName,
      stock,
      avgCost: cost,
      totalValue: stock * cost,
    });
  });

  const moneyFmt = '"$"#,##0';
  sheet.getColumn('avgCost').numFmt = moneyFmt;
  sheet.getColumn('totalValue').numFmt = moneyFmt;

  // Fila de total valorizado al pie.
  const totalRow = sheet.addRow({
    displayName: 'TOTAL',
    totalValue: discontinued.reduce(
      (s, d) => s + (Number(d.stock) || 0) * (Number(d.avgCost) || 0),
      0
    ),
  });
  totalRow.font = { bold: true };
  totalRow.getCell('totalValue').numFmt = moneyFmt;

  styleHeader(sheet, columns.length);
  return sheet;
}

// Genera y descarga un .xlsx del control de stock con dos hojas en el mismo
// libro: "Control" (tabla editable) y "Discontinuos" (sobrante, solo lectura).
// `control`, `items` y `discontinued` ya vienen en camelCase desde data/stock.js.
export async function exportStockControlToExcel(control, items, discontinued) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Gestion de Stock';
  workbook.created = new Date();

  buildControlSheet(workbook, items || [], !!control?.isHub);
  buildDiscontinuedSheet(workbook, discontinued || []);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  // Nombre: sucursal-rubro-fecha (ej: casa-central-armazones-2026-06-25.xlsx).
  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${control?.branchName || 'control'}-${control?.categoryName || ''}-${today}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') + '.xlsx';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
