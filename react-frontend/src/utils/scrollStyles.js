// Estilo de scroll compartido por el dashboard y el menú lateral, para que
// todas las áreas scrolleables de la app se vean igual.
//
// ⚠️ El color se resuelve con theme.applyStyles("dark", ...): dentro de `sx`,
// theme.palette.mode devuelve SIEMPRE "light" y el estilo oscuro no se aplica.
//
// La barra es fina y translúcida, y sólo toma color al pasar el mouse por
// encima del área (scrollbar-color de Firefox no admite :hover, así que ahí se
// ve siempre fina y tenue).
export const thinScrollbarSx = (theme) => ({
  scrollbarWidth: "thin",
  scrollbarColor: "rgba(0,0,0,0.18) transparent",
  "&::-webkit-scrollbar": { width: 6, height: 6 },
  "&::-webkit-scrollbar-track": { background: "transparent" },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: "transparent",
    borderRadius: 8,
    transition: "background-color .2s",
  },
  "&:hover::-webkit-scrollbar-thumb": { backgroundColor: "rgba(0,0,0,0.22)" },
  "&::-webkit-scrollbar-thumb:hover": { backgroundColor: "rgba(0,0,0,0.38)" },
  ...theme.applyStyles("dark", {
    scrollbarColor: "rgba(255,255,255,0.22) transparent",
    "&:hover::-webkit-scrollbar-thumb": { backgroundColor: "rgba(255,255,255,0.26)" },
    "&::-webkit-scrollbar-thumb:hover": { backgroundColor: "rgba(255,255,255,0.42)" },
  }),
});

// Alto máximo de los listados del dashboard: todos iguales, con scroll interno.
export const DASHBOARD_LIST_MAX_HEIGHT = 350;

// Área scrolleable de un listado del dashboard.
export const dashboardListScrollSx = (theme) => ({
  maxHeight: DASHBOARD_LIST_MAX_HEIGHT,
  overflowY: "auto",
  overflowX: "hidden",
  ...thinScrollbarSx(theme),
});

// Variante sin acceso al theme, para objetos `sx` planos que se consumen con
// spread (`...dataGridSx`) y por eso no pueden ser funcion. El modo oscuro se
// resuelve con la media query del sistema en vez de theme.applyStyles: no es
// equivalente si el usuario forzo un tema distinto al del SO, pero aca solo
// cambia el tono de la barra, no la legibilidad.
export const thinScrollbarPlainSx = {
  scrollbarWidth: "thin",
  scrollbarColor: "rgba(0,0,0,0.18) transparent",
  "&::-webkit-scrollbar": { width: 6, height: 6 },
  "&::-webkit-scrollbar-track": { background: "transparent" },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: "transparent",
    borderRadius: 8,
    transition: "background-color .2s",
  },
  "&:hover::-webkit-scrollbar-thumb": { backgroundColor: "rgba(0,0,0,0.22)" },
  "&::-webkit-scrollbar-thumb:hover": { backgroundColor: "rgba(0,0,0,0.38)" },
  "@media (prefers-color-scheme: dark)": {
    scrollbarColor: "rgba(255,255,255,0.22) transparent",
    "&:hover::-webkit-scrollbar-thumb": { backgroundColor: "rgba(255,255,255,0.26)" },
    "&::-webkit-scrollbar-thumb:hover": { backgroundColor: "rgba(255,255,255,0.42)" },
  },
};
