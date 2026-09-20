import { z } from "zod";

const email = z.string().trim().email().max(320).transform((value) => value.toLowerCase());
const password = z.string()
  .min(12, "Password must contain at least 12 characters")
  .max(128, "Password must contain at most 128 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character");
const fullName = z.string().trim().min(2).max(200).transform((value) => value.replace(/\s+/g, " "));
const phone = z.string().trim().min(7).max(30).transform((value) => value.replace(/[\s()-]/g, "")).refine(
  (value) => /^\+?[0-9]{7,15}$/.test(value),
  "Phone must contain 7 to 15 digits, optionally prefixed by +",
);
const demoMobile = z.string().trim().min(7).max(30).transform((value) => value.replace(/[^0-9]/g, "")).refine(
  (value) => /^\d{10}$/.test(value),
  "Demo mobile number must contain exactly 10 digits",
);
const dateOfBirth = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must use YYYY-MM-DD").refine(
  (value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)),
  "Date of birth must be a valid date",
).transform((value) => new Date(`${value}T00:00:00.000Z`));

const profileFields = z.object({
  fullName,
  phone: phone.optional(),
  dateOfBirth: dateOfBirth.optional(),
  address: z.string().trim().min(2).max(500).optional(),
  city: z.string().trim().min(2).max(100).optional(),
  state: z.string().trim().min(2).max(100).optional(),
  pincode: z.string().trim().regex(/^\d{6}$/, "Pincode must contain exactly 6 digits").optional(),
});

export const registerRequestSchema = z.object({
  body: profileFields.extend({ email, password }).strict(),
  params: z.object({}),
  query: z.object({}),
});

export const loginRequestSchema = z.object({
  body: z.object({ email, password: z.string().min(1).max(128) }).strict(),
  params: z.object({}),
  query: z.object({}),
});

export const demoLoginRequestSchema = z.object({
  body: z.object({ mobile: demoMobile, otp: z.string().trim().regex(/^\d{6}$/, "Demo OTP must contain exactly 6 digits") }).strict(),
  params: z.object({}),
  query: z.object({}),
});

export const refreshRequestSchema = z.object({
  body: z.object({ refreshToken: z.string().min(32).max(500) }).strict(),
  params: z.object({}),
  query: z.object({}),
});

export const updateProfileRequestSchema = z.object({
  body: profileFields.partial().strict().refine((value) => Object.keys(value).length > 0, "At least one profile field is required"),
  params: z.object({}),
  query: z.object({}),
});

export type RegisterRequestBody = z.infer<typeof registerRequestSchema>["body"];
export type LoginRequestBody = z.infer<typeof loginRequestSchema>["body"];
export type DemoLoginRequestBody = z.infer<typeof demoLoginRequestSchema>["body"];
export type RefreshRequestBody = z.infer<typeof refreshRequestSchema>["body"];
export type UpdateProfileRequestBody = z.infer<typeof updateProfileRequestSchema>["body"];
