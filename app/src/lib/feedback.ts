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

export async function submitFeedback(payload: FeedbackSubmission): Promise<FeedbackResponse> {
  const endpoint = (import.meta.env.VITE_FEEDBACK_FUNCTION_URL as string | undefined) ?? DEFAULT_FUNCTION_PATH

  const trimmedMessage = payload.message.trim()
  const hasImage = Boolean(payload.image && payload.image.size > 0)

  let response: Response
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

  const rawResult = (await response.json().catch(() => null)) as FeedbackResponse | null
  if (!response.ok) {
    return {
      success: false,
      error: rawResult?.error ?? 'Unable to submit feedback right now.',
    }
  }

  return {
    success: Boolean(rawResult?.success),
    ticketId: rawResult?.ticketId,
    ticketUrl: rawResult?.ticketUrl,
    error: rawResult?.error,
  }
}
