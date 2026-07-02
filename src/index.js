require('dotenv').config();

const path = require('path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');

const swaggerSpec = require('./config/swagger.config');
const parameterRoutes = require('./routes/parameter.routes');
const refRoutes = require('./routes/ref.routes');
const tokenRoutes = require('./routes/token.routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Ipekyol Costing DB API Docs'
}));

// Bu uygulamaya erişim PLM widget'ı üzerinden sağlanacağı için ayrı bir
// kullanıcı girişi/oturum katmanı bulunmuyor (bkz. proje notları).
app.use('/api', parameterRoutes);
app.use('/api', refRoutes);
app.use('/api', tokenRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Ipekyol Costing DB sunucusu çalışıyor: http://localhost:${PORT}`);
});

module.exports = app;
