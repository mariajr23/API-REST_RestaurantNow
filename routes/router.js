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
router.get("/restaurante/reservas", (req, res) => {
  res.render("restaurante/reservas");
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
    "SELECT u.id_usuario, r.id_restaurante, p.id_plato, p.nombre AS nombre_plato, p.descripcion AS descripcion_plato, p.precio FROM usuarios u JOIN restaurantes r ON u.id_usuario = r.id_usuario JOIN platos p ON r.id_restaurante = p.id_restaurante WHERE u.id_usuario = ?",
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
router.post("/restaurante/platos/delete/:id_plato", (req, res) => {
  const { id_plato } = req.params;

  conexion.query(
    "UPDATE platos SET visible = FALSE WHERE id_plato = ?",
    [id_plato],
    (err, result) => {
      if (err) {
        console.error("Error al eliminar el plato:", err);
        return res.status(500).send("Error al eliminar el plato");
      }

      if (result.affectedRows > 0) {
        console.log(`Plato ${id_plato} eliminado`);
        return res.redirect("/restaurante/platos");
      } else {
        console.log(`No se encontró el plato con ID ${id_plato}`);
        return res.status(404).send("Plato no encontrado");
      }
    }
  );
});
router.post("/restaurante/platos/toggle/:id", (req, res) => {
  const platoId = req.params.id;
  const visible = req.body.visible;

  // Actualizar en la base de datos
  const query = "UPDATE platos SET visible = ? WHERE id_plato = ?";
  conexion.query(query, [visible, platoId], (err, result) => {
    if (err) {
      console.error(err);
      return res.json({ success: false });
    }
    res.json({ success: true });
  });
});

router.get("/restaurante/perfil", (req, res) => {
  res.render("restaurante/perfil");
});
// Middleware para verificar si el usuario tiene un restaurante asociado
const verificarRestaurante = (req, res, next) => {
  // Suponiendo que req.user tiene la información del usuario autenticado
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

  //Poner cuando se crean los horarios en la pagina de dashboard restaurantes
  // generarFranjas();
  const franjasQuery = `
    SELECT fh.franja_inicio, fh.franja_fin, fh.disponibilidad
    FROM franjas_horarias fh
    JOIN horarios_restaurantes hr ON fh.id_horario = hr.id_horario
    WHERE hr.id_restaurante = ?
    AND fh.disponibilidad = 1
    AND FIND_IN_SET(DAYOFWEEK(?), hr.dias_semana)
  `;

  // Consulta los datos del restaurante
  conexion.query(
    restauranteQuery,
    [id_restaurante],
    (error, restauranteResults) => {
      if (error) {
        console.error("Error en la consulta de restaurantes:", error);
        return res.status(500).send("Error en la consulta");
      }

      // Consulta los platos del restaurante
      conexion.query(platosQuery, [id_restaurante], (error, platosResults) => {
        if (error) {
          console.error("Error en la consulta de platos:", error);
          return res.status(500).send("Error en la consulta");
        }

        // Consulta las franjas horarias disponibles
        conexion.query(
          franjasQuery,
          [id_restaurante, fechaSeleccionada],
          (error, franjasResults) => {
            if (error) {
              console.error("Error en la consulta de franjas horarias:", error);
              return res.status(500).send("Error en la consulta");
            }

            // Formatear las franjas horarias si es necesario
            franjasResults = franjasResults.map((franja) => {
              const [horaInicioH, horaInicioM] =
                franja.franja_inicio.split(":");
              const [horaFinH, horaFinM] = franja.franja_fin.split(":");
              const horaInicio12h = `${horaInicioH % 12 || 12}:${horaInicioM} ${
                horaInicioH >= 12 ? "PM" : "AM"
              }`;
              const horaFin12h = `${horaFinH % 12 || 12}:${horaFinM} ${
                horaFinH >= 12 ? "PM" : "AM"
              }`;

              return {
                ...franja,
                franja_inicio: horaInicio12h,
                franja_fin: horaFin12h,
              };
            });

            // Renderiza la vista con los datos
            res.render("vistaRest", {
              id_restaurante: id_restaurante,
              fecha: fechaSeleccionada,
              platos: platosResults,
              restaurants: restauranteResults,
              franjas: franjasResults,
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

      // Verificar si ya existen franjas para este horario
      const queryCheck = `
        SELECT COUNT(*) AS total_franjas
        FROM franjas_horarias
        WHERE id_horario = ?
      `;
      conexion.query(queryCheck, [id_horario], (err, results) => {
        if (err) {
          console.error("Error al verificar franjas existentes:", err);
          return;
        }

        if (results[0].total_franjas > 0) {
          console.log(
            `Las franjas ya existen para el horario ${id_horario}. No se generarán duplicados.`
          );
          return;
        }

        // Generar franjas si no existen
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

          // Avanzar al siguiente intervalo
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

router.post("/reservar", (req, res) => {
  const { fecha, hora, id_restaurante, platosSeleccionados } = req.body;

  console.log("Datos recibidos:", req.body);

  if (!hora) {
    return res.status(400).send("La hora es obligatoria.");
  }
  const usuario = req.session.user;
  const nombre_cliente = usuario.nombre; // Obtener nombre del usuario
  const telefono_cliente = usuario.telefono; // Obtener teléfono del usuario

  console.log("Datos recibidos:", {
    id_restaurante,
    fecha,
    hora,
    nombre_cliente,
    telefono_cliente,
    platosSeleccionados,
  });

  if (
    !id_restaurante ||
    !fecha ||
    !hora ||
    !nombre_cliente ||
    !telefono_cliente ||
    !platosSeleccionados
  ) {
    return res
      .status(400)
      .send("Faltan datos necesarios para realizar la reserva");
  }

  const platosArray = Array.isArray(platosSeleccionados)
    ? platosSeleccionados
    : [platosSeleccionados];

  const reservaExistenteQuery = `SELECT id_reserva FROM reservas WHERE id_restaurante = ? AND fecha = ? AND hora = ?`;
  conexion.query(
    reservaExistenteQuery,
    [id_restaurante, fecha, hora],
    (error, results) => {
      if (error) {
        console.error("Error en la consulta:", error);
        return res.status(500).send("Error en la consulta");
      }

      if (results.length > 0) {
        return res.status(400).send("Horario no disponible");
      }

      const reservaQuery = `INSERT INTO reservas (id_restaurante, fecha, hora, nombre_cliente, telefono_cliente) VALUES (?, ?, ?, ?, ?)`;

      conexion.query(
        reservaQuery,
        [id_restaurante, fecha, hora, nombre_cliente, telefono_cliente],
        (error, result) => {
          if (error) {
            console.error("Error al insertar la reserva:", error);
            return res.status(500).send("Error al insertar la reserva");
          }

          const id_reserva = result.insertId;

          const platosPromises = platosArray.map((id_plato) => {
            const reservaPlatoQuery = `INSERT INTO detalles_reservas (id_reserva, id_plato) VALUES (?, ?)`;
            return new Promise((resolve, reject) => {
              conexion.query(
                reservaPlatoQuery,
                [id_reserva, id_plato],
                (error) => {
                  if (error) return reject(error);
                  resolve();
                }
              );
            });
          });

          Promise.all(platosPromises)
            .then(() => {
              res.redirect("/vistaRest?id_restaurante=" + id_restaurante);
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
