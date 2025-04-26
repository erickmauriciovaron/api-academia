const Curso = require('./Curso');
const Estudiante = require('./Estudiante');
const Matricula = require('./Matricula');

// Relaciones
Estudiante.belongsToMany(Curso, { through: Matricula, foreignKey: 'estudianteId' });
Curso.belongsToMany(Estudiante, { through: Matricula, foreignKey: 'cursoId' });

module.exports = {
  Curso,
  Estudiante,
  Matricula
};
