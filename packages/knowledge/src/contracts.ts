import { z } from 'zod'
import { CatalogKindSchema, SlugSchema } from '@ioteams/core'

export const SearchKnowledgeOptionsSchema = z.strictObject({
  query: z.string().max(2048), topK: z.number().int().min(1).max(50).default(8),
  maxContextChars: z.number().int().min(1).max(100_000).default(16_000),
  filters: z.strictObject({ kind: CatalogKindSchema.optional(), entityId: SlugSchema.optional(),
    professionId: SlugSchema.optional(), stackId: SlugSchema.optional(),
    professionalId: SlugSchema.optional(), teamId: SlugSchema.optional(),
  }).default({}),
})
export type SearchKnowledgeOptions = z.input<typeof SearchKnowledgeOptionsSchema>
