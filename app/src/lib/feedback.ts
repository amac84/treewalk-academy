export type FeedbackSubmission = {
  message: string
  route: string
  image?: File | null
}

type FeedbackResponse = {
  success: boolean
  ticketId?: string
  ticketUrl?: string
  error?: string
}

const DEFAULT_FUNCTION_PATH = '/functions/v1/create-linear-ticket'

function parseFeedbackJson(text: string): FeedbackResponse | null {
  if (!text.trim()) {
    return null
  }
  try {
    return JSON.parse(text) as FeedbackResponse
  } catch {
    return null
  }
}

function feedbackEndpointUsesDefaultUrl(endpoint: string): boolean {
  return endpoint === DEFAULT_FUNCTION_PATH || !/^https?:\/\//i.test(endpoint.trim())
}

/** Strip trailing slash so POST is not redirected (some stacks turn that into GET → 405). */
function normalizeFeedbackEndpoint(url: string): string {
  const t = url.trim()
  if (!t) {
    return DEFAULT_FUNCTION_PATH
  }
  return t.replace(/\/+$/, '') || t
}

function resolveFeedbackEndpoint(): string {
  const raw = (import.meta.env.VITE_FEEDBACK_FUNCTION_URL as string | undefined)?.trim()
  if (!raw) {
    return DEFAULT_FUNCTION_PATH
  }
  return normalizeFeedbackEndpoint(raw)
}

/** Supabase’s gateway expects the anon (publishable) key on function calls from the browser. */
function supabaseInvokeHeaders(): Record<string, string> {
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
  if (!key) {
    return {}
  }
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'X-Client-Info': 'treewalk-academy-feedback',
  }
}

export async function submitFeedback(payload: FeedbackSubmission): Promise<FeedbackResponse> {
  const endpoint = resolveFeedbackEndpoint()

  if (typeof window !== 'undefined' && feedbackEndpointUsesDefaultUrl(endpoint)) {
    return {
      success: false,
      error: import.meta.env.PROD
        ? 'Feedback URL is missing in this build. In Cloudflare Pages → Settings → Environment variables, set VITE_FEEDBACK_FUNCTION_URL to the full https://…supabase.co/functions/v1/create-linear-ticket URL (Production and Preview if needed), plus VITE_SUPABASE_ANON_KEY, then redeploy. Vite only reads these at build time.'
        : 'Set VITE_FEEDBACK_FUNCTION_URL in app/.env to your full Supabase function URL (see .env.example). Relative /functions/… only works if something proxies to Supabase.',
    }
  }

  if (typeof window !== 'undefined') {
    try {
      if (new URL(endpoint).origin === window.location.origin) {
        return {
          success: false,
          error:
            'VITE_FEEDBACK_FUNCTION_URL points at this same website, not Supabase. Use the URL from Supabase Dashboard → Edge Functions → create-linear-ticket (copy).',
        }
      }
    } catch {
      return {
        success: false,
        error: 'VITE_FEEDBACK_FUNCTION_URL is not a valid URL. Copy the function URL from the Supabase dashboard.',
      }
    }
  }

  const trimmedMessage = payload.message.trim()
  const hasImage = Boolean(payload.image && payload.image.size > 0)

  let response: Response
  try {
    if (hasImage && payload.image) {
      const form = new FormData()
      form.append('message', trimmedMessage)
      form.append('route', payload.route)
      form.append('image', payload.image, payload.image.name || 'screenshot.png')
      response = await fetch(endpoint, {
        method: 'POST',
        headers: supabaseInvokeHeaders(),
        body: form,
      })
    } else {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...supabaseInvokeHeaders(),
        },
        body: JSON.stringify({
          message: trimmedMessage,
          route: payload.route,
        }),
      })
    }
  } catch {
    return {
      success: false,
      error: 'Network error — could not reach the feedback server. Check your connection and VITE_FEEDBACK_FUNCTION_URL.',
    }
  }

  const text = await response.text()
  const rawResult = parseFeedbackJson(text)

  if (import.meta.env.DEV) {
    // Helps debug 404 HTML / wrong endpoint without exposing details in production UI
    // eslint-disable-next-line no-console
    console.debug('[feedback]', response.status, endpoint, rawResult ?? text.slice(0, 200))
  }

  if (!response.ok) {
    if (rawResult?.error) {
      return { success: false, error: rawResult.error }
    }

    if (response.status === 404 && feedbackEndpointUsesDefaultUrl(endpoint)) {
      return {
        success: false,
        error:
          'Feedback endpoint not found. Set VITE_FEEDBACK_FUNCTION_URL to your Supabase function URL in app/.env (local) and Cloudflare Pages → Environment variables (production), then rebuild.',
      }
    }

    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        error:
          'Feedback was rejected (unauthorized). Deploy the Edge Function with public access for anonymous reports, or fix Supabase JWT settings.',
      }
    }

    if (response.status === 405) {
      const host = (() => {
        try {
          return new URL(endpoint).hostname
        } catch {
          return ''
        }
      })()
      const needsSupabaseHeaders = host.endsWith('.supabase.co')
      const hasAnon = Boolean((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim())
      if (needsSupabaseHeaders && !hasAnon) {
        return {
          success: false,
          error:
            'Supabase rejected the request (405). Add VITE_SUPABASE_ANON_KEY (same publishable/anon key as the rest of the app) to Cloudflare Pages environment variables and rebuild.',
        }
      }
      return {
        success: false,
        error:
          'Server refused POST (405). Confirm VITE_FEEDBACK_FUNCTION_URL is the full Supabase function URL (Dashboard → Edge Functions → copy). If it is, verify the function name and that the latest deploy finished.',
      }
    }

    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 160)
    return {
      success: false,
      error: snippet
        ? `Could not submit feedback (HTTP ${response.status}): ${snippet}`
        : `Could not submit feedback (HTTP ${response.status}).`,
    }
  }

  if (!rawResult) {
    return { success: false, error: 'Invalid JSON response from feedback server.' }
  }

  return {
    success: Boolean(rawResult.success),
    ticketId: rawResult.ticketId,
    ticketUrl: rawResult.ticketUrl,
    error: rawResult.error,
  }
}
