/**
 * Esquemas de validación y transformación para facturas
 */

/**
 * Esquema para datos de pedido desde Hub Central
 */
const pedidoSchema = {
  order_id: {
    type: 'number',
    required: true,
    min: 1
  },
  store_id: {
    type: 'number',
    required: true,
    min: 1
  },
  customer_id: {
    type: 'number',
    required: false
  },
  user_id: {
    type: 'number',
    required: false
  },
  amount: {
    type: 'number',
    required: true,
    min: 0.01
  },
  currency: {
    type: 'string',
    required: true,
    enum: ['COP', 'PEN', 'USD']
  },
  items: {
    type: 'array',
    required: true,
    minLength: 1,
    items: {
      type: 'object',
      properties: {
        product_id: { type: 'number', required: true },
        product_name: { type: 'string', required: true, minLength: 1 },
        quantity: { type: 'number', required: true, min: 1 },
        unit_price: { type: 'number', required: true, min: 0 },
        total: { type: 'number', required: false, min: 0 }
      }
    }
  },
  paid_at: {
    type: 'string',
    required: true,
    format: 'date-time'
  }
};

/**
 * Esquema para factura SIGO
 */
const facturaSchema = {
  serie: {
    type: 'string',
    required: true,
    pattern: /^[A-Z]\d{3}$/
  },
  numero: {
    type: 'number',
    required: true,
    min: 1
  },
  fechaEmision: {
    type: 'string',
    required: true,
    format: 'date'
  },
  cliente: {
    type: 'object',
    required: true,
    properties: {
      ruc: { 
        type: 'string', 
        required: true, 
        pattern: /^\d{11}$/ 
      },
      razonSocial: { 
        type: 'string', 
        required: true, 
        minLength: 1 
      },
      direccion: { 
        type: 'string', 
        required: false 
      }
    }
  },
  items: {
    type: 'array',
    required: true,
    minLength: 1,
    items: {
      type: 'object',
      properties: {
        descripcion: { type: 'string', required: true, minLength: 1 },
        cantidad: { type: 'number', required: true, min: 0.01 },
        precioUnitario: { type: 'number', required: true, min: 0 },
        total: { type: 'number', required: true, min: 0 }
      }
    }
  },
  totales: {
    type: 'object',
    required: true,
    properties: {
      subtotal: { type: 'number', required: true, min: 0 },
      igv: { type: 'number', required: true, min: 0 },
      total: { type: 'number', required: true, min: 0 }
    }
  }
};

/**
 * Esquema de respuesta de webhook factura.creada
 */
const webhookResponseSchema = {
  event_type: {
    type: 'string',
    required: true,
    enum: ['factura.creada']
  },
  source: {
    type: 'string',
    required: true,
    enum: ['apisigo']
  },
  timestamp: {
    type: 'string',
    required: true,
    format: 'date-time'
  },
  data: {
    type: 'object',
    required: true,
    properties: {
      factura_id: { type: 'string', required: true },
      order_id: { type: 'number', required: true },
      documento_sigo_id: { type: 'string', required: true },
      estado: { type: 'string', required: true },
      monto: { type: 'number', required: true },
      pdf_url: { type: 'string', required: false },
      created_at: { type: 'string', required: true, format: 'date-time' }
    }
  }
};

/**
 * Validador simple para esquemas
 */
class Validator {
  static validate(data, schema) {
    const errors = [];
    
    this._validateObject(data, schema, '', errors);
    
    if (errors.length > 0) {
      throw new ValidationError('Datos inválidos', errors);
    }
    
    return true;
  }
  
  static _validateObject(data, schema, path, errors) {
    for (const [key, rules] of Object.entries(schema)) {
      const value = data[key];
      const currentPath = path ? `${path}.${key}` : key;
      
      // Verificar campo requerido
      if (rules.required && (value === undefined || value === null)) {
        errors.push(`${currentPath} es requerido`);
        continue;
      }
      
      // Si no es requerido y no está presente, continuar
      if (!rules.required && (value === undefined || value === null)) {
        continue;
      }
      
      // Validar tipo
      if (rules.type && typeof value !== rules.type) {
        if (!(rules.type === 'array' && Array.isArray(value))) {
          errors.push(`${currentPath} debe ser de tipo ${rules.type}`);
          continue;
        }
      }
      
      // Validaciones específicas por tipo
      switch (rules.type) {
        case 'string':
          this._validateString(value, rules, currentPath, errors);
          break;
        case 'number':
          this._validateNumber(value, rules, currentPath, errors);
          break;
        case 'array':
          this._validateArray(value, rules, currentPath, errors);
          break;
        case 'object':
          if (rules.properties) {
            this._validateObject(value, rules.properties, currentPath, errors);
          }
          break;
      }
    }
  }
  
  static _validateString(value, rules, path, errors) {
    if (rules.minLength && value.length < rules.minLength) {
      errors.push(`${path} debe tener al menos ${rules.minLength} caracteres`);
    }
    
    if (rules.pattern && !rules.pattern.test(value)) {
      errors.push(`${path} no cumple con el formato requerido`);
    }
    
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${path} debe ser uno de: ${rules.enum.join(', ')}`);
    }
  }
  
  static _validateNumber(value, rules, path, errors) {
    if (rules.min !== undefined && value < rules.min) {
      errors.push(`${path} debe ser mayor o igual a ${rules.min}`);
    }
    
    if (rules.max !== undefined && value > rules.max) {
      errors.push(`${path} debe ser menor o igual a ${rules.max}`);
    }
  }
  
  static _validateArray(value, rules, path, errors) {
    if (rules.minLength && value.length < rules.minLength) {
      errors.push(`${path} debe tener al menos ${rules.minLength} elementos`);
    }
    
    if (rules.items) {
      value.forEach((item, index) => {
        if (rules.items.type === 'object' && rules.items.properties) {
          this._validateObject(item, rules.items.properties, `${path}[${index}]`, errors);
        }
      });
    }
  }
}

class ValidationError extends Error {
  constructor(message, errors) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

module.exports = {
  pedidoSchema,
  facturaSchema,
  webhookResponseSchema,
  Validator,
  ValidationError
};
