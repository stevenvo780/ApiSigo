/**
 * Configuración segura para ApiSigo - Colombia
 * Lee credenciales de variables de entorno en tiempo de ejecución
 * NO hardcodear credenciales aquí
 */

const config = {
  // Servidor
  port: process.env.PORT || 3004,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // SIGO Colombia API - CREDENCIALES CONFIGURABLES
  sigo: {
    apiUrl: process.env.SIGO_API_URL || 'https://api.sigo.com.co/v1',
    apiKey: process.env.SIGO_API_KEY, // REQUERIDO
    username: process.env.SIGO_USERNAME, // REQUERIDO
    password: process.env.SIGO_PASSWORD, // REQUERIDO
    serieDefault: process.env.SIGO_SERIE_DEFAULT || 'FV',
    nitGenerico: process.env.SIGO_NIT_GENERICO || '900123456-1',
    rucGenerico: process.env.SIGO_RUC_GENERICO || '20000000001'
  },
  
  // HubCentral Integration
  hubCentral: {
    url: process.env.HUB_CENTRAL_URL || 'http://localhost:3007',
    webhookSecret: process.env.HUB_WEBHOOK_SECRET, // REQUERIDO
    apiSigoSecret: process.env.APISIGO_WEBHOOK_SECRET // REQUERIDO
  },
  
  // Base de datos (opcional)
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    name: process.env.DB_NAME || 'apisigo_colombia',
    user: process.env.DB_USER || 'apisigo_user',
    password: process.env.DB_PASSWORD
  },
  
  // Configuración Colombia
  colombia: {
    iva: parseInt(process.env.IVA_COLOMBIA) || 19,
    moneda: process.env.MONEDA_DEFAULT || 'COP',
    tipoDocumentoFactura: process.env.TIPO_DOCUMENTO_FACTURA || '01',
    tipoDocumentoCliente: process.env.TIPO_DOCUMENTO_CLIENTE || '31'
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};

/**
 * Validar configuración requerida
 */
function validateConfig() {
  const required = [
    'SIGO_API_KEY',
    'SIGO_USERNAME', 
    'SIGO_PASSWORD',
    'HUB_WEBHOOK_SECRET',
    'APISIGO_WEBHOOK_SECRET'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ ERROR: Variables de entorno requeridas faltantes:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n📖 Ver README.md para instrucciones de configuración');
    process.exit(1);
  }
  
  console.log('✅ Configuración validada correctamente');
  return true;
}

/**
 * Mostrar configuración (sin credenciales)
 */
function showConfig() {
  console.log('📋 Configuración ApiSigo:');
  console.log(`   Puerto: ${config.port}`);
  console.log(`   Entorno: ${config.nodeEnv}`);
  console.log(`   SIGO API: ${config.sigo.apiUrl}`);
  console.log(`   HubCentral: ${config.hubCentral.url}`);
  console.log(`   Moneda: ${config.colombia.moneda}`);
  console.log(`   IVA: ${config.colombia.iva}%`);
}

module.exports = {
  config,
  validateConfig,
  showConfig
};
