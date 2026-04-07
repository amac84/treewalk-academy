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

export async function submitFeedback(payload: FeedbackSubmission): Promise<FeedbackResponse> {
  const endpoint = (import.meta.env.VITE_FEEDBACK_FUNCTION_URL as string | undefined) ?? DEFAULT_FUNCTION_PATH

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
        body: form,
      })
    } else {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
