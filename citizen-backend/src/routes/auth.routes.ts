import { Router } from "express";
import { demoLogin, login, logout, me, refresh, register } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/require-auth";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/async-handler";
import { demoLoginRequestSchema, loginRequestSchema, refreshRequestSchema, registerRequestSchema } from "../validators/auth.validators";

export const authRouter = Router();

authRouter.post("/register", validate(registerRequestSchema), asyncHandler(register));
authRouter.post("/login", validate(loginRequestSchema), asyncHandler(login));
authRouter.post("/demo/login", validate(demoLoginRequestSchema), asyncHandler(demoLogin));
authRouter.post("/refresh", validate(refreshRequestSchema), asyncHandler(refresh));
authRouter.post("/logout", validate(refreshRequestSchema), asyncHandler(logout));
authRouter.get("/me", requireAuth, asyncHandler(me));
