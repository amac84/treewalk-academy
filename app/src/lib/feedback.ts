import { getAppSettings } from './appSettings'

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
  const raw = getAppSettings().feedbackFunctionUrl
  if (!raw) {
    return DEFAULT_FUNCTION_PATH
  }
  return normalizeFeedbackEndpoint(raw)
}

/** Supabase’s gateway expects the anon (publishable) key on function calls from the browser. */
function supabaseInvokeHeaders(): Record<string, string> {
  const key = getAppSettings().supabaseAnonKey
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
      error: import.meta.env.DEV
        ? 'Feedback is not wired locally. Set feedbackFunctionUrl in app/public/app-settings.json to your hosted feedback URL.'
        : 'Feedback is not available in this build. Your team needs to turn on the feedback connection in hosting settings.',
    }
  }

  if (typeof window !== 'undefined') {
    try {
      if (new URL(endpoint).origin === window.location.origin) {
        return {
          success: false,
          error: import.meta.env.DEV
            ? 'feedbackFunctionUrl points at this site instead of your feedback API. Copy the function URL from your backend dashboard.'
            : 'Feedback is pointed at the wrong address. Ask your administrator to fix the feedback URL.',
        }
      }
    } catch {
      return {
        success: false,
        error: import.meta.env.DEV
          ? 'feedbackFunctionUrl is not a valid URL. Use a full https://… link from your backend dashboard.'
          : 'Feedback address is invalid. Ask your administrator to check configuration.',
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
      error: 'Could not reach the feedback service. Check your connection and try again.',
    }
  }

  const text = await response.text()
  const rawResult = parseFeedbackJson(text)

  if (import.meta.env.DEV) {
    console.debug('[feedback]', response.status, endpoint, rawResult ?? text.slice(0, 200))
  }

  if (!response.ok) {
    if (rawResult?.error) {
      return { success: false, error: rawResult.error }
    }

    if (response.status === 404 && feedbackEndpointUsesDefaultUrl(endpoint)) {
      return {
        success: false,
        error: import.meta.env.DEV
          ? 'Feedback endpoint not found. Set feedbackFunctionUrl in app/public/app-settings.json and restart the dev server.'
          : 'Feedback could not be sent — the service may not be deployed yet.',
      }
    }

    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        error: import.meta.env.DEV
          ? 'Feedback was rejected (unauthorized). Check auth settings on the feedback function.'
          : 'Feedback could not be sent. You may need to sign in, or your team must adjust permissions.',
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
      const hasAnon = Boolean(getAppSettings().supabaseAnonKey)
      if (needsSupabaseHeaders && !hasAnon) {
        return {
          success: false,
          error: import.meta.env.DEV
            ? 'Missing supabaseAnonKey for this feedback URL. Add it to app/public/app-settings.json.'
            : 'Feedback could not be sent. Your team may need to add the public app key to hosting environment variables.',
        }
      }
      return {
        success: false,
        error: import.meta.env.DEV
          ? 'Server refused the feedback request (405). Confirm feedbackFunctionUrl is the full function URL from your backend dashboard.'
          : 'Feedback could not be sent. Your team should verify the feedback URL and latest deploy.',
      }
    }

    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 160)
    const detail =
      import.meta.env.DEV && snippet
        ? ` (${response.status}: ${snippet})`
        : import.meta.env.DEV
          ? ` (${response.status})`
          : ''
    return {
      success: false,
      error: import.meta.env.DEV
        ? `Could not submit feedback${detail}.`
        : 'Could not submit feedback. Please try again later or contact your team.',
    }
  }

  if (!rawResult) {
    return { success: false, error: 'The feedback service returned an unexpected response.' }
  }

  return {
    success: Boolean(rawResult.success),
    ticketId: rawResult.ticketId,
    ticketUrl: rawResult.ticketUrl,
    error: rawResult.error,
  }
}
