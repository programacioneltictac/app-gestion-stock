import apiClient from "../services/apiClient";

// ===================== MARCAS A PRUEBA (brand_trials) =====================

export const TRIAL_STATUS_LABELS = {
  en_prueba:   "En prueba",
  incorporada: "Incorporada",
  descartada:  "Descartada",
};

export const SAMPLE_TYPE_LABELS = {
  consignacion: "Consignación",
  compra:       "Compra directa",
};

export function getTrialStatusLabel(status) {
  return TRIAL_STATUS_LABELS[status] || status;
}

// Estado mostrado: "A evaluar" si está en prueba pero vencido (is_due);
// si no, el label normal del estado.
export function getTrialDisplayStatus(trial) {
  if (trial.status === "en_prueba" && trial.isDue) return "A evaluar";
  return getTrialStatusLabel(trial.status);
}

export function getTrialStatusColor(trial) {
  if (trial.status === "incorporada") return "success";
  if (trial.status === "descartada") return "default";
  if (trial.isDue) return "warning"; // en prueba + vencido = A evaluar
  return "info"; // en prueba vigente
}

function transformTrial(t) {
  return {
    id:             t.id,
    brandId:        t.brand_id,
    brandName:      t.brand_name || "",
    branchId:       t.branch_id,
    branchName:     t.branch_name || "",
    categoryId:     t.category_id || null,
    categoryName:   t.category_name || "",
    startDate:      t.start_date,
    endDate:        t.end_date,
    sampleQty:      t.sample_qty != null ? Number(t.sample_qty) : null,
    sampleType:     t.sample_type || null,
    sampleUnitCost: t.sample_unit_cost != null ? Number(t.sample_unit_cost) : null,
    status:         t.status,
    isDue:          t.is_due === true,
    // Stock y costo REALES de la marca en la sucursal/rubro, tomados del sync.
    syncedStock:    t.sync_stock?.stock != null ? Number(t.sync_stock.stock) : 0,
    syncedCost:     t.sync_stock?.cost != null ? Number(t.sync_stock.cost) : null,
    decisionNotes:  t.decision_notes || "",
    decidedAt:      t.decided_at || null,
    createdAt:      t.created_at,
    updatedAt:      t.updated_at,
  };
}

export async function getBrandTrials() {
  const data = await apiClient.get("/brand-trials");
  return (data.trials || []).map(transformTrial);
}

export async function createBrandTrial(payload) {
  const data = await apiClient.post("/brand-trials", payload);
  return transformTrial(data.trial);
}

export async function updateBrandTrial(id, payload) {
  const data = await apiClient.put(`/brand-trials/${id}`, payload);
  return transformTrial(data.trial);
}

// decision: 'incorporada' | 'descartada'
export async function decideBrandTrial(id, decision, notes = null) {
  const data = await apiClient.patch(`/brand-trials/${id}/decide`, { decision, notes });
  return transformTrial(data.trial);
}

export async function deleteBrandTrial(id) {
  await apiClient.delete(`/brand-trials/${id}`);
}
