import type { Request, Response, NextFunction } from 'express';

// Single demo user — no real auth in this prototype
export const DEMO_USER_ID = 'demo-user';

export function requireAuth(_req: Request, _res: Response, next: NextFunction) {
  // Always pass-through in demo mode
  next();
}

export function getCurrentUserId(_req: Request): string {
  return DEMO_USER_ID;
}
