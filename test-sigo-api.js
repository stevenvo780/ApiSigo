#!/usr/bin/env node

/**
 * Script de prueba para validar conectividad con SIGO POS
 * Este script simula las operaciones básicas que tu ecommerce necesita:
 * - Crear clientes
 * - Crear facturas
 * - Cambiar estados de factura
 * - Detectar eventos
 */

const axios = require('axios');
require('dotenv').config();

class SigoAPITester {
  constructor() {
    this.baseURL = process.env.SIGO_API_URL || 'https://api.sigosoftware.com';
    this.apiKey = process.env.SIGO_API_KEY;
    this.username = process.env.SIGO_USERNAME;
    this.password = process.env.SIGO_PASSWORD;
    
    console.log('🔍 Configuración SIGO:');
    console.log(`- URL Base: ${this.baseURL}`);
    console.log(`- API Key configurada: ${!!this.apiKey}`);
    console.log(`- Credenciales configuradas: ${!!(this.username && this.password)}`);
    console.log('');
  }

  async testAuthentication() {
    console.log('📡 Probando autenticación...');
    
    try {
      // Intentar autenticación con diferentes métodos
      const methods = [
        { name: 'API Key en headers', test: () => this.testApiKeyAuth() },
        { name: 'Login con usuario/contraseña', test: () => this.testLoginAuth() },
        { name: 'OAuth/Bearer Token', test: () => this.testBearerAuth() }
      ];

      for (const method of methods) {
        console.log(`  🔐 Probando ${method.name}...`);
        try {
          await method.test();
          console.log(`  ✅ ${method.name} - EXITOSO`);
          return true;
        } catch (error) {
          console.log(`  ❌ ${method.name} - FALLÓ: ${error.message}`);
        }
      }
      
      return false;
    } catch (error) {
      console.error('❌ Error en autenticación:', error.message);
      return false;
    }
  }

  async testApiKeyAuth() {
    const response = await axios.get(`${this.baseURL}/api/auth/verify`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    return response.data;
  }

  async testLoginAuth() {
    const response = await axios.post(`${this.baseURL}/api/auth/login`, {
      username: this.username,
      password: this.password
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    return response.data;
  }

  async testBearerAuth() {
    const response = await axios.get(`${this.baseURL}/api/me`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    return response.data;
  }

  async testClientOperations() {
    console.log('👤 Probando operaciones de clientes...');
    
    const testClient = {
      razonSocial: 'CLIENTE PRUEBA ECOMMERCE SA',
      ruc: '20123456789',
      direccion: 'Av. Test 123, Lima',
      email: 'test@ecommerce.com',
      telefono: '999888777'
    };

    try {
      // Crear cliente
      console.log('  📝 Creando cliente de prueba...');
      const createResponse = await this.createClient(testClient);
      console.log('  ✅ Cliente creado:', createResponse?.id || 'Sin ID');

      // Obtener cliente
      console.log('  🔍 Obteniendo cliente...');
      const getResponse = await this.getClient(testClient.ruc);
      console.log('  ✅ Cliente obtenido:', getResponse?.razonSocial || 'Sin nombre');

      // Actualizar cliente
      console.log('  ✏️ Actualizando cliente...');
      const updateResponse = await this.updateClient(testClient.ruc, {
        ...testClient,
        telefono: '999888666'
      });
      console.log('  ✅ Cliente actualizado');

      return true;
    } catch (error) {
      console.error('  ❌ Error en operaciones de cliente:', error.message);
      return false;
    }
  }

  async createClient(clientData) {
    const response = await axios.post(`${this.baseURL}/api/clientes`, clientData, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  }

  async getClient(ruc) {
    const response = await axios.get(`${this.baseURL}/api/clientes/${ruc}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  }

  async updateClient(ruc, clientData) {
    const response = await axios.put(`${this.baseURL}/api/clientes/${ruc}`, clientData, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  }

  async testInvoiceOperations() {
    console.log('🧾 Probando operaciones de facturas...');
    
    const testInvoice = {
      tipo_documento: 'FACTURA_VENTA',
      serie: 'FV',
      numero: Math.floor(Math.random() * 10000),
      fecha_emision: new Date().toISOString().split('T')[0],
      moneda: 'COP',
      cliente: {
        nit: '20123456789',
        razon_social: 'CLIENTE PRUEBA ECOMMERCE SA',
        direccion: 'Av. Test 123, Lima'
      },
      items: [{
        codigo_producto: 'PROD001',
        descripcion: 'Producto de prueba ecommerce',
        cantidad: 2,
        precio_unitario: 50000, // $500 COP
        valor_total: 84034, // Sin IVA
        iva_total: 15966, // IVA 19%
        precio_total: 100000 // $1000 COP total
      }],
      totales: {
        subtotal: 84034,
        iva: 15966,
        total: 100000
      }
    };

    try {
      // Crear factura
      console.log('  📝 Creando factura de prueba...');
      const createResponse = await this.createInvoice(testInvoice);
      console.log('  ✅ Factura creada:', createResponse?.numero_documento || 'Sin número');

      const serie = testInvoice.serie;
      const numero = testInvoice.numero;

      // Obtener factura
      console.log('  🔍 Obteniendo factura...');
      const getResponse = await this.getInvoice(serie, numero);
      console.log('  ✅ Factura obtenida:', getResponse?.estado || 'Sin estado');

      // Cambiar estado
      console.log('  🔄 Cambiando estado de factura...');
      await this.updateInvoiceStatus(serie, numero, 'ENVIADO');
      console.log('  ✅ Estado actualizado a ENVIADO');

      // Verificar estado
      console.log('  🔍 Verificando estado...');
      const statusResponse = await this.getInvoiceStatus(serie, numero);
      console.log('  ✅ Estado actual:', statusResponse?.estado || 'Desconocido');

      return true;
    } catch (error) {
      console.error('  ❌ Error en operaciones de factura:', error.message);
      return false;
    }
  }

  async createInvoice(invoiceData) {
    const response = await axios.post(`${this.baseURL}/api/facturas`, invoiceData, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  }

  async getInvoice(serie, numero) {
    const response = await axios.get(`${this.baseURL}/api/facturas/${serie}/${numero}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  }

  async updateInvoiceStatus(serie, numero, status) {
    const response = await axios.patch(`${this.baseURL}/api/facturas/${serie}/${numero}/estado`, {
      estado: status
    }, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  }

  async getInvoiceStatus(serie, numero) {
    const response = await axios.get(`${this.baseURL}/api/facturas/${serie}/${numero}/estado`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  }

  async testWebhookCapabilities() {
    console.log('🔔 Probando capacidades de webhooks...');
    
    try {
      // Verificar endpoints de webhook
      console.log('  🔍 Verificando endpoints de webhook...');
      const webhookEndpoints = [
        `${this.baseURL}/api/webhooks`,
        `${this.baseURL}/api/webhooks/configure`,
        `${this.baseURL}/api/eventos`,
        `${this.baseURL}/api/notificaciones`
      ];

      let webhookSupported = false;
      for (const endpoint of webhookEndpoints) {
        try {
          await axios.get(endpoint, {
            headers: { 'Authorization': `Bearer ${this.apiKey}` }
          });
          console.log(`  ✅ Endpoint disponible: ${endpoint}`);
          webhookSupported = true;
        } catch (error) {
          if (error.response?.status === 401) {
            console.log(`  🔐 Endpoint requiere autenticación: ${endpoint}`);
            webhookSupported = true;
          } else {
            console.log(`  ❌ Endpoint no disponible: ${endpoint}`);
          }
        }
      }

      return webhookSupported;
    } catch (error) {
      console.error('  ❌ Error verificando webhooks:', error.message);
      return false;
    }
  }

  async runFullTest() {
    console.log('🚀 Iniciando pruebas completas de SIGO POS API');
    console.log('='.repeat(50));
    
    const results = {
      auth: false,
      clients: false,
      invoices: false,
      webhooks: false
    };

    // Test 1: Autenticación
    results.auth = await this.testAuthentication();
    console.log('');

    // Solo continúar si la autenticación funciona
    if (results.auth) {
      // Test 2: Operaciones de clientes
      results.clients = await this.testClientOperations();
      console.log('');

      // Test 3: Operaciones de facturas
      results.invoices = await this.testInvoiceOperations();
      console.log('');

      // Test 4: Capacidades de webhook
      results.webhooks = await this.testWebhookCapabilities();
      console.log('');
    }

    // Resumen
    console.log('📊 RESUMEN DE PRUEBAS');
    console.log('='.repeat(30));
    console.log(`🔐 Autenticación: ${results.auth ? '✅ FUNCIONA' : '❌ FALLA'}`);
    console.log(`👤 Clientes: ${results.clients ? '✅ FUNCIONA' : '❌ FALLA'}`);
    console.log(`🧾 Facturas: ${results.invoices ? '✅ FUNCIONA' : '❌ FALLA'}`);
    console.log(`🔔 Webhooks: ${results.webhooks ? '✅ DISPONIBLE' : '❌ NO DISPONIBLE'}`);
    console.log('');

    const allWorking = Object.values(results).every(r => r);
    console.log(`🎯 ESTADO GENERAL: ${allWorking ? '✅ TODO FUNCIONA' : '⚠️ NECESITA CONFIGURACIÓN'}`);
    
    if (!allWorking) {
      console.log('');
      console.log('💡 RECOMENDACIONES:');
      if (!results.auth) {
        console.log('- Verificar credenciales de SIGO (API_KEY, USERNAME, PASSWORD)');
        console.log('- Confirmar URL base de la API de SIGO');
        console.log('- Contactar soporte de SIGO para activar API');
      }
      if (!results.clients) {
        console.log('- Verificar permisos para gestión de clientes');
      }
      if (!results.invoices) {
        console.log('- Verificar permisos para gestión de facturas');
        console.log('- Confirmar configuración de series y numeración');
      }
      if (!results.webhooks) {
        console.log('- Solicitar activación de webhooks a SIGO');
        console.log('- Configurar URLs de callback para eventos');
      }
    }

    return results;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const tester = new SigoAPITester();
  tester.runFullTest().then(results => {
    process.exit(Object.values(results).every(r => r) ? 0 : 1);
  }).catch(error => {
    console.error('💥 Error fatal:', error.message);
    process.exit(1);
  });
}

module.exports = SigoAPITester;
