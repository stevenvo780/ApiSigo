#!/usr/bin/env node

/**
 * Script avanzado para encontrar y validar la API real de SIGO POS
 * Prueba múltiples URLs y endpoints posibles
 */

const axios = require('axios');
require('dotenv').config();

class SigoAPIFinder {
  constructor() {
    this.possibleUrls = [
      'https://api.sigo.co',
      'https://sigo.co/api',
      'https://app.sigo.co/api', 
      'https://api.sigo.com',
      'https://sigo.com/api',
      'https://api-sigo.com',
      'https://pos.sigo.co/api',
      'https://facturacion.sigo.co/api',
      'https://api.sigopos.com',
      'https://api.sigosoftware.com'
    ];

    this.possibleVersions = ['', '/v1', '/v2', '/api/v1'];
    this.apiKey = process.env.SIGO_API_KEY;
  }

  async findWorkingAPI() {
    console.log('🔍 BUSCANDO API REAL DE SIGO POS...');
    console.log('=' .repeat(50));

    const workingUrls = [];

    // Probar cada combinación de URL + versión
    for (const baseUrl of this.possibleUrls) {
      for (const version of this.possibleVersions) {
        const fullUrl = baseUrl + version;
        console.log(`📡 Probando: ${fullUrl}`);
        
        const result = await this.testUrl(fullUrl);
        if (result.accessible) {
          workingUrls.push({
            url: fullUrl,
            ...result
          });
          console.log(`✅ ACCESIBLE: ${fullUrl}`);
          if (result.likelyAPI) {
            console.log(`🎯 POSIBLE API: ${fullUrl}`);
          }
        } else {
          console.log(`❌ No accesible: ${fullUrl}`);
        }
      }
    }

    return workingUrls;
  }

  async testUrl(url) {
    try {
      // Probar conectividad básica
      const response = await axios.get(url, {
        timeout: 5000,
        validateStatus: () => true // Aceptar cualquier status
      });

      const result = {
        accessible: true,
        status: response.status,
        headers: response.headers,
        dataType: typeof response.data,
        likelyAPI: false,
        hasAuth: false,
        endpoints: []
      };

      // Detectar si parece una API
      const indicators = [
        response.headers['content-type']?.includes('application/json'),
        response.data?.toString().includes('api'),
        response.data?.toString().includes('auth'),
        response.data?.toString().includes('token'),
        response.status === 401, // No autorizado = API existe
        response.status === 403, // Prohibido = API existe pero sin permisos
      ];

      result.likelyAPI = indicators.some(Boolean);
      result.hasAuth = response.status === 401 || response.status === 403;

      // Si parece API, probar endpoints comunes
      if (result.likelyAPI) {
        result.endpoints = await this.testCommonEndpoints(url);
      }

      return result;

    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return { accessible: false, error: error.code };
      }
      
      // Error de certificado SSL o timeout puede indicar que existe pero está protegida
      return { 
        accessible: true, 
        status: 'error',
        error: error.message,
        likelyAPI: error.code === 'CERT_HAS_EXPIRED' || error.code === 'ECONNRESET'
      };
    }
  }

  async testCommonEndpoints(baseUrl) {
    const endpoints = [
      '/auth',
      '/login', 
      '/clientes',
      '/customers',
      '/facturas',
      '/invoices',
      '/documentos',
      '/health',
      '/status',
      '/me',
      '/user'
    ];

    const results = [];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(baseUrl + endpoint, {
          timeout: 3000,
          validateStatus: () => true,
          headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}
        });

        if (response.status !== 404) {
          results.push({
            endpoint,
            status: response.status,
            needsAuth: response.status === 401,
            working: response.status === 200
          });
        }
      } catch (error) {
        // Ignorar errores de endpoints individuales
      }
    }

    return results;
  }

  async searchWebForSigoAPI() {
    console.log('\n📚 BUSCANDO INFORMACIÓN ADICIONAL...');
    
    // Intentar encontrar información en sitios comunes
    const infoSources = [
      'https://github.com/search?q=sigo+pos+api',
      'https://stackoverflow.com/search?q=sigo+pos+api',
    ];

    console.log('💡 RECURSOS PARA INVESTIGAR:');
    infoSources.forEach(source => {
      console.log(`- ${source}`);
    });
  }

  async generateReport(workingUrls) {
    console.log('\n📊 REPORTE FINAL');
    console.log('=' .repeat(30));

    if (workingUrls.length === 0) {
      console.log('❌ NO SE ENCONTRARON APIs ACCESIBLES');
      console.log('\n💡 RECOMENDACIONES:');
      console.log('1. Contactar soporte técnico de SIGO directamente');
      console.log('2. Verificar si necesitas registro previo');
      console.log('3. Revisar documentación oficial de SIGO');
      console.log('4. La API puede estar en un dominio corporativo privado');
      return;
    }

    console.log(`✅ ENCONTRADAS ${workingUrls.length} URLs ACCESIBLES:`);
    
    workingUrls.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.url}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Posible API: ${result.likelyAPI ? '✅' : '❌'}`);
      console.log(`   Requiere Auth: ${result.hasAuth ? '✅' : '❌'}`);
      
      if (result.endpoints?.length > 0) {
        console.log('   Endpoints encontrados:');
        result.endpoints.forEach(ep => {
          const status = ep.working ? '✅' : ep.needsAuth ? '🔐' : '⚠️';
          console.log(`   - ${status} ${ep.endpoint} (${ep.status})`);
        });
      }
    });

    // Sugerir la mejor opción
    const bestCandidate = workingUrls.find(r => r.likelyAPI && r.endpoints?.length > 0) || 
                         workingUrls.find(r => r.likelyAPI) ||
                         workingUrls[0];

    if (bestCandidate) {
      console.log(`\n🎯 MEJOR CANDIDATO: ${bestCandidate.url}`);
      console.log('   Actualiza tu .env con:');
      console.log(`   SIGO_API_URL=${bestCandidate.url}`);
    }
  }

  async run() {
    console.log('🚀 SIGO POS API FINDER');
    console.log('Buscando la API real de SIGO POS...\n');

    const workingUrls = await this.findWorkingAPI();
    await this.searchWebForSigoAPI();
    await this.generateReport(workingUrls);

    console.log('\n📋 SIGUIENTES PASOS:');
    console.log('1. Contactar SIGO para obtener documentación oficial');
    console.log('2. Solicitar credenciales de API (sandbox y producción)');
    console.log('3. Confirmar endpoints exactos para tu caso de uso');
    console.log('4. Probar con el script test-sigo-api.js una vez configurado');
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const finder = new SigoAPIFinder();
  finder.run().catch(error => {
    console.error('💥 Error:', error.message);
    process.exit(1);
  });
}

module.exports = SigoAPIFinder;
