const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next(); // El usuario está autenticado, continúa con la siguiente función
  } else {
    return res.redirect("/acceso-denegado");
  }
};

const isAdmin = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/acceso-denegado");
  }

  if (req.session.user.email === "admin@admin.com") {
    return next();
  } else {
    return res.redirect("/acceso-denegado");
  }
};

module.exports = { isAuthenticated, isAdmin };
