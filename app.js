const express = require("express");
const app = express();
const path = require("path");
const router = require("./router");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views")); 

app.use(express.urlencoded({ extended: false }));

app.use(express.static(path.join(__dirname, "public")));

const session = require('express-session');
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));



app.use((req, res, next) => {
  if (!req.session.user) {
    req.session.user = null; // o un objeto de usuario simulado
  }
  next();
});

app.use(express.static('img'));

app.use(express.json()); 


app.use("/", require("./router"));

//app.use(express.static(path.join(__dirname, 'client/build')));

app.use(express.json());

app.use("/", router);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.ejs'));
});


app.listen(3000, () => {
  console.clear();
  console.log("El servidor está en el puerto 3000 y esta escuchando");
});
