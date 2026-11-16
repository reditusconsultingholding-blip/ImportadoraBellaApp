-- Permiso de nómina para los dos usuarios de Sebastian (Reditus), pedido por
-- él el 16-nov para grabar el video de capacitación de Nómina.
UPDATE "User" SET "canViewPayroll" = true
 WHERE id IN ('usr_sebastian_reditus', 'cmu9043ry0000w8v97ug7wzc8')
   AND "organizationId" = 'org_importadora_bella';
