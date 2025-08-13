"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Setup de Jest para TypeScript
const dotenv_1 = __importDefault(require("dotenv"));
// Cargar variables de entorno para tests
dotenv_1.default.config({ path: '.env.test' });
// Configurar variables de entorno por defecto para tests
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.SIGO_API_URL = 'https://api.sigosoftware.com';
process.env.SIGO_API_KEY = 'test-api-key';
process.env.SIGO_SECRET_KEY = 'test-secret-key';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.HUB_CENTRAL_WEBHOOK_URL = 'https://hub.test.com/webhook';
// Mock console para tests más limpios
global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
};
// Timeout global para tests
jest.setTimeout(30000);
//# sourceMappingURL=setup.js.map