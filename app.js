const express = require('express');
const sequelize = require('./config/database');
const { Curso, Estudiante, Matricula } = require('./models');
const cursoRoutes = require('./routes/cursoRoutes');
const estudianteRoutes = require('./routes/estudianteRoutes');
const matriculaRoutes = require('./routes/matriculaRoutes'); 


const app = express(); 

// Middleware para entender JSON
app.use(express.json());

// Usar rutas
app.use('/api/cursos', cursoRoutes);
app.use('/api/estudiantes', estudianteRoutes);
app.use('/api/matriculas', matriculaRoutes); 


// Ruta de prueba
app.get('/', (req, res) => {
  res.send('API funcionando correctamente 🚀');
});

// Sincronizar la base de datos y levantar servidor
const PORT = process.env.PORT || 3000;

sequelize.sync({ force: false })
  .then(() => {
    console.log('Conexión a la base de datos exitosa');
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Error al conectar a la base de datos:', error);
  });
