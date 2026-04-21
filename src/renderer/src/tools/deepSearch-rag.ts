export const runDeepResearch = async (query: string): Promise<string> => {
  try {
    window.dispatchEvent(new CustomEvent('deep-research-start', { detail: { query } }))

    const secureKeys = await window.electron.ipcRenderer.invoke('secure-get-keys').catch(() => null)
    const tavilyKey = secureKeys?.tavilyKey || localStorage.getItem('eli_tailvy_api_key') || ''
    const notionKey = secureKeys?.notionKey || localStorage.getItem('eli_notion_api_key') || ''
    const notionDbId = localStorage.getItem('eli_notion_db_id') || ''
    const groqKey = secureKeys?.groqKey || localStorage.getItem('eli_groq_api_key') || ''

    const result = await window.electron.ipcRenderer.invoke('execute-deep-research', {
      query,
      tavilyKey,
      notionKey,
      notionDbId,
      groqKey
    })

    if (result.success) {
      window.dispatchEvent(
        new CustomEvent('deep-research-done', {
          detail: { success: true, summary: result.summary }
        })
      )
      return `✅ Research complete. URL: ${result.url}. Here is a summary of the data so you can inform the user: ${result.summary}`
    }

    window.dispatchEvent(new CustomEvent('deep-research-done', { detail: { success: false } }))
    return `❌ Research failed: ${result.error}`
  } catch (error) {
    return `❌ System failure: ${String(error)}`
  }
}

export const runReadNotion = async (): Promise<string> => {
  try {
    const secureKeys = await window.electron.ipcRenderer.invoke('secure-get-keys').catch(() => null)
    const notionKey = secureKeys?.notionKey || localStorage.getItem('eli_notion_api_key') || ''
    const notionDbId = localStorage.getItem('eli_notion_db_id') || ''

    const result = await window.electron.ipcRenderer.invoke('read-notion-reports', {
      notionKey,
      notionDbId
    })

    return result.success
      ? `Here are the latest Notion reports:\n${result.data}`
      : `Failed to read Notion: ${result.error}`
  } catch (error) {
    return `❌ System failure: ${String(error)}`
  }
}
