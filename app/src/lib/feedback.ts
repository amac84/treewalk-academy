export type FeedbackSubmission = {
  message: string
  route: string
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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: payload.message.trim(),
      route: payload.route,
    }),
  })

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
