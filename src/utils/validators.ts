/**
 * Validadores para integraciones de APIs
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  details?: string;
}

/**
 * Valida formato de API key de Siigo
 */
export function validateSigoApiKey(apiKey?: string): ValidationResult {
  if (!apiKey) {
    return {
      isValid: false,
      error: "API key es requerida",
      details: "Siigo API key no proporcionada",
    };
  }

  if (typeof apiKey !== "string") {
    return {
      isValid: false,
      error: "API key debe ser string",
      details: "Tipo de dato inválido para Siigo API key",
    };
  }

  if (apiKey.length < 32) {
    return {
      isValid: false,
      error: "API key muy corta",
      details: "Siigo API key debe tener al menos 32 caracteres",
    };
  }

  if (apiKey.length > 128) {
    return {
      isValid: false,
      error: "API key muy larga",
      details: "Siigo API key no debe exceder 128 caracteres",
    };
  }

  if (apiKey === "default-api-key" || apiKey === "your-api-key-here") {
    return {
      isValid: false,
      error: "API key por defecto",
      details: "Debe configurar una API key real de Siigo",
    };
  }

  const validChars = /^[a-zA-Z0-9\-_\.=]+$/;
  if (!validChars.test(apiKey)) {
    return {
      isValid: false,
      error: "Caracteres inválidos",
      details: "API key contiene caracteres no permitidos",
    };
  }

  return { isValid: true };
}

/**
 * Valida formato de username de Siigo
 */
export function validateSigoUsername(username?: string): ValidationResult {
  if (!username) {
    return {
      isValid: false,
      error: "Username es requerido",
      details: "Siigo username no proporcionado",
    };
  }

  if (typeof username !== "string") {
    return {
      isValid: false,
      error: "Username debe ser string",
      details: "Tipo de dato inválido para username",
    };
  }

  if (username.length < 3) {
    return {
      isValid: false,
      error: "Username muy corto",
      details: "Username debe tener al menos 3 caracteres",
    };
  }

  if (username.length > 50) {
    return {
      isValid: false,
      error: "Username muy largo",
      details: "Username no debe exceder 50 caracteres",
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (username.includes("@") && !emailRegex.test(username)) {
    return {
      isValid: false,
      error: "Email inválido",
      details: "Si el username es email, debe tener formato válido",
    };
  }

  return { isValid: true };
}

/**
 * Valida formato de API key de Softia
 */
export function validateSoftiaApiKey(apiKey?: string): ValidationResult {
  if (!apiKey) {
    return {
      isValid: false,
      error: "API key es requerida",
      details: "Softia API key no proporcionada",
    };
  }

  if (typeof apiKey !== "string") {
    return {
      isValid: false,
      error: "API key debe ser string",
      details: "Tipo de dato inválido para Softia API key",
    };
  }

  if (apiKey.length < 20) {
    return {
      isValid: false,
      error: "API key muy corta",
      details: "Softia API key debe tener al menos 20 caracteres",
    };
  }

  if (apiKey.length > 100) {
    return {
      isValid: false,
      error: "API key muy larga",
      details: "Softia API key no debe exceder 100 caracteres",
    };
  }

  if (apiKey === "default-api-key" || apiKey === "your-api-key-here") {
    return {
      isValid: false,
      error: "API key por defecto",
      details: "Debe configurar una API key real de Softia",
    };
  }

  return { isValid: true };
}

/**
 * Valida URL de API
 */
export function validateApiUrl(
  url?: string,
  serviceName: string = "API",
): ValidationResult {
  if (!url) {
    return {
      isValid: false,
      error: "URL es requerida",
      details: `URL de ${serviceName} no proporcionada`,
    };
  }

  if (typeof url !== "string") {
    return {
      isValid: false,
      error: "URL debe ser string",
      details: "Tipo de dato inválido para URL",
    };
  }

  try {
    const parsedUrl = new URL(url);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return {
        isValid: false,
        error: "Protocolo inválido",
        details: "URL debe usar HTTP o HTTPS",
      };
    }

    if (!parsedUrl.hostname) {
      return {
        isValid: false,
        error: "Host inválido",
        details: "URL debe tener un hostname válido",
      };
    }

    if (
      process.env.NODE_ENV === "production" &&
      (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1")
    ) {
      return {
        isValid: false,
        error: "URL localhost en producción",
        details: "No se permite localhost en producción",
      };
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: "URL malformada",
      details: "URL no tiene formato válido",
    };
  }
}

/**
 * Valida configuración completa de Siigo
 */
export function validateSigoConfig(config: {
  apiKey?: string;
  username?: string;
  baseURL?: string;
}): ValidationResult {
  const apiKeyValidation = validateSigoApiKey(config.apiKey);
  if (!apiKeyValidation.isValid) {
    return apiKeyValidation;
  }

  const usernameValidation = validateSigoUsername(config.username);
  if (!usernameValidation.isValid) {
    return usernameValidation;
  }

  if (config.baseURL) {
    const urlValidation = validateApiUrl(config.baseURL, "Siigo");
    if (!urlValidation.isValid) {
      return urlValidation;
    }
  }

  return { isValid: true };
}

/**
 * Valida configuración completa de Softia
 */
export function validateSoftiaConfig(config: {
  apiKey?: string;
  apiSecret?: string;
  apiUrl?: string;
}): ValidationResult {
  const apiKeyValidation = validateSoftiaApiKey(config.apiKey);
  if (!apiKeyValidation.isValid) {
    return apiKeyValidation;
  }

  if (config.apiSecret && config.apiSecret.length < 16) {
    return {
      isValid: false,
      error: "API secret muy corto",
      details: "API secret debe tener al menos 16 caracteres",
    };
  }

  if (config.apiUrl) {
    const urlValidation = validateApiUrl(config.apiUrl, "Softia");
    if (!urlValidation.isValid) {
      return urlValidation;
    }
  }

  return { isValid: true };
}

/**
 * Valida webhook secret
 */
export function validateWebhookSecret(secret?: string): ValidationResult {
  if (!secret) {
    return {
      isValid: false,
      error: "Secret es requerido",
      details: "Webhook secret no proporcionado",
    };
  }

  if (typeof secret !== "string") {
    return {
      isValid: false,
      error: "Secret debe ser string",
      details: "Tipo de dato inválido para secret",
    };
  }

  if (secret.length < 16) {
    return {
      isValid: false,
      error: "Secret muy corto",
      details: "Webhook secret debe tener al menos 16 caracteres",
    };
  }

  if (secret === "default-secret" || secret === "your-secret-here") {
    return {
      isValid: false,
      error: "Secret por defecto",
      details: "Debe configurar un secret real y seguro",
    };
  }

  return { isValid: true };
}
