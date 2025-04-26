const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('api_academia', 'root', '', {
  host: 'localhost',
  dialect: 'mysql'
});

module.exports = sequelize;
