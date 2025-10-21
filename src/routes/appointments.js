// routes/appointments.js
const { Router } = require('express');
const { AppointmentsController } = require('../controllers/appointments');

const router = Router();
const appointmentsController = new AppointmentsController();

// Appointment management routes
router.get('/', appointmentsController.getAppointments);
router.post('/', appointmentsController.createAppointment);
router.get('/:id', appointmentsController.getAppointmentById);
router.put('/:id', appointmentsController.updateAppointment);
router.delete('/:id', appointmentsController.deleteAppointment);
router.patch('/:id/cancel', appointmentsController.cancelAppointment);
router.get('/user/:userId', appointmentsController.getUserAppointments);

module.exports = router;