require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const clientRoutes = require('./routes/clientRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Demasiadas solicitudes desde esta IP'
});

app.use(helmet());
app.use(cors());
app.use(limiter);
app.use(express.json());

app.use('/api/clients', clientRoutes);
app.use('/api/invoices', invoiceRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'API SIGO funcionando correctamente' });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

module.exports = app;