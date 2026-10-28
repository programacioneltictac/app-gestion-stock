// Formateo de valores para la UI (es-AR). Un solo Intl.NumberFormat cacheado:
// crearlo es caro y las grillas lo llaman una vez por celda.
const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

// "$ 1.234.568". null/undefined/NaN se muestran como "$ 0" (no "$ NaN").
export const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);

// "28/10/2026". Sin fecha o fecha inválida devuelve `fallback`.
export const formatDate = (value, fallback = "") => {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleDateString("es-AR");
};

// "28/10/2026, 02:05 p. m." en hora local. Sin fecha o fecha inválida devuelve null.
export const formatDateTime = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
