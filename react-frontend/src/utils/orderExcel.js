import ExcelJS from 'exceljs';

// Genera y descarga un .xlsx con el detalle de items de una orden.
// `order` e `items` ya vienen transformados (camelCase) desde data/orders.js.
export async function exportOrderToExcel(order, items) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Gestion de Stock';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(`Orden ${order.id}`);

  // El proveedor solo es relevante en ordenes externas (las internas van al Hub).
  const showSupplier = !order.isInternal;

  const columns = [
    { header: 'Producto', key: 'displayName', width: 40 },
    { header: 'Rubro', key: 'categoryName', width: 18 },
    { header: 'Condición', key: 'conditionName', width: 16 },
    ...(showSupplier ? [{ header: 'Proveedor', key: 'supplierName', width: 24 }] : []),
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
      categoryName: it.categoryName,
      conditionName: it.conditionName || '—',
      ...(showSupplier ? { supplierName: it.supplierName || 'Sin asignar' } : {}),
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

  const tipo = order.isInternal ? 'interna' : 'externa';
  const fileName = `orden-${order.id}-${order.branchName || ''}-${tipo}`
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
