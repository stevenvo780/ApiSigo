const express = require('express');
const router = express.Router();
const {
  createClient,
  getClient,
  updateClient,
  validateClient,
  validateRuc
} = require('../controllers/clientController');

router.post('/', validateClient, createClient);
router.get('/:ruc', validateRuc, getClient);
router.put('/:ruc', [...validateRuc, ...validateClient], updateClient);

module.exports = router;