const { conexion } = require("../database/bd");

function crearUsuario(usuario) {
  return new Promise((resolve, reject) => {
    const { nombre, email, contrasena, telefono, rol } = usuario;
    const sql =
      "INSERT INTO usuarios (nombre, email, contrasena, telefono, rol) VALUES (?, ?, ?, ?, ?)";

    conexion.query(
      sql,
      [nombre, email, contrasena, telefono, rol],
      (err, result) => {
        if (err) {
          return reject(err); // Rechaza la promesa en caso de error
        }
        resolve({ id_usuario: result.insertId, ...usuario }); // Devuelve el usuario con el ID
      }
    );
  });
}

function obtenerUsuarios(query, callback) {
  const sql = "SELECT * FROM usuarios WHERE email LIKE ?";
  conexion.query(sql, [`%${query}%`], callback);
}

function obtenerUsuarioPorId(id, callback) {
  const sql = "SELECT * FROM usuarios WHERE id_usuario = ?";
  conexion.query(sql, [id], callback);
}

// Asegúrate de exportar todo correctamente
module.exports = {
  crearUsuario,
  obtenerUsuarios,
  obtenerUsuarioPorId,
};
