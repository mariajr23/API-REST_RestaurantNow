const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const fetch = require("node-fetch");
const saltRounds = 10;
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const moment = require("moment");
const { conexion, buscarRestaurantes } = require("../database/bd");
const { isAuthenticated, isAdmin } = require("../middleware/auth");
const { User } = require("../models/User");
const paypal = require("@paypal/checkout-server-sdk");
const paypalClient = require("./paypal");

router.get("/verificar-sesion", (req, res) => {
  if (req.session && req.session.user) {
    res.json({ mensaje: "Sesión activa", usuario: req.session.user });
  } else {
    res.status(401).json({ mensaje: "No hay sesión activa" });
  }
});

//Configuracion nodemailer
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: "mjimenez19@alu.ucam.edu",
    pass: "Maria230100=",
  },
});

// Middleware para manejar la sesión
router.use((req, res, next) => {
  req.user = req.session.user || null;
  res.locals.user = req.user;
  next();
});

// Rutas públicas (sin autenticación)
router.get("/", (req, res) => {
  res.render("index");
});

router.get("/restaurantes", (req, res) => {
  const query = "SELECT * FROM restaurantes WHERE estado = 'aceptado'";

  conexion.query(query, (error, results) => {
    if (error) {
      console.error("Error en la consulta:", error);
      return res.status(500).send("Error en el servidor");
    }

    res.render("restaurantes", { restaurants: results });
  });
});

router.get("/buscar-restaurantes", (req, res) => {
  const query = req.query.query || "";
  buscarRestaurantes(query, (error, results) => {
    if (error) {
      console.error("Error al buscar restaurantes:", error);
      return res.status(500).send("Error al buscar restaurantes");
    }
    res.render("restaurantes", { restaurants: results });
  });
});

router.get("/login", (req, res) => {
  res.render("login");
});

router.post("/login", async (req, res) => {
  const { email, contrasena } = req.body;

  try {
    const usuario = await User.findOne({ where: { email } });
    if (!usuario)
      return res.status(404).json({ error: "Usuario no encontrado" });

    const match = await bcrypt.compare(contrasena, usuario.contrasena);
    if (!match) return res.status(401).json({ error: "Contraseña incorrecta" });

    const token = jwt.sign({ id: usuario.id, rol: usuario.rol }, "SECRET_KEY", {
      expiresIn: "1h",
    });

    res.status(200).json({ mensaje: "Login exitoso", token, rol: usuario.rol });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al iniciar sesión" });
  }
});

router.get("/registro", (req, res) => {
  res.render("registro");
});

router.post("/registrar/cliente", async (req, res) => {
  const { nombre, email, contrasena, telefono } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(contrasena, 10);
    const query = `INSERT INTO usuarios (nombre, email, contrasena, telefono, rol) 
                   VALUES (?, ?, ?, ?, 'usuario')`;

    conexion.query(
      query,
      [nombre, email, hashedPassword, telefono],
      (error, results) => {
        if (error) {
          console.error(error);
          return res
            .status(500)
            .json({ error: "Error al registrar el cliente" });
        }

        return res.redirect("/login");
      }
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al registrar el cliente" });
  }
});

router.post("/registrar/restaurante", async (req, res) => {
  const { nombre, email, contrasena, telefono, direccion } = req.body;

  try {
    // Encriptar la contraseña
    const hashedPassword = await bcrypt.hash(contrasena, 10);

    // Consulta para insertar el usuario
    const queryUsuario = `INSERT INTO usuarios (nombre, email, contrasena, telefono, rol) 
                          VALUES (?, ?, ?, ?, 'restaurante')`;

    conexion.query(
      queryUsuario,
      [nombre, email, hashedPassword, telefono],
      (errorUsuario, resultsUsuario) => {
        if (errorUsuario) {
          console.error("Error al registrar el usuario:", errorUsuario);
          return res
            .status(500)
            .json({ error: "Error al registrar el restaurante" });
        }

        console.log(
          "Usuario registrado con éxito, ID:",
          resultsUsuario.insertId
        );
        return res.redirect("/login");
      }
    );
  } catch (error) {
    console.error("Error en el proceso de registro:", error);
    return res.status(500).json({ error: "Error al registrar el restaurante" });
  }
});

//Rutas para la administracion de Restaurantes
router.post("/iniciarsesion-restaurante", (req, res) => {
  const { email, contrasena } = req.body;

  const query =
    "SELECT * FROM usuarios WHERE email = ? AND rol = 'restaurante'";

  conexion.query(query, [email], (error, results) => {
    if (error) {
      console.error("Error en la consulta:", error);
      return res.status(500).send("Error en el servidor");
    }

    if (results.length === 0) {
      return res
        .status(401)
        .send("Correo electrónico o contraseña incorrectos");
    }

    const user = results[0];

    bcrypt.compare(contrasena, user.contrasena, (err, isMatch) => {
      if (err) {
        console.error("Error al comparar contraseñas:", err);
        return res.status(500).send("Error en el servidor");
      }

      if (isMatch) {
        req.session.user = {
          id: user.id_usuario,
          nombre: user.nombre,
          email: user.email,
          telefono: user.telefono,
        };

        console.log("Restaurante autenticado:", req.session.user);
        verificarRestaurante(req, res);
      } else {
        return res
          .status(401)
          .send("Correo electrónico o contraseña incorrectos");
      }
    });
  });
});

router.get("/restaurante/crear", (req, res) => {
  const userId = req.session.user?.id;
  conexion.query(
    "SELECT nombre, apellido, email, telefono FROM usuarios WHERE id_usuario = ?",
    [userId],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error al obtener datos del usuario.");
      }

      const usuario = results[0];

      res.render("restaurante/crear", { user: usuario });
    }
  );
});
router.post("/restaurante/crear", isAuthenticated, (req, res) => {
  const { nombre, descripcion, direccion, telefono } = req.body;
  const id_usuario = req.session.user.id;

  const queryExistente = "SELECT * FROM restaurantes WHERE id_usuario = ?";
  conexion.query(queryExistente, [id_usuario], (err, results) => {
    if (err) {
      return res.status(500).send("Error en la base de datos");
    }

    if (results.length > 0) {
      return res
        .status(400)
        .send("Este usuario ya tiene un restaurante registrado.");
    }
    console.log("Datos del restaurante:", {
      nombre,
      descripcion,
      direccion,
      telefono,
      id_usuario,
    });

    const queryRestaurante =
      "INSERT INTO restaurantes (nombre, descripcion, direccion, telefono, id_usuario, estado) VALUES (?, ?, ?, ?, ?, 'pendiente')";
    conexion.query(
      queryRestaurante,
      [nombre, descripcion, direccion, telefono, id_usuario],
      (err, results) => {
        if (err) {
          return res.status(500).send("Error al registrar el restaurante");
        }

        res.redirect("/restaurante/dashboard");
      }
    );
  });
});

router.get("/restaurante/dashboard", (req, res) => {
  res.render("restaurante/dashboard");
});
router.get("/restaurante/reservas", isAuthenticated, (req, res) => {
  const userId = req.session.user?.id;

  conexion.query(
    "SELECT id_restaurante FROM restaurantes WHERE id_usuario = ?",
    [userId],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error al obtener datos del restaurante.");
      }

      if (results.length === 0) {
        return res.render("restaurante/reservas", {
          reservas: [],
          reservasAnteriores: [],
        });
      }

      const restauranteId = results[0].id_restaurante;

      conexion.query(
        `SELECT r.id_reserva, r.fecha, r.hora, r.estado, r.id_pago,
   u.nombre AS nombre_cliente, u.telefono AS telefono_cliente,
   GROUP_CONCAT(CONCAT(rp.cantidad, 'x ', p.nombre) SEPARATOR ', ') AS platos
  FROM reservas r
  JOIN usuarios u ON r.id_usuario = u.id_usuario
  LEFT JOIN reserva_platos rp ON r.id_reserva = rp.id_reserva
  LEFT JOIN platos p ON rp.id_plato = p.id_plato
  WHERE r.id_restaurante = ?
  GROUP BY r.id_reserva
  ORDER BY r.fecha ASC, r.hora ASC`,
        [restauranteId],
        (err, reservas) => {
          if (err) {
            console.error(err);
            return res.status(500).send("Error al obtener reservas.");
          }

          const reservasPendientes = reservas.filter(
            (reserva) => reserva.estado === "pendiente"
          );
          const reservasAnteriores = reservas.filter(
            (reserva) => reserva.estado !== "pendiente"
          );

          res.render("restaurante/reservas", {
            reservas: reservasPendientes,
            reservasAnteriores: reservasAnteriores,
          });
        }
      );
    }
  );
});
router.get("/restaurante/reservas/aceptar/:id_reserva", (req, res) => {
  const { id_reserva } = req.params;

  conexion.query(
    "SELECT estado FROM reservas WHERE id_reserva = ?",
    [id_reserva],
    (err, results) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .send("Error al obtener el estado de la reserva.");
      }

      if (results.length === 0) {
        return res.status(404).send("Reserva no encontrada.");
      }

      const estado = results[0].estado;
      if (estado === "confirmada" || estado === "cancelada") {
        return res
          .status(400)
          .send("La reserva ya ha sido procesada y no puede modificarse.");
      }

      // Proceder con la aceptación
      conexion.query(
        "UPDATE reservas SET estado = 'confirmada' WHERE id_reserva = ?",
        [id_reserva],
        (err, result) => {
          if (err) {
            console.error(err);
            return res.status(500).send("Error al aceptar la reserva.");
          }

          res.redirect("/restaurante/reservas");
        }
      );
    }
  );
});

router.get("/restaurante/reservas/rechazar/:id_reserva", (req, res) => {
  const { id_reserva } = req.params;
  conexion.query(
    "UPDATE reservas SET estado = 0 WHERE id_reserva = ?",
    [id_reserva],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error al aceptar la reserva.");
      }

      res.redirect("/restaurante/reservas");
    }
  );
});
//Gestion de platos
router.get("/restaurante/platos", isAuthenticated, async (req, res) => {
  if (!req.session || !req.session.user) {
    return res
      .status(400)
      .send("Usuario no autenticado o ID de usuario no válido");
  }

  // Acceder al id_usuario de la sesión
  const idUsuario = req.session.user.id;
  console.log("ID de usuario:", idUsuario);

  conexion.query(
    "SELECT u.id_usuario, r.id_restaurante, p.id_plato, p.nombre AS nombre_plato, p.descripcion AS descripcion_plato, p.precio, p.visible FROM usuarios u JOIN restaurantes r ON u.id_usuario = r.id_usuario JOIN platos p ON r.id_restaurante = p.id_restaurante WHERE u.id_usuario = ?",
    [idUsuario],
    (error, results) => {
      if (error) {
        console.error("Error en la consulta:", error);
        return res.status(500).send("Error al obtener los platos");
      }

      if (!Array.isArray(results) || results.length === 0) {
        return res.render("restaurante/platos", { platos: [] });
      }

      console.log("Platos:", results);
      res.render("restaurante/platos", { platos: results });
    }
  );
});
//Editar platos
router.post("/restaurante/platos/edit/:id_plato", (req, res) => {
  const { id_plato } = req.params;
  const { nombre, descripcion, precio } = req.body;

  // Lógica para actualizar el plato en la base de datos
  conexion.query(
    "UPDATE platos SET nombre = ?, descripcion = ?, precio = ? WHERE id_plato = ?",
    [nombre, descripcion, precio, id_plato],
    (err, result) => {
      if (err) {
        console.error("Error al actualizar el plato:", err);
        return res.status(500).send("Error al actualizar el plato");
      }

      // Verifica si la consulta afectó alguna fila (esto significa que el plato fue actualizado)
      if (result.affectedRows > 0) {
        console.log(
          `Plato ${id_plato} actualizado: Nombre: ${nombre}, Descripción: ${descripcion}, Precio: ${precio}`
        );
        // Asegúrate de redirigir una sola vez
        return res.redirect("/restaurante/platos"); // Redirige después de actualizar correctamente
      } else {
        // Si no se actualizó nada, informa al usuario
        console.log(`No se encontró el plato con ID ${id_plato}`);
        return res.status(404).send("Plato no encontrado");
      }
    }
  );
});
//Mostar plato en la web
router.post("/restaurante/platos/visibility/:id", (req, res) => {
  const platoId = req.params.id;
  const { visible } = req.body;

  const query = "UPDATE platos SET visible = ? WHERE id_plato = ?";

  conexion.query(query, [visible ? 1 : 0, platoId], (err, result) => {
    if (err) {
      console.error("Error al actualizar visibilidad:", err);
      return res
        .status(500)
        .json({ success: false, message: "Error al actualizar visibilidad" });
    }

    if (result.affectedRows > 0) {
      res.json({
        success: true,
        message: "Estado actualizado correctamente",
      });
    } else {
      res.status(404).json({ success: false, message: "Plato no encontrado" });
    }
  });
});
//Añadir plato al menu
router.post("/restaurante/platos/add", (req, res) => {
  const { nombre, descripcion, precio } = req.body;
  const userId = req.session.user?.id;
  if (!userId) {
    return res.status(401).send("No estás autenticado.");
  }

  const queryRestaurante = `SELECT id_restaurante FROM restaurantes WHERE id_usuario = ?`;

  conexion.query(queryRestaurante, [userId], (err, results) => {
    if (err) {
      return res.status(500).send("Error en la base de datos");
    }

    const idRestaurante = results[0].id_restaurante;
    const query =
      "INSERT INTO platos( nombre, descripcion, precio, id_restaurante, visible) VALUES (?,?,?,?,0)";
    conexion.query(
      query,
      [nombre, descripcion, precio, idRestaurante],
      (err, result) => {
        if (err) {
          console.error("Error al insertar el plato:", err);
          return res.json({ success: false });
        }

        res.redirect("/restaurante/platos");
      }
    );
  });
});
router.get("/restaurante/perfil", isAuthenticated, (req, res) => {
  const userId = req.session.user?.id;

  const queryRestaurante = `
    SELECT id_restaurante, nombre, descripcion, direccion, telefono, estado 
    FROM restaurantes 
    WHERE id_usuario = ?
  `;

  const queryHorarios = `
    SELECT id_horario, dias_semana, hora_inicio, hora_fin 
    FROM horarios_restaurantes 
    WHERE id_restaurante = ?
  `;

  conexion.query(queryRestaurante, [userId], (err, restauranteResults) => {
    if (err) {
      console.error("Error al obtener el perfil del restaurante:", err);
      return res.status(500).send("Error al cargar el perfil del restaurante.");
    }

    if (restauranteResults.length === 0) {
      return res.status(404).send("Restaurante no encontrado.");
    }

    const idRestaurante = restauranteResults[0].id_restaurante;

    conexion.query(queryHorarios, [idRestaurante], (err, horariosResults) => {
      if (err) {
        console.error("Error al obtener los horarios del restaurante:", err);
        return res
          .status(500)
          .send("Error al cargar los horarios del restaurante.");
      }

      res.render("restaurante/perfil", {
        user: restauranteResults[0],
        horarios: horariosResults,
      });
    });
  });
});

router.post("/restaurante/perfil", isAuthenticated, (req, res) => {
  const userId = req.session.user?.id;
  const { nombre, descripcion, direccion, telefono } = req.body;

  const query = `
    UPDATE restaurantes
    SET nombre = ?, descripcion = ?, direccion = ?, telefono = ?
    WHERE id_usuario = ?
  `;
  conexion.query(
    query,
    [nombre, descripcion, direccion, telefono, userId],
    (err) => {
      if (err) {
        console.error("Error al actualizar el perfil:", err);
        return res.status(500).send("Error al actualizar el perfil.");
      }

      res.redirect("/restaurante/perfil");
    }
  );
});
router.post(
  "/restaurante/editar-horario",
  isAuthenticated,
  async (req, res) => {
    const { id_horario, dias_semana, hora_inicio, hora_fin } = req.body;

    console.log("Datos recibidos en el servidor:", {
      id_horario,
      dias_semana,
      hora_inicio,
      hora_fin,
    });

    try {
      const query = `
      UPDATE horarios_restaurantes
      SET dias_semana = ?, hora_inicio = ?, hora_fin = ?
      WHERE id_horario = ?
    `;
      generarFranjas();

      await conexion.query(query, [
        dias_semana,
        hora_inicio,
        hora_fin,
        id_horario,
      ]);

      res.redirect("/restaurante/perfil");
    } catch (err) {
      console.error("Error al actualizar el horario:", err);
      res.status(500).send("Error al actualizar el horario");
    }
  }
);

const verificarRestaurante = (req, res, next) => {
  const userId = req.session.user?.id;

  const query = `SELECT id_restaurante FROM restaurantes WHERE id_usuario = ?`;

  conexion.query(query, [userId], (err, results) => {
    if (err) {
      return res.status(500).send("Error en la base de datos");
    }

    if (results.length > 0 && results[0].id_restaurante) {
      return res.redirect("restaurante/dashboard");
    } else {
      return res.redirect("restaurante/crear");
    }
  });
};

router.post("/iniciarsesion-usuario", (req, res) => {
  const { email, contrasena } = req.body;

  const query =
    "SELECT * FROM usuarios WHERE email = ? AND (rol = 'usuario' OR rol = 'admin')";

  conexion.query(query, [email], (error, results) => {
    if (error) {
      console.error("Error en la consulta:", error);
      return res.status(500).send("Error en el servidor");
    }

    if (results.length === 0) {
      return res
        .status(401)
        .send("Correo electrónico o contraseña incorrectos");
    }

    const user = results[0];

    bcrypt.compare(contrasena, user.contrasena, (err, isMatch) => {
      if (err) {
        console.error("Error al comparar contraseñas:", err);
        return res.status(500).send("Error en el servidor");
      }

      if (isMatch) {
        req.session.user = {
          id: user.id_usuario,
          nombre: user.nombre,
          telefono: user.telefono,
          email: user.email,
        };

        console.log("Usuario autenticado:", {
          email: user.email,
        });

        if (user.email === "admin@admin.com") {
          res.redirect("/admin/dashboard");
        } else {
          res.redirect("/restaurantes");
        }
      } else {
        return res
          .status(401)
          .send("Correo electrónico o contraseña incorrectos");
      }
    });
  });
});

//Rutas para la recuperacion de contraseña
router.get("/resetar-password", (req, res) => {
  const { token } = req.query;

  const query =
    "SELECT * FROM usuarios WHERE resetToken = ? AND resetTokenExpires > ?";
  conexion.query(query, [token, Date.now()], (error, results) => {
    if (error) {
      console.error("Error en la consulta:", error);
      return res.status(500).send("Error en el servidor");
    }

    if (results.length === 0) {
      return res.status(400).send("Token inválido o expirado");
    }

    res.render("resetar-password", { token });
  });
});

router.post("/recuperar-password", (req, res) => {
  const { email } = req.body;
  const query = "SELECT * FROM usuarios WHERE email = ?";

  conexion.query(query, [email], (error, results) => {
    if (error) {
      console.error("Error en la consulta:", error);
      return res.status(500).send("Error en el servidor");
    }

    if (results.length === 0) {
      return res.status(404).send("Correo electrónico no registrado");
    }

    const user = results[0];
    const token = crypto.randomBytes(20).toString("hex");
    const expiry = Date.now() + 3600000; // 1 hora

    const updateQuery =
      "UPDATE usuarios SET resetToken = ?, resetTokenExpires = ? WHERE email = ?";
    conexion.query(updateQuery, [token, expiry, email], (error) => {
      if (error) {
        console.error("Error al actualizar el token:", error);
        return res.status(500).send("Error al procesar la solicitud");
      }

      const resetLink = `http://${req.headers.host}/resetar-password?token=${token}`;

      transporter.sendMail(
        {
          to: email,
          from: "tu_email@gmail.com",
          subject: "Recuperación de Contraseña",
          text: "Haz clic en el siguiente enlace para recuperar tu contraseña: ${resetLink}",
        },
        (err) => {
          if (err) {
            console.error("Error al enviar el correo:", err);
            return res.status(500).send("Error al enviar el correo");
          }

          res.send("Enlace de recuperación enviado al correo electrónico");
        }
      );
    });
  });
});

router.get("/acceso-denegado", (req, res) => {
  res.status(403).render("acceso-denegado");
});

router.use("/admin", isAdmin);

router.get("/admin/dashboard", (req, res) => {
  res.render("admin/dashboard");
});

router.get("/admin/adminRest", (req, res) => {
  conexion.query(
    "SELECT * FROM restaurantes WHERE estado = 'pendiente'",
    (error, solicitudesPendientes) => {
      if (error) {
        console.error("Error en la consulta:", error);
        return res.status(500).send("Error en la consulta");
      }
      console.log(solicitudesPendientes);

      conexion.query(
        "SELECT * FROM restaurantes WHERE estado = 'aceptado'",
        (error, restaurantesAceptados) => {
          if (error) {
            console.error("Error en la consulta:", error);
            return res.status(500).send("Error en la consulta");
          }

          // Ahora pasamos los datos a la vista correctamente
          res.render("admin/adminRest", {
            solicitudes: solicitudesPendientes,
            restaurantes: restaurantesAceptados,
          });
        }
      );
    }
  );
});

router.get("/admin/restaurantes/aceptar/:id", (req, res) => {
  const restauranteId = req.params.id;

  const queryActualizarRestaurante =
    "UPDATE restaurantes SET estado = ? WHERE id_restaurante = ?";
  conexion.query(
    queryActualizarRestaurante,
    ["aceptado", restauranteId],
    (err, result) => {
      if (err) {
        console.error("Error al aceptar restaurante:", err);
        return res.status(500).send("Error al procesar la solicitud");
      }
      if (result.affectedRows === 0) {
        console.log(
          "No se actualizó ningún restaurante, es posible que el ID no sea válido."
        );
        return res.status(404).send("Restaurante no encontrado");
      }
      res.redirect("/admin/adminRest");
    }
  );
});

router.get("/admin/restaurantes/rechazar/:id", (req, res) => {
  const restauranteId = req.params.id;

  const queryActualizarRestaurante =
    "UPDATE restaurantes SET estado = ? WHERE id_restaurante = ?";

  conexion.query(
    queryActualizarRestaurante,
    ["rechazado", restauranteId],
    (err, result) => {
      if (err) {
        console.error("Error al rechazar restaurante:", err);
        return res.status(500).send("Error al procesar la solicitud");
      }

      // Si no se actualizó ninguna fila, significa que el ID no existe
      if (result.affectedRows === 0) {
        console.log("No se encontró el restaurante con ese ID.");
        return res.status(404).send("Restaurante no encontrado");
      }

      console.log("Restaurante rechazado correctamente");
      res.redirect("/admin/adminRest"); // Redirige a la página de administración
    }
  );
});

router.get("/admin/adminUser", isAdmin, (req, res) => {
  conexion.query(
    "SELECT * FROM usuarios WHERE rol = 'usuario'",
    (error, results) => {
      if (error) {
        console.error("Error en la consulta:", error); // Agrega esta línea para ver errores
        return res.status(500).send("Error de base de datos");
      }
      console.log("Resultados de usuarios:", results); // Verifica qué resultados se obtienen
      res.render("admin/adminUser", { usuarios: results });
    }
  );
});

router.post("/admin/adminUser/eliminarUsuario/:id", (req, res) => {
  const usuarioId = req.params.id;

  const queryEliminarUsuario = "DELETE FROM `usuarios` WHERE id_usuario = ?";

  conexion.query(queryEliminarUsuario, [usuarioId], (err, result) => {
    if (err) {
      console.error("Error al eliminar el usuario:", err);
      return res.status(500).send("Error al procesar la solicitud");
    }

    if (result.affectedRows === 0) {
      console.log("No se encontró el usuario con ese ID.");
      return res.status(404).send("Usuario no encontrado");
    }

    console.log("Usuario eliminado correctamente");
    res.redirect("/admin/adminUser");
  });
});

router.get("/user/perfil", isAuthenticated, (req, res) => {
  res.render("user/perfil", {
    user: req.user,
    message: null,
  });
});

router.post("/user/perfil", isAuthenticated, (req, res) => {
  const { nombre, apellido, telefono, contrasena, confirmar_contrasena } =
    req.body;
  const userId = req.user.id_usuario;

  if (contrasena && contrasena !== confirmar_contrasena) {
    return res.render("user/perfil", {
      user: req.user,
      message: { type: "danger", text: "Las contraseñas no coinciden" },
    });
  }

  const updateUserQuery =
    "UPDATE usuarios SET nombre = ?, apellido = ?, telefono = ? WHERE id_usuario = ?";
  const params = [nombre, apellido, telefono, userId];

  if (contrasena) {
    bcrypt.hash(contrasena, saltRounds, (err, hashedPassword) => {
      if (err) {
        console.error("Error al encriptar la contraseña:", err);
        return res.render("user/perfil", {
          user: req.user,
          message: {
            type: "danger",
            text: "Error en el servidor al encriptar la contraseña",
          },
        });
      }

      const updateUserWithPasswordQuery =
        "UPDATE usuarios SET nombre = ?, apellido = ?, telefono = ?, contrasena = ? WHERE id_usuario = ?";
      const paramsWithPassword = [
        nombre,
        apellido,
        telefono,
        hashedPassword,
        userId,
      ];

      conexion.query(
        updateUserWithPasswordQuery,
        paramsWithPassword,
        (error) => {
          if (error) {
            console.error("Error al actualizar el usuario:", error);
            return res.render("user/perfil", {
              user: req.user,
              message: {
                type: "danger",
                text: "Error en el servidor al actualizar el usuario",
              },
            });
          }

          return res.render("user/perfil", {
            user: { ...req.user, nombre, apellido, telefono },
            message: { type: "success", text: "Perfil actualizado con éxito" },
          });
        }
      );
    });
  } else {
    conexion.query(updateUserQuery, params, (error) => {
      if (error) {
        console.error("Error al actualizar el usuario:", error);
        return res.render("user/perfil", {
          user: req.user,
          message: {
            type: "danger",
            text: "Error en el servidor al actualizar el usuario",
          },
        });
      }

      return res.render("user/perfil", {
        user: { ...req.user, nombre, apellido, telefono },
        message: { type: "success", text: "Perfil actualizado con éxito" },
      });
    });
  }
});

router.get("/user/mis-pedidos", isAuthenticated, (req, res) => {
  const userId = req.session.user?.id;
  console.log("Ejecutando consulta con id_usuario:", userId);

  const query = `
    SELECT 
        r.id_reserva, 
        res.nombre AS nombre_restaurante, 
        r.fecha, 
        r.hora, 
        r.estado, 
        r.total AS precio_total
    FROM reservas r
    JOIN restaurantes res ON r.id_restaurante = res.id_restaurante
    WHERE r.id_usuario = ?
    ORDER BY r.fecha DESC, r.hora ASC
  `;

  conexion.query(query, [userId], (error, results) => {
    if (error) {
      console.error("Error en la consulta:", error);
      return res.status(500).send("Error en el servidor");
    }
    console.log(results); // Para verificar si las reservas contienen datos

    res.render("user/mis-pedidos", { reservas: results });
  });
});
router.get("/vistaRest", (req, res) => {
  const id_restaurante = req.query.id_restaurante;
  const fechaSeleccionada =
    req.query.fecha || new Date().toISOString().split("T")[0]; // Fecha actual en formato YYYY-MM-DD

  const horaSeleccionada = req.query.hora ? req.query.hora : null;

  const restauranteQuery =
    "SELECT * FROM restaurantes WHERE id_restaurante = ?";
  const platosQuery =
    "SELECT * FROM platos WHERE id_restaurante = ? AND visible = TRUE";
  const horariosQuery = `
  SELECT fh.franja_inicio, fh.disponibilidad 
  FROM franjas_horarias fh 
  JOIN horarios_restaurantes hr ON fh.id_horario = hr.id_horario 
  WHERE hr.id_restaurante = ? AND fh.fecha = ?
  `;

  conexion.query(
    horariosQuery,
    [id_restaurante, fechaSeleccionada],
    (error, horariosResults) => {
      if (error) {
        console.error("Error en la consulta de horarios:", error);
        return res.status(500).send("Error en la consulta");
      }

      if (horariosResults.length === 0) {
        console.log("No hay franjas horarias para la fecha, generando...");
        generarFranjas(id_restaurante, fechaSeleccionada, () => {
          conexion.query(
            restauranteQuery,
            [id_restaurante],
            (err, restauranteResult) => {
              if (err) {
                console.error("Error al obtener el restaurante:", err);
                return res.status(500).send("Error al obtener el restaurante");
              }

              conexion.query(
                platosQuery,
                [id_restaurante],
                (err, platosResults) => {
                  if (err) {
                    console.error("Error al obtener los platos:", err);
                    return res.status(500).send("Error al obtener los platos");
                  }

                  res.render("vistaRest", {
                    restaurant: restauranteResult[0],
                    platos: platosResults,
                    horarios: horariosResults,
                    fecha: fechaSeleccionada,
                    id_restaurante: id_restaurante,
                  });
                }
              );
            }
          );
        });
      } else {
        console.log("Franjas horarias encontradas, mostrando...");
        conexion.query(
          restauranteQuery,
          [id_restaurante],
          (err, restauranteResult) => {
            if (err) {
              console.error("Error al obtener el restaurante:", err);
              return res.status(500).send("Error al obtener el restaurante");
            }

            conexion.query(
              platosQuery,
              [id_restaurante],
              (err, platosResults) => {
                if (err) {
                  console.error("Error al obtener los platos:", err);
                  return res.status(500).send("Error al obtener los platos");
                }

                res.render("vistaRest", {
                  restaurant: restauranteResult[0],
                  platos: platosResults,
                  horarios: horariosResults,
                  fecha: fechaSeleccionada,
                  id_restaurante: id_restaurante,
                });
              }
            );
          }
        );
      }
    }
  );
});

router.post("/actualizarFecha", (req, res) => {
  const { fecha, id_restaurante } = req.body; // Obtenemos la fecha e id del restaurante

  console.log("Fecha recibida:", fecha);
  console.log("ID Restaurante:", id_restaurante);

  // Query para obtener los horarios disponibles para la fecha seleccionada
  const horariosQuery = `
    SELECT fh.franja_inicio, fh.disponibilidad 
    FROM franjas_horarias fh 
    JOIN horarios_restaurantes hr ON fh.id_horario = hr.id_horario 
    WHERE hr.id_restaurante = ? AND fh.fecha = ?
  `;

  conexion.query(
    horariosQuery,
    [id_restaurante, fecha],
    (error, horariosResults) => {
      if (error) {
        console.error("Error en la consulta de horarios:", error);
        return res.status(500).send("Error en la consulta");
      }

      if (horariosResults.length === 0) {
        console.log("No hay franjas horarias para la fecha, generando...");

        // Si no existen franjas horarias, generamos los horarios
        generarFranjas(id_restaurante, fecha, () => {
          // Después de generar las franjas horarias, volvemos a consultar los horarios generados
          conexion.query(
            horariosQuery,
            [id_restaurante, fecha],
            (err, horariosResults) => {
              if (err) {
                console.error("Error al obtener los horarios generados:", err);
                return res
                  .status(500)
                  .send("Error al obtener los horarios generados");
              }

              return res.json(horariosResults); // Devolvemos los horarios generados
            }
          );
        });
      } else {
        console.log("Franjas horarias encontradas, enviando...");
        return res.json(horariosResults); // Devolvemos los horarios encontrados
      }
    }
  );
});

function generarFranjas(id_restaurante, fecha, callback) {
  const query = "SELECT * FROM horarios_restaurantes WHERE id_restaurante = ?";

  conexion.query(query, [id_restaurante], (error, resultados) => {
    if (error) {
      console.error("Error al obtener los horarios:", error);
      return callback();
    }

    const intervaloMinutos = 15;
    resultados.forEach((horario) => {
      const { id_horario, hora_inicio, hora_fin, dias_semana } = horario;

      const horaInicio = new Date(`1970-01-01T${hora_inicio}Z`);
      const horaFin = new Date(`1970-01-01T${hora_fin}Z`);

      const diaSemana = new Date(fecha).getDay();
      const diasApertura = dias_semana.split(",").map(Number);

      if (!diasApertura.includes(diaSemana)) return;

      let franjaInicio = new Date(horaInicio);
      while (franjaInicio < horaFin) {
        const franjaFin = new Date(
          franjaInicio.getTime() + intervaloMinutos * 60000
        );

        const queryInsert = `INSERT INTO franjas_horarias (id_horario, franja_inicio, franja_fin, fecha, disponibilidad) 
                             VALUES (?, ?, ?, ?, 1)`;

        conexion.query(
          queryInsert,
          [
            id_horario,
            franjaInicio.toISOString().substring(11, 16),
            franjaFin.toISOString().substring(11, 16),
            fecha,
          ],
          (err) => {
            if (err) console.error("Error al insertar la franja horaria:", err);
          }
        );

        franjaInicio = franjaFin;
      }
    });
    callback();
  });
}

router.get("/resumenReserva", (req, res) => {
  console.log(
    "PayPal Client ID desde router.js:",
    process.env.PAYPAL_CLIENT_ID
  );
  console.log("restaurante id:", id_restaurante);
  res.render("resumenReserva", {
    paypalClientId: process.env.PAYPAL_CLIENT_ID,
    id_restaurante: req.query.restaurant,
    fecha: req.query.fecha,
    hora: req.query.hora,
    platos: JSON.parse(req.query.platos || "[]"),
    total: parseFloat(req.query.total).toFixed(2),
  });
});

router.post("/reservar", isAuthenticated, (req, res) => {
  const { fecha, hora, id_restaurante, platosSeleccionados } = req.body;
  console.log(req.body);
  console.log("Fecha recibida:", fecha);
  console.log("Hora recibida:", hora);

  if (!hora) {
    return res.status(400).send("La hora es obligatoria.");
  }

  const usuario = req.session.user;
  const id_usuario = usuario.id;
  const telefono_cliente = usuario.telefono;

  if (!id_restaurante || !fecha || !hora || !id_usuario || !telefono_cliente) {
    return res
      .status(400)
      .send("Faltan datos necesarios para realizar la reserva");
  }

  const platosArray = [];
  platosSeleccionados.forEach((plato, index) => {
    if (plato !== "0") {
      platosArray.push({ id_plato: index + 1, cantidad: parseInt(plato, 10) });
    }
  });

  console.log("Platos seleccionados:", platosArray);

  let id_restauranteFinal = id_restaurante;
  if (Array.isArray(id_restauranteFinal)) {
    id_restauranteFinal = id_restauranteFinal[0];
  }

  const fechaFormateada = new Date(fecha).toISOString().split("T")[0];
  const hora24 = moment(hora, "h:mm A").format("HH:mm:ss");

  const reservaExistenteQuery = `
    SELECT id_reserva 
    FROM reservas 
    WHERE id_usuario = ? 
      AND id_restaurante = ? 
      AND fecha = ? 
      AND hora = ? 
      AND estado != 'cancelada'
  `;

  conexion.query(
    reservaExistenteQuery,
    [id_usuario, id_restauranteFinal, fechaFormateada, hora24],
    (error, results) => {
      if (error) {
        console.error("Error en la consulta de reservas existentes:", error);
        return res.status(500).send("Error al verificar la reserva");
      }

      if (results.length > 0) {
        return res.status(400).send("Horario no disponible");
      }

      const queryRestaurante = `
        SELECT nombre 
        FROM restaurantes
        WHERE id_restaurante = ?
      `;
      conexion.query(
        queryRestaurante,
        [id_restauranteFinal],
        (errRest, resultsRest) => {
          if (errRest) {
            console.error(
              "Error al obtener el nombre del restaurante:",
              errRest
            );
            return res
              .status(500)
              .send("Error al obtener el nombre del restaurante");
          }

          if (resultsRest.length === 0) {
            return res.status(404).send("Restaurante no encontrado");
          }

          const nombreRestaurante = resultsRest[0].nombre;

          calcularPrecioTotal(
            platosArray,
            (errCalc, platosConNombre, total) => {
              if (errCalc) {
                console.error("Error al calcular el total:", errCalc);
                return res.status(500).send("Error al calcular el total");
              }

              res.render("resumenReserva", {
                paypalClientId: process.env.PAYPAL_CLIENT_ID,
                id_restaurante: id_restauranteFinal,
                fecha: fechaFormateada,
                hora: hora24,
                restaurant: nombreRestaurante,
                platos: platosConNombre,
                total: total,
                hora24: hora24, // Incluir hora24 aquí
                fechaFormateada: fechaFormateada,
              });
            }
          );
        }
      );
    }
  );
});

function calcularPrecioTotal(platosArray, callback) {
  let total = 0;
  let platosConNombre = [];

  platosArray.forEach((plato) => {
    const query = `SELECT nombre, precio FROM platos WHERE id_plato = ?`;

    conexion.query(query, [plato.id_plato], (err, results) => {
      if (err) {
        console.error("Error al obtener los datos del plato:", err);
        return callback(err);
      }

      if (results.length > 0) {
        const platoDetails = results[0];
        total += platoDetails.precio * plato.cantidad;

        platosConNombre.push({
          cantidad: plato.cantidad,
          nombre: platoDetails.nombre,
          precio: platoDetails.precio,
        });
      }

      if (platosConNombre.length === platosArray.length) {
        callback(null, platosConNombre, total.toFixed(2));
      }
    });
  });
}
router.post("/capture-order", async (req, res) => {
  const {
    orderID,
    fecha,
    hora,
    platos,
    total,
    id_restaurante,
    hora24,
    fechaFormateada,
  } = req.body;
  const userId = req.session.user.id;

  const request = new paypal.orders.OrdersCaptureRequest(orderID);
  request.requestBody({});

  try {
    const response = await paypalClient.execute(request);

    if (response.result.status === "COMPLETED") {
      const reserva = {
        id_usuario: userId,
        id_restaurante: id_restaurante, // Usar id_restaurante directamente
        fecha: fecha,
        hora: hora,
        estado: "pendiente", // La reserva queda pendiente hasta confirmación
        total: total,
        id_pago: orderID, // ID de pago de PayPal
      };

      // CORRECCIÓN: Ejecutar la consulta sin desestructurar el resultado
      await conexion.query("INSERT INTO reservas SET ?", reserva);
      const actualizarDisponibilidadQuery = `
        UPDATE franjas_horarias 
        SET disponibilidad = 0 
        WHERE id_horario = (
          SELECT id_horario FROM horarios_restaurantes 
          WHERE id_restaurante = ? 
        ) AND franja_inicio = ? AND fecha = ?;
      `;

      conexion.query(
        actualizarDisponibilidadQuery,
        [id_restaurante, hora24, fechaFormateada], // Usar hora24 y fechaFormateada
        (errUpdate) => {
          if (errUpdate) {
            console.error("Error al actualizar la disponibilidad:", errUpdate);
            return res.status(500).send("Error al actualizar disponibilidad");
          }
          console.log("Disponibilidad actualizada correctamente");
        }
      );

      return res.json({
        success: true,
        message:
          "Pago realizado con éxito. Reserva pendiente de confirmación del restaurante.",
        details: response.result,
      });
    } else {
      res.status(400).json({ message: "Error en el pago" });
    }
  } catch (error) {
    console.error("Error al capturar el pago:", error);
    res.status(500).json({ message: "Error interno en el servidor" });
  }
});

router.get("/logout", (req, res) => {
  res.clearCookie("token");
  req.session.destroy(() => {
    res.redirect("/");
  });
  console.log("Usuario logout");
});

module.exports = router;
