"""
Acceso a datos por entidad. Los repositorios solo consultan y persisten: las
validaciones de negocio y la verificación de propiedad se quedan en los routers,
y el commit/rollback/refresh (el límite de la transacción) también.
"""
