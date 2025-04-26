const express = require('express');
const router = express.Router();
const cursoController = require('../controllers/cursoController');

// Ruta para crear un curso
router.post('/', cursoController.crearCurso);

// Ruta para obtener todos los cursos
router.get('/', cursoController.obtenerCursos);

// Ruta para obtener un curso por id
router.get('/:id', cursoController.obtenerCurso);

// Ruta para actualizar un curso
router.put('/:id', cursoController.actualizarCurso);

// Ruta para eliminar un curso
router.delete('/:id', cursoController.eliminarCurso);

module.exports = router;
