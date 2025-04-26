const express = require('express');
const router = express.Router();
const matriculaController = require('../controllers/matriculaController');

// Crear una matrícula
router.post('/', matriculaController.crearMatricula);

// Obtener todas las matrículas
router.get('/', matriculaController.obtenerMatriculas);

// Obtener cursos de un estudiante
router.get('/estudiante/:id', matriculaController.obtenerCursosDeEstudiante);

// Obtener estudiantes de un curso
router.get('/curso/:id', matriculaController.obtenerEstudiantesDeCurso);

module.exports = router;
