import apiClient from "./apiClient";

/**
 * Importacion manual de stock por CSV (contingencia sin API de IDUO).
 *
 * No usa apiClient.post: ese metodo serializa a JSON y aca el cuerpo es el CSV
 * crudo. El archivo se manda como ArrayBuffer para que los bytes lleguen al
 * backend sin recodificar — el export de IDUO viene en latin1 y convertirlo a
 * UTF-8 en el camino romperia los enies.
 */
class ImportService {
  async #sendCsv(endpoint, file) {
    const buffer = await file.arrayBuffer();
    const token = apiClient.getAuthToken();

    const response = await fetch(`${apiClient.baseURL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "text/csv",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: buffer,
    });

    if (response.status === 401) {
      apiClient.removeAuthToken();
      window.location.href = "/#/login";
      throw new Error("Session expired. Please login again.");
    }

    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.message || "Error importando el archivo");
      error.code = data.code;
      error.details = data.details;
      throw error;
    }
    return data;
  }

  /** Analiza el CSV sin escribir nada: devuelve el resumen para confirmar. */
  async preview(file) {
    return this.#sendCsv("/import/stock/preview", file);
  }

  /** Importa el CSV. `branchId` es el que se mostro en la preview. */
  async commit(file, branchId) {
    const qs = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : "";
    return this.#sendCsv(`/import/stock${qs}`, file);
  }
}

export default new ImportService();
