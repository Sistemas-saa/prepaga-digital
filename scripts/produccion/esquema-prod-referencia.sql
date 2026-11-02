-- Captura el esquema de public de BR prod para scripts/produccion/esquema-prod-referencia.txt.
-- SOLO LECTURA (catalogo). Correr en el SQL Editor de prod o por el MCP, pegar el
-- resultado de la primera consulta en el .txt (una linea por tabla, debajo del
-- encabezado) y anotar en el encabezado la fecha y los conteos.
-- Despues: node scripts/produccion/build-entrega-a.mjs (verifica el md5 de la segunda).

SELECT string_agg(t, E'\n' ORDER BY t COLLATE "C") AS lineas
  FROM (SELECT c.relname || '|' || string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ','
                                              ORDER BY a.attname COLLATE "C") AS t
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
         WHERE c.relkind IN ('r', 'p')
         GROUP BY c.relname) s;

-- Control de la transcripcion: tiene que coincidir con lo que calcula el generador.
SELECT count(DISTINCT c.relname) AS tablas, count(*) AS columnas,
       md5(string_agg(c.relname || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod), ','
                      ORDER BY c.relname COLLATE "C", a.attname COLLATE "C")) AS md5
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
 WHERE c.relkind IN ('r', 'p');
