const { conexion } = require("../database/bd");

function crearRestaurante(restaurante, callback) {
  const { nombre_restaurante, direccion, telefono, email, usuario_id } =
    restaurante;
  const sql =
    "INSERT INTO restaurantes (nombre_restaurante, direccion, telefono, email, usuario_id) VALUES (?, ?, ?, ?, ?)";
  conexion.query(
    sql,
    [nombre_restaurante, direccion, telefono, email, usuario_id],
    callback
  );
}

function actualizarRestaurante(id_usuario, id_restaurante, callback) {
  const sql = "UPDATE usuarios SET restaurante_id = ? WHERE id_usuario = ?";
  conexion.query(sql, [id_restaurante, id_usuario], callback);
}
module.exports = { crearRestaurante, actualizarRestaurante };
