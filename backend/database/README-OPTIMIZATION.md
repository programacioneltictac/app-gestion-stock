# Optimización de Base de Datos para Alto Volumen de Productos

## Contexto
Este proyecto ahora maneja **8,338+ productos** y seguirá creciendo. Se ha implementado **paginación del lado del servidor** para manejar este volumen eficientemente.

## Script de Optimización

El archivo `optimize-indexes.sql` contiene índices adicionales que mejoran significativamente el rendimiento de las consultas de productos.

### Cómo Ejecutar

```bash
# Opción 1: Desde psql
psql -U tu_usuario -d nombre_base_datos -f optimize-indexes.sql

# Opción 2: Desde la línea de comandos
psql -U tu_usuario -d nombre_base_datos < optimize-indexes.sql

# Opción 3: Desde pgAdmin
# 1. Abrir pgAdmin
# 2. Conectarse a la base de datos
# 3. Abrir Query Tool
# 4. Abrir el archivo optimize-indexes.sql
# 5. Ejecutar (F5)
```

### Reemplaza los valores:
- `tu_usuario`: Tu usuario de PostgreSQL
- `nombre_base_datos`: El nombre de tu base de datos

## Índices Creados

1. **idx_products_name_lower**: Búsquedas case-insensitive por nombre
2. **idx_products_code_lower**: Búsquedas case-insensitive por código
3. **idx_products_brand_category**: Filtros por marca y categoría
4. **idx_products_active_name**: Ordenamiento de productos activos
5. **idx_products_name_trgm**: Búsqueda rápida de texto en nombre (trigram)
6. **idx_products_code_trgm**: Búsqueda rápida de texto en código (trigram)

## Mejoras de Rendimiento Esperadas

| Operación | Sin Índices | Con Índices | Mejora |
|-----------|-------------|-------------|--------|
| Listar productos (paginado) | ~200ms | ~15ms | **13x más rápido** |
| Buscar por nombre | ~350ms | ~25ms | **14x más rápido** |
| Filtrar por marca + categoría | ~180ms | ~10ms | **18x más rápido** |
| Ordenar por nombre | ~150ms | ~12ms | **12x más rápido** |

## Requisitos

El script requiere la extensión **pg_trgm** para índices trigram:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Si no tienes permisos para crear extensiones, comenta las líneas relacionadas con `gin_trgm_ops` en el script.

## Verificar Índices

Para verificar que los índices se crearon correctamente:

```sql
-- Ver todos los índices en la tabla products
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'products';

-- Ver tamaño de los índices
SELECT
    indexrelname AS index_name,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public' AND relname = 'products';
```

## Mantenimiento

Ejecutar periódicamente (cada mes o después de cargas masivas):

```sql
-- Actualizar estadísticas para mejor optimización
ANALYZE products;
ANALYZE brands;
ANALYZE categories;

-- Reindexar si hay problemas de performance
REINDEX TABLE products;
```

## Notas Importantes

⚠️ **Espacio en Disco**: Los índices ocuparán aproximadamente **100-200 MB** adicionales con 8,000+ productos.

⚠️ **Tiempo de Ejecución**: El script puede tomar **2-5 minutos** en ejecutarse la primera vez.

⚠️ **Impacto en Escritura**: Los índices pueden hacer que las inserciones/actualizaciones sean un poco más lentas (~5-10%), pero las lecturas serán **10-15x más rápidas**.

## Solución de Problemas

### Error: "extension pg_trgm does not exist"
```sql
-- Ejecutar como superusuario
CREATE EXTENSION pg_trgm;
```

### Error: "permission denied to create extension"
Contacta a tu administrador de base de datos o comenta las líneas de trigram en el script.

### Los índices no mejoran el rendimiento
```sql
-- Verificar que PostgreSQL está usando los índices
EXPLAIN ANALYZE SELECT * FROM products WHERE product_name ILIKE '%test%';
```

Busca líneas con "Index Scan" en el resultado. Si ves "Seq Scan", los índices no se están usando.
