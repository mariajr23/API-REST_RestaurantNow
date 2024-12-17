const jwt = require('jsonwebtoken');

// Middleware para verificar la autenticación del usuario
const isAuthenticated = (req, res, next) => {
  const token = req.cookies.token || req.header('Authorization')?.split(' ')[1]; // Unifica la obtención del token

  if (!token) {
    res.locals.user = null;
    return next(); // No está autenticado, sigue sin errores
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY || 'tu_clave_secreta'); // Usa la clave secreta desde variables de entorno
    req.user = decoded;
    res.locals.user = decoded; 
    next();
  } catch (error) {
    res.locals.user = null; // Si el token es inválido, el usuario no está autenticado
    next();
  }
};

// Middleware para verificar si el usuario es admin
const isAdmin = (req, res, next) => {
  const token = req.cookies.token || req.header('Authorization')?.split(' ')[1]; // Obtener token de la cookie o del header

  if (!token) {
    return res.status(401).send('Token no proporcionado');
  }

  try {
    const decoded = jwt.verify(token, 'tu_clave_secreta');
    req.user = decoded; // Guardar la información del usuario decodificada en la solicitud
    if (decoded.email === "admin@admin") {
      return next(); // Si es admin, pasa al siguiente middleware
    } else {
      return res.status(403).send('Acceso denegado');
    }
  } catch (error) {
    return res.status(401).send('Token inválido o expirado');
  }
};


// Exportar ambos middleware
module.exports = { isAuthenticated, isAdmin };
