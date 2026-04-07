const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type CreateLinearIssueResult = {
  id: string
  identifier: string
  title: string
  url?: string | null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed.' }, 405)
  }

  const linearApiKey = Deno.env.get('LINEAR_API_KEY')
  const linearTeamId = Deno.env.get('LINEAR_TEAM_ID')
  const linearProjectId = Deno.env.get('LINEAR_PROJECT_ID')

  if (!linearApiKey || !linearTeamId) {
    return jsonResponse(
      { success: false, error: 'Linear integration is not configured on the server.' },
      500,
    )
  }

  const payload = await request.json().catch(() => null) as { message?: unknown; route?: unknown } | null
  const message = typeof payload?.message === 'string' ? payload.message.trim() : ''
  const route = typeof payload?.route === 'string' ? payload.route.trim() : 'unknown-route'

  if (!message) {
    return jsonResponse({ success: false, error: 'Message is required.' }, 400)
  }

  if (message.length > 500) {
    return jsonResponse({ success: false, error: 'Message is too long.' }, 400)
  }

  const title = buildIssueTitle(message)
  const description = buildIssueDescription({ message, route })

  const mutation = `
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
  `

  const variables = {
    input: {
      title,
      description,
      teamId: linearTeamId,
      projectId: linearProjectId || undefined,
    },
  }

  const linearResponse = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: linearApiKey,
    },
    body: JSON.stringify({
      query: mutation,
      variables,
    }),
  })

  const linearPayload = await linearResponse.json().catch(() => null) as
    | {
        data?: {
          issueCreate?: {
            success?: boolean
            issue?: CreateLinearIssueResult
          }
        }
        errors?: Array<{ message?: string }>
      }
    | null

  if (!linearResponse.ok || linearPayload?.errors?.length) {
    const errorMessage = linearPayload?.errors?.[0]?.message ?? 'Linear request failed.'
    return jsonResponse({ success: false, error: errorMessage }, 502)
  }

  const issue = linearPayload?.data?.issueCreate?.issue
  if (!linearPayload?.data?.issueCreate?.success || !issue) {
    return jsonResponse({ success: false, error: 'Linear did not create a ticket.' }, 502)
  }

  return jsonResponse({
    success: true,
    ticketId: issue.identifier,
    ticketUrl: issue.url ?? undefined,
  })
})

function buildIssueTitle(message: string): string {
  const normalizedMessage = message.replace(/\s+/g, ' ').trim()
  const firstSentence = normalizedMessage.split(/[.!?]/)[0]?.trim() ?? normalizedMessage
  const base = firstSentence || normalizedMessage
  const safeTitle = base.slice(0, 72).trim()
  return safeTitle ? `Bug report: ${safeTitle}` : 'Bug report from in-app feedback bar'
}

function buildIssueDescription({ message, route }: { message: string; route: string }): string {
  return [
    '## Reported from in-app feedback bar',
    '',
    `- Route: \`${route}\``,
    `- Submitted at: ${new Date().toISOString()}`,
    '',
    '## Bug details',
    message,
  ].join('\n')
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}
