interface AuthCache {
  token: string;
  email: string;
  apiKey: string;
  expiresAt: number;
}

// Cache de autenticación en memoria (se pierde al reiniciar el proceso)
let authCache: AuthCache | null = null;

export class AuthenticationCache {
  private static readonly CACHE_DURATION = 50 * 60 * 1000; // 50 minutos (SIGO tokens duran ~1 hora)

  static getToken(email: string, apiKey: string): string | null {
    if (!authCache) return null;

    // Verificar si las credenciales coinciden
    if (authCache.email !== email || authCache.apiKey !== apiKey) {
      this.clearCache();
      return null;
    }

    // Verificar si el token no ha expirado
    if (Date.now() > authCache.expiresAt) {
      this.clearCache();
      return null;
    }

    return authCache.token;
  }

  static setToken(email: string, apiKey: string, token: string): void {
    authCache = {
      token,
      email,
      apiKey,
      expiresAt: Date.now() + this.CACHE_DURATION,
    };
  }

  static clearCache(): void {
    authCache = null;
  }


}

export default AuthenticationCache;
