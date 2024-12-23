const express = require("express");
const app = express();
const session = require("express-session");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const path = require("path");
const route = require("./routes/router");
const { authenticate } = require("./middleware/auth");

app.set("view engine", "ejs");
app.use("/node_modules", express.static(path.join(__dirname, "node_modules")));
app.use(express.static(path.join(__dirname, "public")));

// Configura la carpeta de vistas
app.set("views", path.join(__dirname, "views"));
// Configuración de middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(
  session({
    secret: "tu_secreto",
    resave: false,
    saveUninitialized: false,
  })
);

// Middleware para manejar la sesión y usuario
app.use((req, res, next) => {
  const token = req.cookies.token;
  if (token) {
    jwt.verify(token, "tu_clave_secreta", (err, decoded) => {
      if (err) {
        req.user = null;
      } else {
        req.user = decoded;
      }
    });
  } else {
    req.user = null;
  }
  res.locals.user = req.user;
  next();
});

// Usar las rutas
app.use("/", route);

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
