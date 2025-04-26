const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Matricula = sequelize.define('Matricula', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  fecha_matricula: {
    type: DataTypes.DATEONLY,
    allowNull: false
  }
}, {
  tableName: 'matriculas',
  timestamps: false
});

module.exports = Matricula;
