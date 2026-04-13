/**
 * OpenAI model IDs used by this function (not secrets — safe to commit).
 * Change the constant and redeploy to switch models. API keys stay in Supabase secrets.
 */
export const COURSE_METADATA_MODEL =
  Deno.env.get('OPENAI_COURSE_METADATA_MODEL')?.trim() || 'gpt-4o-mini'

/**
 * Quiz generation benefits from a stronger model than metadata drafting.
 * Override with OPENAI_COURSE_QUIZ_MODEL in Edge Function secrets when needed.
 */
export const COURSE_QUIZ_MODEL =
  Deno.env.get('OPENAI_COURSE_QUIZ_MODEL')?.trim() || 'gpt-4o'
