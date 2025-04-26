const { Estudiante } = require('../models');

// Crear un estudiante
exports.crearEstudiante = async (req, res) => {
  try {
    const estudiante = await Estudiante.create(req.body);
    res.status(201).json(estudiante);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Obtener todos los estudiantes
exports.obtenerEstudiantes = async (req, res) => {
  try {
    const estudiantes = await Estudiante.findAll();
    res.json(estudiantes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Obtener un estudiante por ID
exports.obtenerEstudiante = async (req, res) => {
  try {
    const estudiante = await Estudiante.findByPk(req.params.id);
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }
    res.json(estudiante);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Actualizar un estudiante
exports.actualizarEstudiante = async (req, res) => {
  try {
    const estudiante = await Estudiante.findByPk(req.params.id);
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }
    await estudiante.update(req.body);
    res.json(estudiante);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Eliminar un estudiante
exports.eliminarEstudiante = async (req, res) => {
  try {
    const estudiante = await Estudiante.findByPk(req.params.id);
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }
    await estudiante.destroy();
    res.json({ mensaje: 'Estudiante eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
