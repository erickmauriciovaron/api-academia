const { Curso } = require('../models');

// Crear un curso
exports.crearCurso = async (req, res) => {
  try {
    const curso = await Curso.create(req.body);
    res.status(201).json(curso);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Obtener todos los cursos
exports.obtenerCursos = async (req, res) => {
  try {
    const cursos = await Curso.findAll();
    res.json(cursos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Obtener un curso por ID
exports.obtenerCurso = async (req, res) => {
  try {
    const curso = await Curso.findByPk(req.params.id);
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }
    res.json(curso);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Actualizar un curso
exports.actualizarCurso = async (req, res) => {
  try {
    const curso = await Curso.findByPk(req.params.id);
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }
    await curso.update(req.body);
    res.json(curso);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Eliminar un curso
exports.eliminarCurso = async (req, res) => {
  try {
    const curso = await Curso.findByPk(req.params.id);
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }
    await curso.destroy();
    res.json({ mensaje: 'Curso eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
