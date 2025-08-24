import { z } from 'zod';

export const Iso2CountrySchema = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/);

// Définir TagIdSchema avant tout usage (WizardStateSchema l'utilise)
export const TagIdSchema = z.enum([
  'GEAR_BACKPACK_DAYPACK',
  'GEAR_UNIVERSAL_ADAPTER',
  'GEAR_POWER_BANK',
  'GEAR_TRAVEL_BOTTLES',
  'GEAR_RAIN_PONCHO',
  'CLOTHING_THERMAL_LAYER',
  'ESSENTIALS_DOCUMENT_POUCH',
  'RISK_FIRST_AID_KIT',
  'RISK_ANTI_THEFT_LOCK',
  'RISK_MOSQUITO_REPELLENT',
]);

export const WizardStateSchema = z
  .object({
    destinationCountry: Iso2CountrySchema,
    marketplaceCountry: Iso2CountrySchema.optional(),
    dates: z.object({
      start: z.string().datetime(),
      end: z.string().datetime(),
    }),
    travelers: z.number().int().min(1).max(20),
    ages: z.array(z.number().int().min(0).max(120)).min(1),
    tags: z.array(TagIdSchema).max(6).optional(),
  })
  .refine((v) => v.ages.length === v.travelers, {
    message: "Le nombre d'âges doit correspondre au nombre de voyageurs",
    path: ['ages'],
  })
  .refine((v) => new Date(v.dates.start) <= new Date(v.dates.end), {
    message: 'La date de début doit être antérieure ou égale à la date de fin',
    path: ['dates', 'end'],
  });

export type WizardState = z.infer<typeof WizardStateSchema>;

export const ProductRecordSchema = z
  .object({
    label: z.string().min(1),
    asin: z.string().min(1),
    status: z.enum(['active', 'inactive']).default('active'),
    mustHave: z.boolean().default(false),
    priority: z.number().int().min(0).default(0),
    audience: z.enum(['child', 'adult', 'all']).default('all'),
    ageMin: z.number().int().min(0).max(120),
    ageMax: z.number().int().min(0).max(120),
    tags: z
      .array(
        z.enum([
          'GEAR_BACKPACK_DAYPACK',
          'GEAR_UNIVERSAL_ADAPTER',
          'GEAR_POWER_BANK',
          'GEAR_TRAVEL_BOTTLES',
          'GEAR_RAIN_PONCHO',
          'CLOTHING_THERMAL_LAYER',
          'ESSENTIALS_DOCUMENT_POUCH',
          'RISK_FIRST_AID_KIT',
          'RISK_ANTI_THEFT_LOCK',
          'RISK_MOSQUITO_REPELLENT',
        ]),
      )
      .max(6)
      .optional(),
  })
  .refine((p) => p.ageMin <= p.ageMax, {
    message: 'ageMin doit être ≤ ageMax',
    path: ['ageMax'],
  });

export type ProductRecord = z.infer<typeof ProductRecordSchema>;

export const ProductResponseSchema = z.object({
  label: z.string(),
  asin: z.string(),
  marketplace: Iso2CountrySchema,
  explain: z.array(z.string()),
});

export type ProductResponse = z.infer<typeof ProductResponseSchema>;

// OpenAI explain/tagging contracts

export const ExplainRequestSchema = z.object({
  destinationCountry: Iso2CountrySchema,
  marketplaceCountry: Iso2CountrySchema.optional(),
  groupAge: z.object({
    min: z.number().int().min(0).max(120),
    max: z.number().int().min(0).max(120),
  }),
  season: z.string().optional(),
  tripType: z.string().optional(),
  constraints: z.object({ maxTags: z.number().int().min(1).max(6), promptVersion: z.string() }),
});

export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;

export const ExplainResponseSchema = z.object({
  tags: z
    .array(
      z.object({
        id: TagIdSchema,
        score: z.number().min(0).max(1),
      }),
    )
    .max(6),
  meta: z.object({ promptVersion: z.string() }).optional(),
});

export type ExplainResponse = z.infer<typeof ExplainResponseSchema>;
