const LAST_WHATSAPP_CONTACT_KEY = 'eli_last_whatsapp_contact'
const LAST_MESSAGING_CONTEXT_KEY = 'eli_last_messaging_context'

const resolveRecipientName = (rawName: string): string => {
  const incoming = (rawName || '').trim()
  const normalized = incoming.toLowerCase()
  const pronouns = new Set(['him', 'her', 'them', 'that guy', 'that girl', 'that person', 'us'])

  if (!incoming) {
    throw new Error('Recipient name is missing.')
  }

  if (pronouns.has(normalized)) {
    const last = (localStorage.getItem(LAST_WHATSAPP_CONTACT_KEY) || '').trim()
    if (!last) {
      throw new Error('I need a contact name first. Say: "Send WhatsApp message to <name>".')
    }
    return last
  }

  return incoming
}

const resolveAppName = (rawAppName: string): string => {
  const normalized = (rawAppName || '').trim().toLowerCase()
  if (!normalized) return 'whatsapp'

  const aliases: Record<string, string> = {
    wa: 'whatsapp',
    whatsapp: 'whatsapp',
    telegram: 'telegram',
    tg: 'telegram',
    discord: 'discord',
    slack: 'slack',
    teams: 'teams',
    'microsoft teams': 'teams',
    messenger: 'messenger',
    signal: 'signal',
    instagram: 'instagram'
  }

  return aliases[normalized] || normalized
}

const APP_WINDOW_TITLES: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
  teams: 'Microsoft Teams',
  messenger: 'Messenger',
  signal: 'Signal',
  instagram: 'Instagram'
}

const runGhostSequenceOrThrow = async (actions: any[], label: string) => {
  const ok = await window.electron.ipcRenderer.invoke('ghost-sequence', actions)
  if (!ok) throw new Error(`UI automation failed at: ${label}`)
}

const openMessagingAppOrThrow = async (appName: string) => {
  const resolvedApp = resolveAppName(appName)
  const result = await window.electron.ipcRenderer.invoke('open-app', resolvedApp)
  if (!result?.success) {
    throw new Error(result?.error || `Could not open ${resolvedApp}.`)
  }
}

const focusChatFromSearch = async (recipient: string, windowTitle: string) => {
  await runGhostSequenceOrThrow(
    [
      { type: 'focus-window', title: windowTitle },
      { type: 'press', key: 'f', modifiers: ['control'] },
      { type: 'wait', ms: 450 },
      { type: 'press', key: 'a', modifiers: ['control'] },
      { type: 'press', key: 'backspace' },
      { type: 'type', text: recipient },
      { type: 'wait', ms: 850 },
      { type: 'press', key: 'down' },
      { type: 'wait', ms: 150 },
      { type: 'press', key: 'enter' },
      { type: 'wait', ms: 500 }
    ],
    'search-chat'
  )
}

const focusChatFromNewChat = async (recipient: string, windowTitle: string) => {
  await runGhostSequenceOrThrow(
    [
      { type: 'focus-window', title: windowTitle },
      { type: 'press', key: 'n', modifiers: ['control'] },
      { type: 'wait', ms: 600 },
      { type: 'press', key: 'a', modifiers: ['control'] },
      { type: 'press', key: 'backspace' },
      { type: 'type', text: recipient },
      { type: 'wait', ms: 800 },
      { type: 'press', key: 'down' },
      { type: 'press', key: 'enter' },
      { type: 'wait', ms: 450 }
    ],
    'new-chat'
  )
}

const focusConversationByApp = async (appName: string, recipient: string) => {
  const resolvedApp = resolveAppName(appName)
  const windowTitle = APP_WINDOW_TITLES[resolvedApp] || resolvedApp

  if (resolvedApp === 'whatsapp') {
    try {
      await focusChatFromSearch(recipient, windowTitle)
      return
    } catch {
      await focusChatFromNewChat(recipient, windowTitle)
      return
    }
  }

  if (resolvedApp === 'telegram' || resolvedApp === 'discord' || resolvedApp === 'slack') {
    await runGhostSequenceOrThrow(
      [
        { type: 'focus-window', title: windowTitle },
        { type: 'press', key: 'k', modifiers: ['control'] },
        { type: 'wait', ms: 450 },
        { type: 'press', key: 'a', modifiers: ['control'] },
        { type: 'press', key: 'backspace' },
        { type: 'type', text: recipient },
        { type: 'wait', ms: 700 },
        { type: 'press', key: 'enter' },
        { type: 'wait', ms: 350 }
      ],
      `${resolvedApp}-search`
    )
    return
  }

  if (resolvedApp === 'teams') {
    await runGhostSequenceOrThrow(
      [
        { type: 'focus-window', title: windowTitle },
        { type: 'press', key: 'e', modifiers: ['control'] },
        { type: 'wait', ms: 450 },
        { type: 'press', key: 'a', modifiers: ['control'] },
        { type: 'press', key: 'backspace' },
        { type: 'type', text: recipient },
        { type: 'wait', ms: 700 },
        { type: 'press', key: 'down' },
        { type: 'press', key: 'enter' },
        { type: 'wait', ms: 350 }
      ],
      'teams-search'
    )
  }
}

const sendMessagePayload = async (message: string, windowTitle: string, filePath?: string) => {
  if (filePath) {
    const copied = await window.electron.ipcRenderer.invoke('copy-file-to-clipboard', filePath)
    if (!copied) throw new Error('Could not copy attachment to clipboard.')

    await runGhostSequenceOrThrow(
      [
        { type: 'focus-window', title: windowTitle },
        { type: 'click-at-relative', x: 50, y: 87 },
        { type: 'press', key: 'v', modifiers: ['control'] },
        { type: 'wait', ms: 2800 },
        { type: 'type', text: message },
        { type: 'press', key: 'enter' }
      ],
      'send-attachment'
    )
    return
  }

  await runGhostSequenceOrThrow(
    [
      { type: 'focus-window', title: windowTitle },
      { type: 'click-at-relative', x: 50, y: 87 },
      { type: 'paste', text: message },
      { type: 'wait', ms: 400 },
      { type: 'press', key: 'enter' }
    ],
    'send-text'
  )
}

const resolveRecipientForApp = (appName: string, rawRecipient?: string): string => {
  const incoming = (rawRecipient || '').trim()
  if (incoming) {
    const normalized = incoming.toLowerCase()
    const pronouns = new Set(['him', 'her', 'them', 'that guy', 'that girl', 'that person', 'us'])
    if (!pronouns.has(normalized)) return incoming
  }

  const saved = localStorage.getItem(LAST_MESSAGING_CONTEXT_KEY)
  if (!saved) {
    throw new Error(`I need a contact name first. Say: "message <name> on ${resolveAppName(appName)}".`)
  }

  try {
    const parsed = JSON.parse(saved)
    if (parsed?.recipient) return parsed.recipient
  } catch {
    // ignore parse failure
  }

  throw new Error(`I need a contact name first. Say: "message <name> on ${resolveAppName(appName)}".`)
}

export const sendMessageOnApp = async (
  appName: string,
  recipient: string,
  message: string,
  filePath?: string
) => {
  try {
    const resolvedApp = resolveAppName(appName)
    const target = resolveRecipientForApp(resolvedApp, recipient)

    const windowTitle = APP_WINDOW_TITLES[resolvedApp] || resolvedApp

    await openMessagingAppOrThrow(resolvedApp)
    await focusConversationByApp(resolvedApp, target)
    await sendMessagePayload(message, windowTitle, filePath)

    localStorage.setItem(
      LAST_MESSAGING_CONTEXT_KEY,
      JSON.stringify({
        app: resolvedApp,
        recipient: target
      })
    )

    if (resolvedApp === 'whatsapp') {
      localStorage.setItem(LAST_WHATSAPP_CONTACT_KEY, target)
    }

    return `Message sent to ${target} on ${resolvedApp}.`
  } catch (error: any) {
    return `Failed to send message on ${resolveAppName(appName)}: ${error?.message || 'Unknown error.'}`
  }
}

export const sendWhatsAppMessage = async (name: string, message: string, filePath?: string) => {
  const recipient = resolveRecipientName(name)
  return sendMessageOnApp('whatsapp', recipient, message, filePath)
}

export const scheduleWhatsAppMessage = async (
  name: string,
  message: string,
  delayMinutes: number,
  filePath?: string
) => {
  const recipient = resolveRecipientName(name)

  if (!delayMinutes || delayMinutes <= 0) {
    return await sendWhatsAppMessage(recipient, message, filePath)
  }

  setTimeout(() => {
    window.electron.ipcRenderer.invoke('ghost-sequence', [{ type: 'type', text: '' }])
    sendWhatsAppMessage(recipient, message, filePath)
  }, delayMinutes * 60 * 1000)

  return `Scheduled. I will send the message to ${recipient} in ${delayMinutes} minutes.`
}
