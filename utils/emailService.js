require("dotenv").config();
const nodemailer = require("nodemailer");

// Configurar el transporte de Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Envía un correo electrónico.
 * @param {string} to - Dirección de correo del destinatario.
 * @param {string} subject - Asunto del correo.
 * @param {string} html - Contenido HTML del correo.
 */
async function sendEmail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: `"Tu App" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`Correo enviado a ${to}`);
  } catch (error) {
    console.error(`Error al enviar el correo: ${error}`);
  }
}

/**
 * Enviar correo de recuperación de contraseña.
 */

async function sendPasswordResetEmail(email, token) {
  const resetLink = `http://localhost:3000/resetar-password?token=${token}`;
  const html = `<p>Para restablecer tu contraseña, haz clic en el siguiente enlace:</p>
                  <a href="${resetLink}">${resetLink}</a>
                  <p>Si no solicitaste este cambio, ignora este correo.</p>`;
  await sendEmail(email, "Recuperación de contraseña", html);
}

/**
 * Enviar correo de confirmación de nueva cuenta.
 */
async function sendAccountCreationEmail(email, name) {
  const html = `<p>Hola ${name},</p>
                 <p>Tu cuenta ha sido creada exitosamente. ¡Bienvenido!</p>`;
  await sendEmail(email, "Cuenta creada", html);
}

/**
 * Enviar correo cuando el administrador confirma o rechaza un restaurante.
 */
async function sendRestaurantApprovalEmail(email, name, approved) {
  const status = approved ? "aprobado" : "rechazado";
  const html = `<p>Hola ${name},</p>
                 <p>Tu solicitud para registrar tu restaurante ha sido <strong>${status}</strong>.</p>`;
  await sendEmail(email, `Registro de restaurante ${status}`, html);
}

/**
 * Enviar correo cuando el restaurante confirma o rechaza una reserva.
 */
async function sendReservationStatusEmail(email, name, confirmed) {
  const status = confirmed ? "confirmada" : "rechazada";
  const html = `<p>Hola ${name},</p>
                 <p>Tu reserva ha sido <strong>${status}</strong> por el restaurante.</p>`;
  await sendEmail(email, `Reserva ${status}`, html);
}

module.exports = {
  sendPasswordResetEmail,
  sendAccountCreationEmail,
  sendRestaurantApprovalEmail,
  sendReservationStatusEmail,
};
