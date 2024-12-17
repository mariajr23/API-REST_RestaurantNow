const express = require('express');
const app = express();
const mysql = require('mysql');

const conexion = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'restaurantnow'
});


conexion.connect((error)=>{
  if (error){

    console.error('Error de conexión: '+error);
    return

  }
  else{
    console.log('\nConexión correcta:\n' +
    '==========================================',
    '\n-> Name connection: ' + conexion.config.host + ' -> at Port: ' + conexion.config.port +
    '\n-> DBA user: ' + conexion.config.user +
    '\n-> database:' + conexion.config.database +
    '\n==========================================');
  }
});


function buscarRestaurantes(query, callback) {
  const sql = 'SELECT * FROM restaurantes WHERE nombre LIKE ?';
  conexion.query(sql, [`%${query}%`], callback);
}



module.exports = { conexion, buscarRestaurantes };