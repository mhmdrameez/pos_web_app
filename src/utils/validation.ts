import { z } from 'zod'

const indianPhoneRegex = /^[6-9]\d{9}$/

export const customerSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be under 100 characters'),
  phone: z
    .string()
    .min(1, 'Phone is required')
    .regex(indianPhoneRegex, 'Enter a valid 10-digit Indian mobile number'),
  email: z
    .string()
    .email('Enter a valid email')
    .optional()
    .or(z.literal('')),
})

export type CustomerFormData = z.infer<typeof customerSchema>

export const appSettingsSchema = z.object({
  businessName: z
    .string()
    .min(1, 'Business name is required')
    .max(100, 'Business name must be under 100 characters'),
})

export type AppSettingsFormData = z.infer<typeof appSettingsSchema>
