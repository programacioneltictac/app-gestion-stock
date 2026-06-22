import apiClient from '../services/apiClient';

// Configuracion global de la app (tabla app_settings, clave/valor).

export async function getSettings() {
  const data = await apiClient.get('/settings');
  // Devuelve un objeto { key: { value, description } } para acceso directo.
  const map = {};
  (data.settings || []).forEach((s) => {
    map[s.key] = { value: s.value, description: s.description };
  });
  return map;
}

export async function updateSetting(key, value) {
  const data = await apiClient.put(`/settings/${key}`, { value });
  return data.setting;
}
