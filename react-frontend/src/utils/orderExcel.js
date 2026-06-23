import ExcelJS from 'exceljs';

// Genera y descarga un .xlsx con el detalle de items de una orden.
// `order` e `items` ya vienen transformados (camelCase) desde data/orders.js.
export async function exportOrderToExcel(order, items) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Gestion de Stock';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(`Orden ${order.id}`);

  // Las ordenes externas se consolidan por proveedor (cabecera) y son
  // multi-sucursal: la sucursal es la info que diferencia cada item.
  const isExternal = !order.isInternal;

  const columns = [
    { header: 'Producto', key: 'displayName', width: 40 },
    ...(isExternal ? [{ header: 'Sucursal', key: 'branchName', width: 20 }] : []),
    { header: 'Rubro', key: 'categoryName', width: 18 },
    { header: 'Condición', key: 'conditionName', width: 16 },
    { header: 'Pedido', key: 'quantityOrdered', width: 10 },
    { header: 'Recibido', key: 'quantityReceived', width: 10 },
    { header: 'Costo unit.', key: 'unitCost', width: 14 },
    { header: 'Subtotal', key: 'costEstimate', width: 14 },
  ];
  sheet.columns = columns;

  // Estilo del encabezado.
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1976D2' } };
  headerRow.alignment = { vertical: 'middle' };

  items.forEach((it) => {
    sheet.addRow({
      displayName: it.displayName,
      ...(isExternal ? { branchName: it.branchName || '—' } : {}),
      categoryName: it.categoryName,
      conditionName: it.conditionName || '—',
      quantityOrdered: it.quantityOrdered,
      quantityReceived: it.quantityReceived,
      unitCost: it.unitCost || 0,
      costEstimate: it.costEstimate || 0,
    });
  });

  // Formato de moneda (ARS) en costo unitario y subtotal.
  const moneyFmt = '"$"#,##0';
  sheet.getColumn('unitCost').numFmt = moneyFmt;
  sheet.getColumn('costEstimate').numFmt = moneyFmt;

  // Fila de total al final.
  const totalRow = sheet.addRow({
    displayName: 'TOTAL',
    quantityOrdered: items.reduce((s, it) => s + (it.quantityOrdered || 0), 0),
    quantityReceived: items.reduce((s, it) => s + (it.quantityReceived || 0), 0),
    costEstimate: items.reduce((s, it) => s + (it.costEstimate || 0), 0),
  });
  totalRow.font = { bold: true };
  totalRow.getCell('costEstimate').numFmt = moneyFmt;

  // Filtro/auto en el encabezado.
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  // Externas: el archivo se nombra por proveedor; internas por sucursal destino.
  const etiqueta = isExternal
    ? (order.supplierName || 'sin-proveedor')
    : `${order.branchName || ''}-interna`;
  const fileName = `orden-${order.id}-${etiqueta}`
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
