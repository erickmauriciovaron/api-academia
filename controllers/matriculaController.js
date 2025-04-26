const { Matricula, Estudiante, Curso } = require('../models');

// Crear una matrícula
exports.crearMatricula = async (req, res) => {
  try {
    const { estudianteId, cursoId } = req.body;

    const matricula = await Matricula.create({
      estudianteId,
      cursoId,
      fecha_matricula: new Date() // Fecha automática al momento de crear
    });

    res.status(201).json(matricula);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Obtener todas las matrículas, incluyendo datos de estudiante y curso
exports.obtenerMatriculas = async (req, res) => {
  try {
    const matriculas = await Matricula.findAll({
      include: [Estudiante, Curso]
    });
    res.json(matriculas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Obtener todos los cursos en los que está inscrito un estudiante
exports.obtenerCursosDeEstudiante = async (req, res) => {
  try {
    const estudiante = await Estudiante.findByPk(req.params.id, {
      include: Curso
    });
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }
    res.json(estudiante.Cursos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Obtener todos los estudiantes inscritos en un curso
exports.obtenerEstudiantesDeCurso = async (req, res) => {
  try {
    const curso = await Curso.findByPk(req.params.id, {
      include: Estudiante
    });
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }
    res.json(curso.Estudiantes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
