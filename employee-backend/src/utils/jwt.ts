import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";
export interface AccessTokenPayload extends JwtPayload { userId: string; role: "CITIZEN" | "OFFICER" | "ADMIN"; }
export function verifyAccessToken(token: string): AccessTokenPayload { return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload; }
