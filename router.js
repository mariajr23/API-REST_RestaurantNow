const express = require("express");
const router = express.Router();
const conexion = require("./database/bd");

router.use((req, res, next) => {
  req.user = req.session.user || null;
  next();
});

router.get("/", (req, res) => {
  res.render("index");
});

router.get("/index", (req, res) => {
  res.render("index");
});

router.get("/restaurantes", (req, res) => {
  conexion.query("SELECT * FROM restaurantnow.restaurantes", (error, restaurants) => {
    if (error) {
      throw error;
    } else {
      res.render("restaurantes", { restaurants: restaurants });
    }
  });
});

router.get("/login", (req, res) => {
  res.render("login");
});

router.get('/vistaRest', (req, res) => {
  const id_restaurante = req.query.id_restaurante;
  const hora = req.query.hora;

  const restauranteQuery = `SELECT * FROM restaurantes WHERE id_restaurante = ?`;
  const platosQuery = `SELECT * FROM platos WHERE id_restaurante = ?`;
  const horariosQuery = `SELECT hora FROM horarios WHERE id_restaurante = ?`;

  conexion.query(restauranteQuery, [id_restaurante], (error, restauranteResults) => {
    if (error) {
      console.error('Error en la consulta:', error);
      return res.status(500).send('Error en la consulta');
    }

    conexion.query(platosQuery, [id_restaurante], (error, platosResults) => {
      if (error) {
        console.error('Error en la consulta:', error);
        return res.status(500).send('Error en la consulta');
      }

      conexion.query(horariosQuery, [id_restaurante], (error, horariosResults) => {
        if (error) {
          console.error('Error en la consulta:', error);
          return res.status(500).send('Error en la consulta');
        }

        console.log('Horarios:', horariosResults); // Agregar este console.log para verificar los datos de horarios

        res.render('vistaRest', {
          restaurants: restauranteResults,
          platos: platosResults,
          horarios: horariosResults
        });
      });
    });
  });
});

/*
router.get("/vistaRest", (req, res) => {
  const idRestaurante = req.query.id_restaurante;
  const restaurantQuery = "SELECT * FROM restaurantnow.restaurantes WHERE id_restaurante=?";
  const platosQuery = `SELECT p.id_plato, p.nombre AS nombre_plato, p.descripcion AS descripcion_plato, CAST(p.precio AS DECIMAL(10,2)) AS precio 
                       FROM platos p 
                       JOIN restaurantes r ON p.id_restaurante = r.id_restaurante 
                       WHERE r.id_restaurante = ?`;
  const horariosQuery = "SELECT * FROM horarios WHERE id_restaurante=?";

  Promise.all([
    new Promise((resolve, reject) => {
      conexion.query(restaurantQuery, [idRestaurante], (error, restaurants) => {
        if (error) return reject(error);
        resolve(restaurants);
      });
    }),
    new Promise((resolve, reject) => {
      conexion.query(platosQuery, [idRestaurante], (error, platos) => {
        if (error) return reject(error);
        resolve(platos);
      });
    }),
    new Promise((resolve, reject) => {
      conexion.query(horariosQuery, [idRestaurante], (error, horarios) => {
        if (error) return reject(error);
        console.log("Horarios:", horarios); // Agregar este log para verificar los horarios
        resolve(horarios);
      });
    })
  ])
  .then(([restaurants, platos, horarios]) => {
    res.render("vistaRest", { restaurants: restaurants, platos: platos, horarios: horarios });
  })
  .catch(error => {
    console.error('Error en la consulta:', error);
    res.status(500).send('Error en la consulta');
  });
});
*/


router.post("/checkout", (req, res) => {
  const { id_restaurante, fecha, hora, platosSeleccionados } = req.body;
  
  const platosIds = Array.isArray(platosSeleccionados) ? platosSeleccionados : [platosSeleccionados];
  
  const platosQuery = `SELECT id_plato, nombre AS nombre_plato, descripcion AS descripcion_plato, CAST(precio AS DECIMAL(10,2)) AS precio 
                       FROM platos 
                       WHERE id_plato IN (?)`;
  
  conexion.query(platosQuery, [platosIds], (error, platos) => {
    if (error) {
      console.error('Error en la consulta:', error);
      return res.status(500).send('Error en la consulta');
    }
    const precioTotal = platos.reduce((total, plato) => total + plato.precio, 0);
    res.render("checkout", { platos: platos, fecha, hora, precioTotal });
  });
});

router.post("/reservar", (req, res) => {
  const { id_restaurante, fecha, hora, nombre_cliente, telefono_cliente, platosSeleccionados } = req.body;
  console.log(hora)
  const horarioQuery = `SELECT hora FROM horarios WHERE id_restaurante = ? AND fecha = ? AND id_horario = ? AND disponible = TRUE`;

  conexion.query(horarioQuery, [id_restaurante, fecha, hora], (error, results) => {
    if (error) {
      console.error('Error en la consulta:', error);
      return res.status(500).send('Error en la consulta');
    }

    if (results.length === 0) {
      return res.status(400).send('Horario no disponible');
    }

    const id_horario = results[0].id_horario;

    const reservaQuery = `INSERT INTO reservas (id_restaurante, id_horario, nombre_cliente, telefono_cliente)
                          VALUES (?, ?, ?, ?)`;

    conexion.query(reservaQuery, [id_restaurante, id_horario, nombre_cliente, telefono_cliente], (error, result) => {
      if (error) {
        console.error('Error al insertar la reserva:', error);
        return res.status(500).send('Error al insertar la reserva');
      }

      const id_reserva = result.insertId;

      const platosPromises = platosSeleccionados.map(id_plato => {
        const reservaPlatoQuery = `INSERT INTO detalles_reservas (id_reserva, id_plato) VALUES (?, ?)`;
        return new Promise((resolve, reject) => {
          conexion.query(reservaPlatoQuery, [id_reserva, id_plato], (error) => {
            if (error) return reject(error);
            resolve();
          });
        });
      });

      Promise.all(platosPromises)
        .then(() => {
          const updateHorarioQuery = `UPDATE horarios SET disponibilidad = FALSE WHERE id_horario = ?`;
          return new Promise((resolve, reject) => {
            conexion.query(updateHorarioQuery, [id_horario], (error) => {
              if (error) return reject(error);
              resolve();
            });
          });
        })
        .then(() => {
          res.redirect('/vistaRest?id_restaurante=' + id_restaurante);
        })
        .catch(error => {
          console.error('Error al insertar los platos de la reserva:', error);
          res.status(500).send('Error al insertar los platos de la reserva');
        });
    });
  });
});

router.get("/registro", (req, res) => {
  res.render("registro");
});

router.get("/adminRest", (req, res) => {
  conexion.query("SELECT * FROM restaurantnow.restaurantes", (error, restaurants) => {
    if (error) {
      throw error;
    } else {
      res.render("adminRest", { restaurants: restaurants });
    }
  });
});

module.exports = router;
