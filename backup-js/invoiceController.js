const { body, param, validationResult } = require('express-validator');
const sigoService = require('../services/sigoService');

const validateInvoice = [
  body('serie').notEmpty().withMessage('Serie es requerida'),
  body('numero').isInt({ min: 1 }).withMessage('Número debe ser un entero positivo'),
  body('fechaEmision').isISO8601().withMessage('Fecha de emisión debe ser válida'),
  body('cliente.ruc').isLength({ min: 11, max: 11 }).withMessage('RUC del cliente debe tener 11 dígitos'),
  body('cliente.razonSocial').notEmpty().withMessage('Razón social del cliente es requerida'),
  body('items').isArray({ min: 1 }).withMessage('Debe incluir al menos un item'),
  body('items.*.descripcion').notEmpty().withMessage('Descripción del item es requerida'),
  body('items.*.cantidad').isFloat({ min: 0 }).withMessage('Cantidad debe ser mayor a 0'),
  body('items.*.precioUnitario').isFloat({ min: 0 }).withMessage('Precio unitario debe ser mayor a 0'),
  body('totales.total').isFloat({ min: 0 }).withMessage('Total debe ser mayor a 0')
];

const validateInvoiceParams = [
  param('serie').notEmpty().withMessage('Serie es requerida'),
  param('numero').isInt({ min: 1 }).withMessage('Número debe ser un entero positivo')
];

const validateStatus = [
  body('estado').isIn(['PENDIENTE', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO'])
    .withMessage('Estado debe ser válido')
];

const createInvoice = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array()
      });
    }

    const invoiceData = req.body;
    const result = await sigoService.createInvoice(invoiceData);
    
    res.status(201).json({
      success: true,
      message: 'Factura creada exitosamente',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getInvoice = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Parámetros inválidos',
        details: errors.array()
      });
    }

    const { serie, numero } = req.params;
    const result = await sigoService.getInvoice(serie, numero);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const updateInvoiceStatus = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array()
      });
    }

    const { serie, numero } = req.params;
    const { estado } = req.body;
    const result = await sigoService.updateInvoiceStatus(serie, numero, estado);
    
    res.json({
      success: true,
      message: 'Estado de factura actualizado exitosamente',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const sendInvoiceToSunat = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Parámetros inválidos',
        details: errors.array()
      });
    }

    const { serie, numero } = req.params;
    const result = await sigoService.sendInvoiceToSunat(serie, numero);
    
    res.json({
      success: true,
      message: 'Factura enviada a SUNAT exitosamente',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const cancelInvoice = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array()
      });
    }

    const { serie, numero } = req.params;
    const { motivo } = req.body;
    const result = await sigoService.cancelInvoice(serie, numero, motivo);
    
    res.json({
      success: true,
      message: 'Factura anulada exitosamente',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getInvoiceStatus = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Parámetros inválidos',
        details: errors.array()
      });
    }

    const { serie, numero } = req.params;
    const result = await sigoService.getInvoiceStatus(serie, numero);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createInvoice,
  getInvoice,
  updateInvoiceStatus,
  sendInvoiceToSunat,
  cancelInvoice,
  getInvoiceStatus,
  validateInvoice,
  validateInvoiceParams,
  validateStatus
};