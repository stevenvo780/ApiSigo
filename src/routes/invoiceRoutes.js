const express = require('express');
const router = express.Router();
const {
  createInvoice,
  getInvoice,
  updateInvoiceStatus,
  sendInvoiceToSunat,
  cancelInvoice,
  getInvoiceStatus,
  validateInvoice,
  validateInvoiceParams,
  validateStatus
} = require('../controllers/invoiceController');

router.post('/', validateInvoice, createInvoice);
router.get('/:serie/:numero', validateInvoiceParams, getInvoice);
router.patch('/:serie/:numero/status', [...validateInvoiceParams, ...validateStatus], updateInvoiceStatus);
router.post('/:serie/:numero/send-sunat', validateInvoiceParams, sendInvoiceToSunat);
router.post('/:serie/:numero/cancel', validateInvoiceParams, cancelInvoice);
router.get('/:serie/:numero/status', validateInvoiceParams, getInvoiceStatus);

module.exports = router;