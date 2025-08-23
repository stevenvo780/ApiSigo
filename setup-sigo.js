#!/usr/bin/env node

/**
 * Script de configuración rápida para SIGO API
 * Ejecutar después de obtener credenciales de SIGO
 */

const fs = require('fs');
const path = require('path');

class SigoSetup {
  constructor() {
    this.envPath = path.join(__dirname, '.env');
    this.examplePath = path.join(__dirname, '.env.example');
  }

  async setup() {
    console.log('🚀 CONFIGURACIÓN RÁPIDA SIGO API');
    console.log('=' .repeat(40));

    // Verificar archivos
    if (!fs.existsSync(this.examplePath)) {
      console.error('❌ No se encuentra .env.example');
      return;
    }

    // Crear .env si no existe
    if (!fs.existsSync(this.envPath)) {
      console.log('📝 Creando archivo .env...');
      fs.copyFileSync(this.examplePath, this.envPath);
      console.log('✅ Archivo .env creado desde .env.example');
    }

    // Mostrar configuración actual
    this.showCurrentConfig();
    
    // Mostrar URLs encontradas
    this.showDiscoveredUrls();
    
    // Mostrar siguiente pasos
    this.showNextSteps();
  }

  showCurrentConfig() {
    console.log('\n📋 CONFIGURACIÓN ACTUAL:');
    
    try {
      const envContent = fs.readFileSync(this.envPath, 'utf8');
      const envVars = envContent.split('\n')
        .filter(line => line.includes('SIGO_'))
        .map(line => {
          const [key, value] = line.split('=');
          const isConfigured = value && !value.includes('your_') && !value.includes('here');
          return `${isConfigured ? '✅' : '❌'} ${key}=${value}`;
        });
      
      envVars.forEach(line => console.log(`  ${line}`));
    } catch (error) {
      console.error('❌ Error leyendo .env:', error.message);
    }
  }

  showDiscoveredUrls() {
    console.log('\n🔍 URLs DE SIGO ENCONTRADAS:');
    console.log('  🎯 PRINCIPAL: https://api.sigosoftware.com');
    console.log('  🔄 Alternativa: https://api.sigosoftware.com/v1');
    console.log('  🔄 Alternativa: https://sigo.co/api');
    
    console.log('\n💡 CONFIGURACIÓN RECOMENDADA:');
    console.log('  SIGO_API_URL=https://api.sigosoftware.com');
  }

  showNextSteps() {
    console.log('\n📞 CONTACTAR SIGO:');
    console.log('  1. Visita: https://sigosoftware.com/contacto');
    console.log('  2. Solicita: Documentación API + Credenciales');
    console.log('  3. Menciona: Integración ecommerce facturación automática');

    console.log('\n🧪 PROBAR INTEGRACIÓN:');
    console.log('  # Después de obtener credenciales:');
    console.log('  npm start                    # Iniciar API');
    console.log('  node test-sigo-api.js       # Probar conectividad');
    console.log('  npm test                    # Ejecutar tests');

    console.log('\n📊 MONITOREAR:');
    console.log('  # Logs importantes a vigilar:');
    console.log('  ✅ "Webhook recibido - Orden: X"');
    console.log('  ✅ "Factura creada - SIGO ID: X"');
    console.log('  ❌ "Error creando factura en SIGO"');

    console.log('\n🎯 INTEGRACIÓN CON ECOMMERCE:');
    console.log('  1. Configura webhook: POST /api/webhooks/pedido-pagado');
    console.log('  2. Escucha respuesta: webhook factura.creada');
    console.log('  3. Actualiza orden con: invoice_id, invoice_number, pdf_url');
  }

  async testCurrentConfig() {
    console.log('\n🧪 PROBANDO CONFIGURACIÓN ACTUAL...');
    
    try {
      require('dotenv').config();
      
      const config = {
        url: process.env.SIGO_API_URL,
        apiKey: process.env.SIGO_API_KEY,
        username: process.env.SIGO_USERNAME,
        password: process.env.SIGO_PASSWORD
      };

      console.log('📋 Variables cargadas:');
      Object.entries(config).forEach(([key, value]) => {
        const configured = value && !value.includes('your_');
        console.log(`  ${configured ? '✅' : '❌'} ${key}: ${configured ? '***configurado***' : value}`);
      });

      if (Object.values(config).every(v => v && !v.includes('your_'))) {
        console.log('\n🚀 ¡Configuración completa! Ejecuta:');
        console.log('  node test-sigo-api.js');
      } else {
        console.log('\n⏳ Faltan credenciales. Contacta SIGO primero.');
      }

    } catch (error) {
      console.error('❌ Error probando configuración:', error.message);
    }
  }
}

// Ejecutar setup
if (require.main === module) {
  const setup = new SigoSetup();
  setup.setup()
    .then(() => setup.testCurrentConfig())
    .catch(error => {
      console.error('💥 Error en setup:', error.message);
      process.exit(1);
    });
}

module.exports = SigoSetup;
