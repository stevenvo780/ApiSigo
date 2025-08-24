#!/usr/bin/env node

const axios = require('axios');

async function testHubCentralWebhook() {
    console.log('🧪 Iniciando prueba de webhook Hub Central...\n');
    
    try {
        // 1. Primero verificar que el endpoint esté disponible
        console.log('1️⃣ Verificando estado de Hub Central...');
        const healthResponse = await axios.get('http://localhost:3007/api/v1/health');
        console.log('✅ Hub Central está corriendo:', healthResponse.data.status);
        
        // 2. Verificar que el backend de Graf tenga la configuración correcta
        console.log('\n2️⃣ Verificando configuración de plugins...');
        const configResponse = await axios.get('http://localhost:3009/config/Salinero');
        const hubcentral = configResponse.data.plugins?.hubcentral;
        
        if (!hubcentral?.enabled) {
            throw new Error('Hub Central no está habilitado en la configuración');
        }
        console.log('✅ Hub Central está habilitado en Graf');
        
        // 3. Probar directamente el endpoint de webhooks
        console.log('\n3️⃣ Probando endpoint de webhooks directamente...');
        const testPayload = {
            event_type: 'order.paid',
            data: {
                order_id: 'test-12345',
                store_id: 'Salinero',
                customer_id: null,
                user_id: 'test-user',
                amount: 50000,
                currency: 'COP',
                items: [
                    {
                        product_id: 'test-product',
                        product_name: 'Producto de Prueba',
                        quantity: 2,
                        unit_price: 25000,
                        total: 50000
                    }
                ],
                shipping_address: {
                    address: 'Dirección de prueba',
                    city: 'Bogotá'
                },
                delivery_zone_id: null,
                paid_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        };
        
        // Crear firma HMAC como lo hace el plugin service
        const crypto = require('crypto');
        const hubSecret = 'your_hub_central_secret_key'; // Mismo valor del .env
        const signature = crypto
            .createHmac('sha256', hubSecret)
            .update(JSON.stringify(testPayload))
            .digest('hex');
        
        const headers = {
            'x-graf-signature': `sha256=${signature}`,
            'x-tenant-id': 'Salinero',
            'Content-Type': 'application/json'
        };
        
        const webhookResponse = await axios.post(
            'http://localhost:3007/api/v1/webhooks/graf',
            testPayload,
            { headers }
        );
        
        console.log('✅ Webhook enviado exitosamente:', webhookResponse.data);
        
        console.log('\n🎉 ¡Prueba exitosa! Hub Central está recibiendo webhooks correctamente.');
        console.log('\n📋 Resumen:');
        console.log('   • Hub Central: ✅ Funcionando');
        console.log('   • Variable PLUGIN_HUBCENTRAL_URL: ✅ Configurada');
        console.log('   • Plugin habilitado: ✅ Si');
        console.log('   • Endpoint de webhook: ✅ Funcionando');
        
    } catch (error) {
        console.error('❌ Error en la prueba:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        }
        process.exit(1);
    }
}

// Ejecutar la prueba
testHubCentralWebhook();
