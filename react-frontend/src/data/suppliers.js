import apiClient from "../services/apiClient";

// ===================== PROVEEDORES (suppliers) =====================

export async function getSuppliers() {
  const data = await apiClient.get("/suppliers");
  return data.suppliers || [];
}

export async function createSupplier({ supplierName, contactInfo }) {
  const data = await apiClient.post("/suppliers", {
    supplier_name: supplierName,
    contact_info: contactInfo || null,
  });
  return data.supplier;
}

export async function updateSupplier(id, { supplierName, contactInfo }) {
  const data = await apiClient.put(`/suppliers/${id}`, {
    supplier_name: supplierName,
    contact_info: contactInfo || null,
  });
  return data.supplier;
}

export async function deleteSupplier(id) {
  await apiClient.delete(`/suppliers/${id}`);
}

// Asigna (o quita, con supplierId = null) el proveedor de una marca.
export async function setBrandSupplier(brandId, supplierId) {
  return apiClient.patch(`/stock/catalogs/brands/${brandId}/supplier`, {
    supplierId: supplierId ?? null,
  });
}

// Sincroniza la API de compras de IDUO: puebla proveedores y asocia marca→proveedor.
// Devuelve el reporte de la corrida. monthsBack opcional (default backend).
export async function syncCompras({ monthsBack } = {}) {
  const data = await apiClient.post("/suppliers/sync-compras", monthsBack ? { monthsBack } : {});
  return data.report;
}
