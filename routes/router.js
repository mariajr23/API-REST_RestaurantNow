const express = require("express");
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const saltRounds = 10;
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { conexion, buscarRestaurantes } = require('../database/bd');
const { isAdmin } = require('../middleware/auth');

//Configuracion nodemailer
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: 'mjimenez19@alu.ucam.edu',
    pass: 'Maria230100='
  }
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
  const query = 'SELECT * FROM restaurantes';
  
  conexion.query(query, (error, results) => {
    if (error) {
      console.error('Error en la consulta:', error);
      return res.status(500).send('Error en el servidor');
    }
    
    res.render('restaurantes', { restaurants: results });
  });
});

router.get('/buscar-restaurantes', (req, res) => {
  const query = req.query.query || '';
  buscarRestaurantes(query, (error, results) => {
    if (error) {
      console.error('Error al buscar restaurantes:', error);
      return res.status(500).send('Error al buscar restaurantes');
    }
    res.render('restaurantes', { restaurants: results });
  });
});

router.get("/login", (req, res) => {
  res.render("login");
});

router.get("/registro", (req, res) => {
  res.render("registro");
});

router.post("/registrar", (req, res) => {
  const { nombre, apellido, email, contrasena, contrasenaConfirmar, telefono } = req.body;

  if (contrasena !== contrasenaConfirmar) {
    return res.status(400).send('Las contraseñas no coinciden');
  }

  bcrypt.hash(contrasena, saltRounds, (err, hashedPassword) => {
    if (err) {
      console.error('Error al encriptar la contraseña:', err);
      return res.status(500).send('Error al registrar el usuario');
    }

    const query = 'INSERT INTO usuarios (nombre, apellido, email, contrasena, telefono) VALUES (?, ?, ?, ?, ?)';

    conexion.query(query, [nombre, apellido, email, hashedPassword, telefono], (error) => {
      if (error) {
        console.error('Error al insertar el usuario:', error);
        return res.status(500).send('Error al registrar el usuario');
      }

      res.redirect('/login'); // Redirige al usuario a la página de inicio de sesión
    });
  });
});

router.post('/registrar-restaurante', async (req, res) => {
  const { nombreRestaurante, emailRestaurante, telefonoRestaurante, direccionRestaurante } = req.body;

  // Validación de los datos
  if (!nombreRestaurante || !emailRestaurante || !telefonoRestaurante || !direccionRestaurante) {
      return res.status(400).send("Todos los campos son obligatorios.");
  }

  try {
      const query = `
          INSERT INTO restaurantes (nombre_restaurante, email_restaurante, telefono_restaurante, direccion_restaurante, estado)
          VALUES (?, ?, ?, ?, 'pendiente')
      `;
      await conexion.query(query, [nombreRestaurante, emailRestaurante, telefonoRestaurante, direccionRestaurante]);

      // Respuesta exitosa
      res.redirect('/'); // Redirige a una página de confirmación o inicio
  } catch (error) {
      console.error("Error al registrar el restaurante:", error);
      res.status(500).send("Hubo un error al procesar la solicitud.");
  }
});


router.post("/iniciarsesion-usuario", (req, res) => {
  const { email, contrasena } = req.body;

  const query = 'SELECT * FROM usuarios WHERE email = ?';

  conexion.query(query, [email], (error, results) => {
    if (error) {
      console.error('Error en la consulta:', error);
      return res.status(500).send('Error en el servidor');
    }

    if (results.length === 0) {
      return res.status(401).send('Correo electrónico o contraseña incorrectos');
    }

    const user = results[0];

    bcrypt.compare(contrasena, user.contrasena, (err, isMatch) => {
      if (err) {
        console.error('Error al comparar contraseñas:', err);
        return res.status(500).send('Error en el servidor');
      }

      if (isMatch) {
        // Generar el token
        const token = jwt.sign(
          { id: user.id_usuario, nombre: user.nombre, email: user.email },
          'tu_clave_secreta',
          { expiresIn: '1h' }
        );

        // Guardar el token en una cookie
        res.cookie('token', token, { httpOnly: true });

        // Guardar el usuario en la sesión
        req.session.user = {
          id: user.id_usuario,
          nombre: user.nombre,
          telefono: user.telefono, // Asegúrate de incluir el teléfono
          email: user.email
        };

        // Mostrar el email y el token en la consola
        console.log('Usuario autenticado:', {
          email: user.email,
          token: token
        });

        if (user.email === "admin@admin") {
          // Redirigir al dashboard del administrador
          res.redirect('/admin/dashboard');
        } else {
          // Redirigir al perfil de usuario
          res.redirect('/user/perfil');
        }
      } else {
        return res.status(401).send('Correo electrónico o contraseña incorrectos');
      }
    });
  });
});


//Rutas para la recuperacion de contraseña
router.get("/resetar-password", (req, res) => {
  const { token } = req.query;

  const query = 'SELECT * FROM usuarios WHERE resetToken = ? AND resetTokenExpires > ?';
  conexion.query(query, [token, Date.now()], (error, results) => {
    if (error) {
      console.error('Error en la consulta:', error);
      return res.status(500).send('Error en el servidor');
    }

    if (results.length === 0) {
      return res.status(400).send('Token inválido o expirado');
    }

    res.render("resetar-password", { token });
  });
});

router.post("/recuperar-password", (req, res) => {
  const { email } = req.body;
  const query = 'SELECT * FROM usuarios WHERE email = ?';

  conexion.query(query, [email], (error, results) => {
    if (error) {
      console.error('Error en la consulta:', error);
      return res.status(500).send('Error en el servidor');
    }

    if (results.length === 0) {
      return res.status(404).send('Correo electrónico no registrado');
    }

    const user = results[0];
    const token = crypto.randomBytes(20).toString('hex');
    const expiry = Date.now() + 3600000; // 1 hora

    const updateQuery = 'UPDATE usuarios SET resetToken = ?, resetTokenExpires = ? WHERE email = ?';
    conexion.query(updateQuery, [token, expiry, email], (error) => {
      if (error) {
        console.error('Error al actualizar el token:', error);
        return res.status(500).send('Error al procesar la solicitud');
      }

      const resetLink = `http://${req.headers.host}/resetar-password?token=${token}`;

      transporter.sendMail({
        to: email,
        from: 'tu_email@gmail.com',
        subject: 'Recuperación de Contraseña',
        text: 'Haz clic en el siguiente enlace para recuperar tu contraseña: ${resetLink}'
      }, (err) => {
        if (err) {
          console.error('Error al enviar el correo:', err);
          return res.status(500).send('Error al enviar el correo');
        }

        res.send('Enlace de recuperación enviado al correo electrónico');
      });
    });
  });
});

// Middleware para proteger rutas privadas y verificar rol de admin
const isAuthenticated = (req, res, next) => {
  if (!req.user) {
    return res.status(403).render('acceso-denegado'); // Renderiza la vista de acceso denegado
  }

  // Verificar si el usuario es admin
  if (req.user.email !== 'admin@admin') {
    return res.status(403).render('acceso-denegado'); // Renderiza la vista de acceso denegado
  }

  next();
};

router.get("/acceso-denegado", (req, res) => {
  res.status(403).render("acceso-denegado");
});

// Rutas de administración protegidas
router.use('/admin', isAuthenticated);

router.get("/admin/dashboard", isAdmin, (req, res) => {
  res.render("admin/dashboard");
});

router.get('/admin/adminRest', isAdmin, (req, res) => {
  conexion.query("SELECT * FROM restaurantes WHERE estado = 'pendiente'", (error, solicitudesPendientes) => {
    if (error) {
      console.error('Error en la consulta:', error);
      return res.status(500).send('Error en la consulta');
    }
    console.log(solicitudesPendientes);

    conexion.query("SELECT * FROM restaurantes WHERE estado = 'aceptado'", (error, restaurantesAceptados) => {
      if (error) {
        console.error('Error en la consulta:', error);
        return res.status(500).send('Error en la consulta');
      }

      // Ahora pasamos los datos a la vista correctamente
      res.render('admin/adminRest', { 
        solicitudes: solicitudesPendientes, 
        restaurantes: restaurantesAceptados 
      });
    });
  });
});


router.get('/admin/restaurantes/aceptar/:id', (req, res) => {
  const restauranteId = req.params.id;
  
  const queryActualizarRestaurante = 'UPDATE restaurantes SET estado = ? WHERE id_restaurante = ?';
  conexion.query(queryActualizarRestaurante, ['aceptado', restauranteId], (err, result) => {
    if (err) {
      console.error('Error al aceptar restaurante:', err);
      return res.status(500).send('Error al procesar la solicitud');
    }
    if (result.affectedRows === 0) {
      console.log('No se actualizó ningún restaurante, es posible que el ID no sea válido.');
      return res.status(404).send('Restaurante no encontrado');
    }
    res.redirect('/admin/adminRest');
  });
});

router.get('/admin/restaurantes/rechazar/:id', (req, res) => {
  const restauranteId = req.params.id;

  const queryActualizarRestaurante = 'UPDATE restaurantes SET estado = ? WHERE id_restaurante = ?';
  
  conexion.query(queryActualizarRestaurante, ['rechazado', restauranteId], (err, result) => {
    if (err) {
      console.error('Error al rechazar restaurante:', err);
      return res.status(500).send('Error al procesar la solicitud');
    }

    // Si no se actualizó ninguna fila, significa que el ID no existe
    if (result.affectedRows === 0) {
      console.log('No se encontró el restaurante con ese ID.');
      return res.status(404).send('Restaurante no encontrado');
    }

    console.log('Restaurante rechazado correctamente');
    res.redirect('/admin/adminRest');  // Redirige a la página de administración
  });
});


router.get('/admin/adminUser', (req, res) => {
  conexion.query('SELECT * FROM usuarios', (error, results) => {
      if (error) {
          console.error('Error en la consulta:', error); // Agrega esta línea para ver errores
          return res.status(500).send('Error de base de datos');
      }
      console.log('Resultados de usuarios:', results); // Verifica qué resultados se obtienen
      res.render('admin/adminUser', { usuarios: results });
  });
});

router.get('/admin/restaurantes/rechazar/:id', (req, res) => {
  const restauranteId = req.params.id;

  const queryActualizarRestaurante = 'UPDATE restaurantes SET estado = ? WHERE id_restaurante = ?';
  
  conexion.query(queryActualizarRestaurante, ['rechazado', restauranteId], (err, result) => {
    if (err) {
      console.error('Error al rechazar restaurante:', err);
      return res.status(500).send('Error al procesar la solicitud');
    }

    // Si no se actualizó ninguna fila, significa que el ID no existe
    if (result.affectedRows === 0) {
      console.log('No se encontró el restaurante con ese ID.');
      return res.status(404).send('Restaurante no encontrado');
    }

    console.log('Restaurante rechazado correctamente');
    res.redirect('/admin/adminRest');  // Redirige a la página de administración
  });
});


// Rutas protegidas
router.use(isAuthenticated);

router.get("/user/perfil", (req, res) => {
  res.render("user/perfil", {
    user: req.user,
    message: null,
  });
});

router.post("/user/perfil", (req, res) => {
  const {nombre, apellido, telefono, contrasena, confirmar_contrasena } = req.body;
  const userId = req.user.id_usuario;

  if (contrasena && contrasena !== confirmar_contrasena) {
    return res.render('user/perfil', {
      user: req.user,
      message: { type: 'danger', text: 'Las contraseñas no coinciden' }
    });
  }

  const updateUserQuery = 'UPDATE usuarios SET nombre = ?, apellido = ?, telefono = ? WHERE id_usuario = ?';
  const params = [nombre, apellido, telefono, userId];

  if (contrasena) {
    bcrypt.hash(contrasena, saltRounds, (err, hashedPassword) => {
      if (err) {
        console.error('Error al encriptar la contraseña:', err);
        return res.render('user/perfil', {
          user: req.user,
          message: { type: 'danger', text: 'Error en el servidor al encriptar la contraseña' }
        });
      }

      const updateUserWithPasswordQuery = 'UPDATE usuarios SET nombre = ?, apellido = ?, telefono = ?, contrasena = ? WHERE id_usuario = ?';
      const paramsWithPassword = [nombre, apellido, telefono, hashedPassword, userId];

      conexion.query(updateUserWithPasswordQuery, paramsWithPassword, (error) => {
        if (error) {
          console.error('Error al actualizar el usuario:', error);
          return res.render('user/perfil', {
            user: req.user,
            message: { type: 'danger', text: 'Error en el servidor al actualizar el usuario' }
          });
        }

        return res.render('user/perfil', {
          user: { ...req.user, nombre, apellido, telefono }, 
          message: { type: 'success', text: 'Perfil actualizado con éxito' }
        });
      });
    });
  } else {
    conexion.query(updateUserQuery, params, (error) => {
      if (error) {
        console.error('Error al actualizar el usuario:', error);
        return res.render('user/perfil', {
          user: req.user,
          message: { type: 'danger', text: 'Error en el servidor al actualizar el usuario' }
        });
      }

      return res.render('user/perfil', {
        user: { ...req.user, nombre, apellido, telefono },
        message: { type: 'success', text: 'Perfil actualizado con éxito' }
      });
    });
  }
});

router.get("/user/mis-pedidos", (req, res) => {
  const userId = req.user?.id_usuario || req.query.id_usuario; // Usar query param como respaldo

  if (!userId) {
    return res.redirect('/login');
  }

  const query = `SELECT r.id_reserva, res.nombre AS nombre_restaurante, r.fecha, r.hora, r.estado, SUM(p.precio) AS precio_total
  FROM reservas r
  JOIN restaurantes res ON r.id_restaurante = res.id_restaurante
  LEFT JOIN detalles_reservas dr ON r.id_reserva = dr.id_reserva
  LEFT JOIN platos p ON dr.id_plato = p.id_plato
  WHERE r.id_usuario = ?
  GROUP BY r.id_reserva, res.nombre, r.fecha, r.hora, r.estado
`;


conexion.query(query, [userId], (error, results) => {
  if (error) {
    console.error('Error en la consulta:', error);
    return res.status(500).send('Error en el servidor');
  }

  res.render('user/mis-pedidos', { reservas: results });
});
});

router.get("/vistaRest", (req, res) => {
  const id_restaurante = req.query.id_restaurante;

  const restauranteQuery = 'SELECT * FROM restaurantes WHERE id_restaurante = ?';
  const platosQuery = 'SELECT * FROM platos WHERE id_restaurante = ?';
  const horariosQuery = 
    `SELECT h.hora, 
           CASE 
               WHEN r.id_reserva IS NULL THEN 0 
               ELSE 1 
           END AS reservado
    FROM horarios h
    LEFT JOIN reservas r 
    ON h.id_restaurante = r.id_restaurante 
    AND h.hora = r.hora 
    AND r.fecha = ? 
    WHERE h.id_restaurante = ?`
  ;

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

      const fechaSeleccionada = req.query.fecha || new Date().toISOString().split('T')[0];
      const horaSeleccionada = req.query.hora || ''; // Asegúrate de obtener hora también si es necesario

      conexion.query(horariosQuery, [fechaSeleccionada, id_restaurante], (error, horariosResults) => {
        if (error) {
          console.error('Error en la consulta:', error);
          return res.status(500).send('Error en la consulta');
        }

        res.render('vistaRest', {
          id_restaurante: id_restaurante,
          fecha: fechaSeleccionada,
          hora: horaSeleccionada,
          platos: platosResults,
          restaurants: restauranteResults,
          horarios: horariosResults,
        });
      });
    });
  });
});

router.post("/checkout", (req, res) => {
  const { platosSeleccionados, fecha, hora, id_restaurante } = req.body;

  const id_usuario = req.session.userId;
  
  const platos = getPlatosByIds(platosSeleccionados); // Implementar función que busque los platos por ID
  const precioTotal = platos.reduce((total, plato) => total + plato.precio, 0);

  // Guardar la reserva en la base de datos (si es necesario antes del pago)

  // Redirigir al resumen de la factura
  res.render('resumenFactura', {
    platos,
    fecha,
    hora,
    precioTotal,
    metodoPago: "paypal", // Por ahora solo PayPal
    restaurante: getRestauranteById(id_restaurante), // Función para obtener el restaurante
  });
});

router.post("/reservar", (req, res) => {
  const { fecha, hora, id_restaurante, platosSeleccionados } = req.body;

  // Obtener datos del usuario desde la sesión
  const usuario = req.session.user;
  const nombre_cliente = usuario.nombre; // Obtener nombre del usuario
  const telefono_cliente = usuario.telefono; // Obtener teléfono del usuario

  console.log('Datos recibidos:', { id_restaurante, fecha, hora, nombre_cliente, telefono_cliente, platosSeleccionados });

  if (!id_restaurante || !fecha || !hora || !nombre_cliente || !telefono_cliente || !platosSeleccionados) {
    return res.status(400).send('Faltan datos necesarios para realizar la reserva');
  }

  // Asegúrate de que platosSeleccionados es un array
  const platosArray = Array.isArray(platosSeleccionados) ? platosSeleccionados : [platosSeleccionados];

  const reservaExistenteQuery = 
    `SELECT id_reserva 
    FROM reservas 
    WHERE id_restaurante = ? 
    AND fecha = ? 
    AND hora = ?`
  ;

  conexion.query(reservaExistenteQuery, [id_restaurante, fecha, hora], (error, results) => {
    if (error) {
      console.error('Error en la consulta:', error);
      return res.status(500).send('Error en la consulta');
    }

    if (results.length > 0) {
      return res.status(400).send('Horario no disponible');
    }

    const reservaQuery = `INSERT INTO reservas (id_restaurante, fecha, hora, nombre_cliente, telefono_cliente)
                          VALUES (?, ?, ?, ?, ?)`;

    conexion.query(reservaQuery, [id_restaurante, fecha, hora, nombre_cliente, telefono_cliente], (error, result) => {
      if (error) {
        console.error('Error al insertar la reserva:', error);
        return res.status(500).send('Error al insertar la reserva');
      }

      const id_reserva = result.insertId;

      const platosPromises = platosArray.map(id_plato => {
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
          res.redirect('/vistaRest?id_restaurante=' + id_restaurante);
        })
        .catch(error => {
          console.error('Error al insertar los platos de la reserva:', error);
          res.status(500).send('Error al insertar los platos de la reserva');
        });
    });
  });
});

router.get("/logout", (req, res) => {
  res.clearCookie('token'); 
  req.session.destroy(() => {
    res.redirect('/');
  });
  console.log('Usuario logout');
});

module.exports = router;