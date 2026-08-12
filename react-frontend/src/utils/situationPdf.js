import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getOrderStatusLabel } from '../data/orders';

// Azul de la app, el mismo que usa el encabezado del Excel (orderExcel.js).
const BLUE = [25, 118, 210];
const GREY = [117, 117, 117];
const RED = [198, 40, 40];

// Compliance por debajo del cual una sucursal se considera crítica. Mismo
// umbral que usa la app para habilitar "generar pedido".
const CRITICAL_COMPLIANCE = 70;

const money = (v) =>
  Number(v || 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  });

const units = (v) => Number(v || 0).toLocaleString('es-AR');

const dateTime = (d) =>
  d
    ? d.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const days = (v) => (v != null ? `${v} d` : '—');
const pct = (v) => (v != null ? `${v}%` : '—');

// Estilos compartidos por todas las tablas: encabezado azul, filas alternadas.
const tableStyles = (extra = {}) => ({
  theme: 'striped',
  headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
  styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' },
  alternateRowStyles: { fillColor: [245, 247, 250] },
  margin: { left: 14, right: 14 },
  ...extra,
});

/**
 * Genera y descarga el informe de situación en PDF.
 *
 * Recibe los datos ya normalizados por data/reports.js: acá no se calcula
 * ningún número, solo se maqueta. Cualquier diferencia con la pantalla es del
 * backend, no de este archivo.
 *
 * @param {object} report Salida de getSituation().
 */
export function generateSituationPdf(report) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  // `y` acompaña la posición vertical entre secciones que no son tablas;
  // después de cada autoTable se retoma desde finalY.
  let y = 18;

  // ---- Portada / encabezado -------------------------------------------------
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setTextColor(255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('Informe de situación', 14, 12);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text(
    report.scope === 'branch' ? 'Alcance: su sucursal' : 'Alcance: todas las sucursales',
    14,
    19
  );
  doc.setTextColor(0);
  y = 34;

  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text(`Generado: ${dateTime(report.generatedAt)}`, 14, y);
  doc.text(`Últ. sincronización: ${dateTime(report.lastSyncAt)}`, pageWidth - 14, y, {
    align: 'right',
  });
  doc.setTextColor(0);
  y += 8;

  // ---- 1) Resumen ejecutivo -------------------------------------------------
  // Va primero y sale de las mismas cifras que el detalle, así la portada no
  // puede contradecir a las páginas siguientes.
  const s = report.summary;
  autoTable(doc, {
    ...tableStyles(),
    startY: y,
    head: [['Resumen ejecutivo', '']],
    body: [
      ['Sucursales en el informe', units(s.branches)],
      ['Sucursales críticas (< 70% de cumplimiento)', units(s.criticalBranches)],
      ['Cumplimiento promedio', pct(s.avgCompliance)],
      ['Faltantes muy prioritarios', `${units(s.muyPrioritariosUnits)} u. — ${money(s.muyPrioritariosValue)}`],
      ['Discontinuos', `${units(s.discontinuedUnits)} u. — ${money(s.discontinuedValue)}`],
      ['Marcas a prueba (valorizado)', money(s.brandTrialsValue)],
      ['Órdenes abiertas a proveedor', `${units(s.openOrdersSupplier)} — ${money(s.supplierOrdersValue)}`],
      ['Órdenes internas abiertas (Hub)', units(s.openOrdersHub)],
    ],
    columnStyles: { 1: { halign: 'right', cellWidth: 62, fontStyle: 'bold' } },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ---- 2) Estado por sucursal ----------------------------------------------
  section(doc, 'Estado por sucursal', y);
  autoTable(doc, {
    ...tableStyles(),
    startY: y + 4,
    head: [['Sucursal', 'Ítems', 'A pedir', 'Óptimos', 'Excedente', 'Cumpl.']],
    body: report.byBranch.map((r) => [
      r.branchName + (r.isHub ? ' (Hub)' : ''),
      units(r.totalItems),
      units(r.needOrderItems),
      units(r.optimalItems),
      units(r.excessItems),
      pct(r.avgCompliance),
    ]),
    columnStyles: {
      1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
      4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' },
    },
    // Las sucursales bajo el umbral se pintan en rojo: es el dato que dispara
    // la acción, y en una tabla de nueve filas se pierde si no resalta.
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 5) return;
      const row = report.byBranch[data.row.index];
      if (row?.avgCompliance != null && row.avgCompliance < CRITICAL_COMPLIANCE) {
        data.cell.styles.textColor = RED;
      }
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ---- 3) Faltantes muy prioritarios ---------------------------------------
  y = sectionTable(doc, y, 'Faltantes muy prioritarios por sucursal', {
    head: [['Sucursal', 'Ítems', 'Unidades', 'Valorizado']],
    body: report.muyPrioritarios.map((r) => [
      r.branchName, units(r.items), units(r.units), money(r.value),
    ]),
    total: ['Total', null, s.muyPrioritariosUnits, s.muyPrioritariosValue],
    empty: 'Sin faltantes muy prioritarios pendientes de pedir.',
  });

  // ---- 4) Discontinuos ------------------------------------------------------
  y = sectionTable(doc, y, 'Discontinuos (stock fuera del control activo)', {
    head: [['Sucursal', 'Ítems', 'Unidades', 'Valorizado']],
    body: report.discontinued.map((r) => [
      r.branchName, units(r.items), units(r.units), money(r.value),
    ]),
    total: ['Total', null, s.discontinuedUnits, s.discontinuedValue],
    empty: 'Sin discontinuos valorizados.',
  });

  // ---- 5) Marcas a prueba ---------------------------------------------------
  y = sectionTable(doc, y, 'Marcas a prueba', {
    head: [['Sucursal', 'Pruebas', 'Vencidas', 'Unidades', 'Valorizado']],
    body: report.brandTrials.map((r) => [
      r.branchName, units(r.trials), units(r.dueTrials), units(r.units), money(r.value),
    ]),
    empty: 'Sin marcas en período de prueba.',
  });

  // ---- 6) Órdenes por estado ------------------------------------------------
  section(doc, 'Órdenes por estado', y);
  autoTable(doc, {
    ...tableStyles(),
    startY: y + 4,
    head: [['Estado', 'A proveedor', 'Valorizado', 'Internas (Hub)']],
    // Las internas no se valorizan: son movimientos entre sucursales propias,
    // no una compra.
    body: report.supplierOrders.map((r, i) => [
      getOrderStatusLabel(r.status),
      units(r.orders),
      money(r.value),
      units(report.hubOrders[i]?.orders || 0),
    ]),
    columnStyles: {
      1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ---- 7) Antigüedad y comprometido del Hub --------------------------------
  const age = report.orderAge;
  const hub = report.hubCommitted;
  y = sectionTable(doc, y, 'Antigüedad de órdenes en gestión', {
    head: [['Tipo', 'Abiertas', 'Promedio', 'Más antigua']],
    body: [
      ['A proveedor', units(age.openSupplier), days(age.avgDaysSupplier), days(age.maxDaysSupplier)],
      ['Internas (Hub)', units(age.openHub), days(age.avgDaysHub), days(age.maxDaysHub)],
    ],
    columnStyles: {
      1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
    },
  });

  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text(
    `Comprometido del Hub: ${units(hub.units)} u. en ${units(hub.items)} ítems, ` +
      `de ${units(hub.orders)} órdenes internas vivas.`,
    14,
    y - 4
  );
  doc.setTextColor(0);
  y += 4;

  // ---- 8) Órdenes a proveedor abiertas -------------------------------------
  // Sin umbral de "trabada": los plazos varían según el proveedor, así que se
  // listan todas por antigüedad y la lectura queda del lado del negocio.
  y = sectionTable(doc, y, 'Órdenes a proveedor abiertas (por antigüedad)', {
    head: [['Orden', 'Proveedor', 'Sucursal', 'Estado', 'Días', 'Importe']],
    body: report.openSupplierOrders.map((r) => [
      `#${r.id}`,
      r.supplierName,
      r.branchName,
      getOrderStatusLabel(r.status),
      units(r.daysOpen),
      money(r.value),
    ]),
    // Seis columnas entran justas en A4: se fijan las angostas y se le deja al
    // proveedor el ancho sobrante, para que la sucursal no se parta ("Casa
    // Central" se cortaba en "Casa" con anchos automáticos).
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 26 },
      3: { cellWidth: 30 },
      4: { halign: 'right', cellWidth: 13 },
      5: { halign: 'right', cellWidth: 26 },
    },
    empty: 'Sin órdenes a proveedor abiertas.',
  });

  // ---- 9) Rubros más críticos ----------------------------------------------
  y = sectionTable(doc, y, 'Rubros con mayor faltante valorizado', {
    head: [['Rubro', 'Ítems', 'Valorizado']],
    body: report.topCategories.map((r) => [
      r.categoryName, units(r.items), money(r.value),
    ]),
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    empty: 'Sin faltantes valorizados por rubro.',
  });

  addFooter(doc);

  const stamp = report.generatedAt.toISOString().slice(0, 10);
  doc.save(`informe-situacion-${stamp}.pdf`);
}

// Título de sección. Salta de página si no entra el título junto con al menos
// las primeras filas de su tabla; si no, quedaría un título huérfano al pie.
function section(doc, title, y) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - 45) {
    doc.addPage();
    y = 18;
  }
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...BLUE);
  doc.text(title, 14, y);
  doc.setTextColor(0);
  doc.setFont(undefined, 'normal');
  return y;
}

/**
 * Dibuja título + tabla y devuelve la nueva `y`. Si no hay filas, escribe el
 * texto `empty` en vez de una tabla vacía: un informe con tablas huecas se lee
 * como si el dato se hubiera perdido.
 */
function sectionTable(doc, y, title, { head, body, total, empty, columnStyles }) {
  const top = section(doc, title, y);

  if (!body.length) {
    doc.setFontSize(9);
    doc.setTextColor(...GREY);
    doc.text(empty || 'Sin datos.', 14, top + 6);
    doc.setTextColor(0);
    return top + 14;
  }

  const rows = [...body];
  if (total) {
    const [label, items, u, v] = total;
    rows.push([
      label,
      items != null ? units(items) : '',
      units(u),
      money(v),
    ]);
  }

  autoTable(doc, {
    ...tableStyles(),
    startY: top + 4,
    head,
    body: rows,
    columnStyles: columnStyles || {
      1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
    },
    // La fila de total se marca en negrita sin fondo alterno.
    didParseCell: (data) => {
      if (total && data.section === 'body' && data.row.index === rows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [232, 240, 250];
      }
    },
  });

  return doc.lastAutoTable.finalY + 10;
}

// Pie con "Página X de Y". Se hace al final, cuando ya se conoce el total.
function addFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text('Gestión de Stock — Informe de situación', 14, pageHeight - 8);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 8, {
      align: 'right',
    });
  }
  doc.setTextColor(0);
}
