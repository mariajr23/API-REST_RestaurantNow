const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next(); // El usuario está autenticado, continúa con la siguiente función
  } else {
    return res.redirect("/login"); // Redirige si no está autenticado
  }
};

const isAdmin = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).send("No estás autenticado");
  }

  if (req.session.user.email === "admin@admin.com") {
    return next();
  } else {
    return res.status(403).send("Acceso denegado");
  }
};

module.exports = { isAuthenticated, isAdmin };
