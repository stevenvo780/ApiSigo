interface AuthCache {
  token: string;
  email: string;
  apiKey: string;
  expiresAt: number;
}

let authCache: AuthCache | null = null;

export class AuthenticationCache {
  private static readonly CACHE_DURATION = 50 * 60 * 1000;

  static getToken(email: string, apiKey: string): string | null {
    if (!authCache) return null;

    if (authCache.email !== email || authCache.apiKey !== apiKey) {
      this.clearCache();
      return null;
    }

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
