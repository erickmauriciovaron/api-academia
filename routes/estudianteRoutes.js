const express = require('express');
const router = express.Router();
const estudianteController = require('../controllers/estudianteController');

// Ruta para crear un estudiante
router.post('/', estudianteController.crearEstudiante);

// Ruta para obtener todos los estudiantes
router.get('/', estudianteController.obtenerEstudiantes);

// Ruta para obtener un estudiante por id
router.get('/:id', estudianteController.obtenerEstudiante);

// Ruta para actualizar un estudiante
router.put('/:id', estudianteController.actualizarEstudiante);

// Ruta para eliminar un estudiante
router.delete('/:id', estudianteController.eliminarEstudiante);

module.exports = router;
