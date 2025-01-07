const express = require("express");
const app = express();
const session = require("express-session");
const cookieParser = require("cookie-parser");
const path = require("path");
const route = require("./routes/router");

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.use("/node_modules", express.static(path.join(__dirname, "node_modules")));
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.set("views", path.join(__dirname, "views"));

// Configuración de middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(
  session({
    secret: "clave",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

app.use((req, res, next) => {
  if (req.session.user) {
    req.user = req.session.user;
  } else {
    req.user = null;
  }

  res.locals.user = req.user;
  next();
});

app.use("/", route);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
