
import dotenv from 'dotenv';


dotenv.config({ path: '.env.test' });


process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.SIGO_API_URL = 'https://api.sigosoftware.com';
process.env.SIGO_API_KEY = 'test-api-key';
process.env.SIGO_SECRET_KEY = 'test-secret-key';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.HUB_CENTRAL_WEBHOOK_URL = 'https://hub.test.com/webhook';


global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};


jest.setTimeout(30000);
