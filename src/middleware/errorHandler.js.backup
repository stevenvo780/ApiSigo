const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  if (err.response && err.response.data) {
    return res.status(err.response.status || 500).json({
      error: 'Error en SIGO API',
      message: err.response.data.message || err.message,
      details: err.response.data
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Error de validación',
      message: err.message
    });
  }

  res.status(500).json({
    error: 'Error interno del servidor',
    message: err.message
  });
};

module.exports = errorHandler;