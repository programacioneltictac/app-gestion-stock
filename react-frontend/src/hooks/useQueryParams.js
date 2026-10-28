import * as React from "react";
import { useSearchParams } from "react-router";

/**
 * Estado de pantalla en la URL: devuelve [searchParams, updateParams].
 *
 * updateParams({ tab: "promo", filter: null }, { replace: true }) parte de la
 * query ACTUAL (forma funcional de setSearchParams, así dos cambios seguidos no
 * se pisan), setea los valores y borra los que vienen null/undefined. Un string
 * vacío SE SETEA (`?x=`), no se borra: hay pantallas donde vacío y ausente
 * significan cosas distintas.
 *
 * `replace` por defecto es false, igual que setSearchParams: cada cambio crea
 * una entrada de historial salvo que se pida lo contrario.
 */
export default function useQueryParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const updateParams = React.useCallback(
    (changes, { replace = false } = {}) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value == null) next.delete(key);
            else next.set(key, String(value));
          }
          return next;
        },
        { replace }
      );
    },
    [setSearchParams]
  );

  return [searchParams, updateParams];
}
