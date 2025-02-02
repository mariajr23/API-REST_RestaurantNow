const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const saltRounds = 10;
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { conexion, buscarRestaurantes } = require("../database/bd");
const { isAuthenticated, isAdmin } = require("../middleware/auth");
const { User } = require("../models/User");

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

  // Obtener el id_restaurante asociado al usuario
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

      // Obtener todas las reservas asociadas al restaurante, incluyendo las aceptadas y rechazadas
      conexion.query(
        "SELECT * FROM reservas WHERE id_restaurante = ? ORDER BY fecha ASC, hora ASC",
        [restauranteId],
        (err, reservas) => {
          if (err) {
            console.error(err);
            return res.status(500).send("Error al obtener reservas.");
          }

          const reservasPendientes = reservas.filter(
            (reserva) => reserva.estado === 1
          );
          const reservasAnteriores = reservas.filter(
            (reserva) => reserva.estado !== 1
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
    "UPDATE reservas SET estado = 2 WHERE id_reserva = ?",
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
  const userId = req.user?.id_usuario || req.query.id_usuario;

  const query = `
    SELECT r.id_reserva, res.nombre AS nombre_restaurante, r.fecha, r.hora, r.estado, SUM(p.precio) AS precio_total
    FROM reservas r
    JOIN restaurantes res ON r.id_restaurante = res.id_restaurante
    LEFT JOIN detalles_reservas dr ON r.id_reserva = dr.id_reserva
    LEFT JOIN platos p ON dr.id_plato = p.id_plato
    WHERE r.id_usuario = ?
    GROUP BY r.id_reserva, res.nombre, r.fecha, r.hora, r.estado
  `;

  conexion.query(query, [userId], (error, results) => {
    if (error) {
      console.error("Error en la consulta:", error);
      return res.status(500).send("Error en el servidor");
    }

    res.render("user/mis-pedidos", { reservas: results });
  });
});

router.get("/vistaRest", (req, res) => {
  const id_restaurante = req.query.id_restaurante;
  const fechaSeleccionada =
    req.query.fecha || new Date().toISOString().split("T")[0];

  console.log("ID Restaurante:", id_restaurante);
  console.log("Fecha Seleccionada:", fechaSeleccionada);

  const restauranteQuery =
    "SELECT * FROM restaurantes WHERE id_restaurante = ?";
  const platosQuery =
    "SELECT * FROM platos WHERE id_restaurante = ? AND visible = TRUE";
  const horariosQuery = `
    SELECT fh.franja_inicio, fh.disponibilidad
    FROM franjas_horarias fh
    JOIN horarios_restaurantes hr ON fh.id_horario = hr.id_horario
    WHERE hr.id_restaurante = ?`;

  // Consulta de datos del restaurante
  conexion.query(
    restauranteQuery,
    [id_restaurante],
    (error, restauranteResults) => {
      if (error) {
        console.error("Error en la consulta de restaurantes:", error);
        return res.status(500).send("Error en la consulta");
      }

      // Consulta de platos
      conexion.query(platosQuery, [id_restaurante], (error, platosResults) => {
        if (error) {
          console.error("Error en la consulta de platos:", error);
          return res.status(500).send("Error en la consulta");
        }

        // Consulta de horarios
        conexion.query(
          horariosQuery,
          [id_restaurante],
          (error, horariosResults) => {
            if (error) {
              console.error("Error en la consulta de horarios:", error);
              return res.status(500).send("Error en la consulta");
            }

            // Conversión de horarios a formato 12h
            const horariosConvertidos = horariosResults.map((horario) => {
              const [horaInicioH, horaInicioM] = horario.franja_inicio
                .split(":")
                .map(Number);

              const horaInicio12h = `${horaInicioH % 12 || 12}:${horaInicioM
                .toString()
                .padStart(2, "0")} ${horaInicioH >= 12 ? "PM" : "AM"}`;

              return {
                ...horario,
                franja_inicio: horaInicio12h,
              };
            });

            // Renderizado de la vista con los datos obtenidos
            res.render("vistaRest", {
              id_restaurante: id_restaurante,
              fecha: fechaSeleccionada,
              platos: platosResults,
              restaurants: restauranteResults,
              horarios: horariosConvertidos,
            });
          }
        );
      });
    }
  );
});

function generarFranjas(intervaloMinutos = 15) {
  const query = "SELECT * FROM horarios_restaurantes";

  conexion.query(query, (error, resultados) => {
    if (error) {
      console.error("Error al obtener los horarios:", error);
      return;
    }

    resultados.forEach((horario) => {
      const { id_horario, hora_inicio, hora_fin } = horario;

      const horaInicio = new Date(`1970-01-01T${hora_inicio}Z`);
      const horaFin = new Date(`1970-01-01T${hora_fin}Z`);

      const queryDelete = `
        DELETE FROM franjas_horarias
        WHERE id_horario = ?
      `;
      conexion.query(queryDelete, [id_horario], (err) => {
        if (err) {
          console.error("Error al eliminar franjas existentes:", err);
          return;
        }

        console.log(`Franjas eliminadas para el horario ${id_horario}.`);

        let franjaInicio = horaInicio;
        while (franjaInicio < horaFin) {
          const franjaFin = new Date(
            franjaInicio.getTime() + intervaloMinutos * 60000
          );

          const queryInsert = `
            INSERT INTO franjas_horarias (id_horario, franja_inicio, franja_fin, disponibilidad)
            VALUES (?, ?, ?, 1)
          `;
          conexion.query(
            queryInsert,
            [
              id_horario,
              franjaInicio.toISOString().substring(11, 16),
              franjaFin.toISOString().substring(11, 16),
            ],
            (err, result) => {
              if (err) {
                console.error("Error al insertar la franja horaria:", err);
              } else {
                console.log(
                  `Franja horaria insertada: ${franjaInicio
                    .toISOString()
                    .substring(11, 16)} - ${franjaFin
                    .toISOString()
                    .substring(11, 16)}`
                );
              }
            }
          );

          franjaInicio = franjaFin;
        }
      });
    });
  });
}

router.post("/checkout", (req, res) => {
  const { platosSeleccionados, fecha, hora, id_restaurante } = req.body;

  const id_usuario = req.session.userId;

  const platos = getPlatosByIds(platosSeleccionados); // Implementar función que busque los platos por ID
  const precioTotal = platos.reduce((total, plato) => total + plato.precio, 0);

  res.render("resumenFactura", {
    platos,
    fecha,
    hora,
    precioTotal,
    metodoPago: "paypal",
    restaurante: getRestauranteById(id_restaurante),
  });
});
const moment = require("moment");

router.post("/reservar", isAuthenticated, (req, res) => {
  // Destructuramos los datos enviados desde el formulario
  const { fecha, hora, platosSeleccionados, id_restaurante } = req.body;

  // Validación básica de la hora
  if (!hora) {
    return res.status(400).send("La hora es obligatoria.");
  }

  const usuario = req.session.user;
  const id_usuario = usuario.id;
  const telefono_cliente = usuario.telefono;

  // Verificación de que todos los campos necesarios estén presentes
  if (
    !id_restaurante ||
    !fecha ||
    !hora ||
    !id_usuario ||
    !telefono_cliente ||
    !platosSeleccionados
  ) {
    return res
      .status(400)
      .send("Faltan datos necesarios para realizar la reserva");
  }

  // Asegurarse de que platosSeleccionados sea un array
  const platosArray = Array.isArray(platosSeleccionados)
    ? platosSeleccionados
    : [platosSeleccionados];

  // Obtener un valor único para id_restaurante en caso de venir como array
  let id_restauranteFinal = id_restaurante;
  if (Array.isArray(id_restauranteFinal)) {
    id_restauranteFinal = id_restauranteFinal[0];
  }

  // Formatear la fecha (YYYY-MM-DD)
  const fechaFormateada = new Date(fecha).toISOString().split("T")[0];

  // Convertir la hora al formato 24 horas (HH:mm:ss) utilizando Moment.js
  const hora24 = moment(hora, "h:mm A").format("HH:mm:ss");

  console.log("Verificación de parámetros:");
  console.log("id_usuario:", id_usuario);
  console.log("id_restauranteFinal:", id_restauranteFinal);
  console.log("fechaFormateada:", fechaFormateada);
  console.log("hora (24 horas):", hora24);

  // Consulta para verificar si ya existe una reserva en ese horario
  const reservaExistenteQuery = `
    SELECT id_reserva 
    FROM reservas 
    WHERE id_usuario = ? 
      AND id_restaurante = ? 
      AND fecha = ? 
      AND hora = ? 
      AND estado != 'cancelada'
  `;

  // Verificar si ya existe una reserva en la misma hora para ese usuario
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

      // Si no hay reservas, insertamos la nueva reserva
      const reservaQuery = `
        INSERT INTO reservas (id_usuario, id_restaurante, fecha, hora, estado, id_pago)
        VALUES (?, ?, ?, ?, 'pendiente', NULL)
      `;

      conexion.query(
        reservaQuery,
        [id_usuario, id_restauranteFinal, fechaFormateada, hora24],
        (error, result) => {
          if (error) {
            console.error("Error al insertar la reserva:", error);
            return res.status(500).send("Error al insertar la reserva");
          }

          const id_reserva = result.insertId;

          // Consulta para obtener los platos seleccionados (por id_plato)
          const platosQuery = `SELECT id_plato, nombre FROM platos WHERE id_plato IN (?)`;

          conexion.query(platosQuery, [platosArray], (error, platos) => {
            if (error) {
              console.error("Error al obtener los platos:", error);
              return res.status(500).send("Error al obtener los platos");
            }

            // Insertar los platos seleccionados en la tabla reserva_platos
            const platosPromises = platos.map((plato) => {
              return new Promise((resolve, reject) => {
                const reservaPlatoQuery = `
                  INSERT INTO reserva_platos (id_reserva, id_plato)
                  VALUES (?, ?)
                `;
                conexion.query(
                  reservaPlatoQuery,
                  [id_reserva, plato.id_plato],
                  (error) => {
                    if (error) return reject(error);
                    resolve();
                  }
                );
              });
            });

            // Después de insertar todos los platos, actualizamos la disponibilidad del horario
            Promise.all(platosPromises)
              .then(() => {
                const actualizarHorarioQuery = `
                  UPDATE franjas_horarias fh
                  JOIN horarios_restaurantes hr ON fh.id_horario = hr.id_horario
                  SET fh.disponibilidad = 0
                  WHERE hr.id_restaurante = ? 
                    AND fh.franja_inicio = ?
                `;

                conexion.query(
                  actualizarHorarioQuery,
                  [id_restauranteFinal, hora24],
                  (error, result) => {
                    if (error) {
                      console.error(
                        "Error al actualizar disponibilidad del horario:",
                        error
                      );
                      return res
                        .status(500)
                        .send("Error al actualizar disponibilidad del horario");
                    }

                    console.log(
                      "Filas afectadas en UPDATE:",
                      result.affectedRows
                    );
                    if (result.affectedRows === 0) {
                      return res
                        .status(400)
                        .send(
                          "No se encontró la franja horaria para actualizar"
                        );
                    }

                    // Redirigir a la vista del restaurante
                    res.redirect(
                      "/vistaRest?id_restaurante=" + id_restauranteFinal
                    );
                  }
                );
              })
              .catch((error) => {
                console.error(
                  "Error al insertar los platos de la reserva:",
                  error
                );
                res
                  .status(500)
                  .send("Error al insertar los platos de la reserva");
              });
          });
        }
      );
    }
  );
});

router.get("/logout", (req, res) => {
  res.clearCookie("token");
  req.session.destroy(() => {
    res.redirect("/");
  });
  console.log("Usuario logout");
});

module.exports = router;
