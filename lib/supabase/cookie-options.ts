export type AuthCookieOptions = {
  secure?: boolean;
  sameSite?: boolean | "lax" | "strict" | "none";
  httpOnly?: boolean;
  path?: string;
  maxAge?: number;
  domain?: string;
  expires?: Date;
};

export function authCookieOptions<T extends AuthCookieOptions>(options: T = {} as T) {
  const localHttp = process.env.AUTH_COOKIE_MODE === "local-http";
  return {
    ...options,
    sameSite: localHttp ? "lax" as const : "none" as const,
    secure: !localHttp,
    httpOnly: true,
  };
}
