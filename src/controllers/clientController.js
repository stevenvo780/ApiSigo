const { body, param, validationResult } = require('express-validator');
const sigoService = require('../services/sigoService');

const validateClient = [
  body('razonSocial').notEmpty().withMessage('Razón social es requerida'),
  body('ruc').isLength({ min: 11, max: 11 }).withMessage('RUC debe tener 11 dígitos'),
  body('direccion').notEmpty().withMessage('Dirección es requerida'),
  body('email').isEmail().withMessage('Email debe ser válido'),
  body('telefono').optional().isMobilePhone('es-PE').withMessage('Teléfono debe ser válido')
];

const validateRuc = [
  param('ruc').isLength({ min: 11, max: 11 }).withMessage('RUC debe tener 11 dígitos')
];

const createClient = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array()
      });
    }

    const clientData = req.body;
    const result = await sigoService.createClient(clientData);
    
    res.status(201).json({
      success: true,
      message: 'Cliente creado exitosamente',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getClient = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'RUC inválido',
        details: errors.array()
      });
    }

    const { ruc } = req.params;
    const result = await sigoService.getClient(ruc);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const updateClient = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array()
      });
    }

    const { ruc } = req.params;
    const clientData = req.body;
    const result = await sigoService.updateClient(ruc, clientData);
    
    res.json({
      success: true,
      message: 'Cliente actualizado exitosamente',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createClient,
  getClient,
  updateClient,
  validateClient,
  validateRuc
};