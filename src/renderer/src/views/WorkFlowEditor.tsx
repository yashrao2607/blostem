import React, { useState, useCallback } from 'react'
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  ReactFlowProvider
} from 'reactflow'
import { Tooltip } from 'react-tooltip'
import 'reactflow/dist/style.css'
import 'react-tooltip/dist/react-tooltip.css'
import ToolNode, { getIcon } from '../components/ToolNode'
import ParameterEditorDrawer from '../components/ParameterEditorDrawer'
import MacroManagementMenu from '../components/MacroManagementMenu'
import {
  RiSave3Line,
  RiLayoutColumnLine,
  RiLayoutColumnFill,
  RiAddLine,
  RiPlayFill,
  RiCheckLine,
  RiSearchLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiBrainLine,
  RiStopFill,
  RiLoader4Line,
  RiFileTextLine,
  RiFlowChart
} from 'react-icons/ri'
import { useToastStore } from '@renderer/store/toast-store'

import { getMacroSequence } from '@renderer/code/macro-executor'
import {
  clickOnCoordinate,
  scrollScreen,
  setVolume,
  takeScreenshot
} from '@renderer/functions/keyboard-manager'
import { closeApp, openApp, performWebSearch } from '@renderer/functions/apps-manager-api'
import {
  scheduleWhatsAppMessage,
  sendMessageOnApp,
  sendWhatsAppMessage
} from '@renderer/functions/whatsapp-manager-api'
import { runTerminal } from '@renderer/functions/coding-manager-api'
import { draftEmail, readEmails, sendEmail } from '@renderer/functions/gmail-manager-api'

const CATEGORIZED_TOOLS = {
  TRIGGERS: [
    { name: 'TRIGGER', description: 'Starts the workflow.', parameters: {} },
    { name: 'WAIT', description: 'Pauses execution.', parameters: { properties: { milliseconds: { type: 'NUMBER', description: 'Delay in ms (e.g. 2000)' } } } }
  ],
  SYSTEM: [
    { name: 'open_app', description: 'Launch desktop app.', parameters: { properties: { app_name: { type: 'STRING' } } } },
    { name: 'close_app', description: 'Force close an app.', parameters: { properties: { app_name: { type: 'STRING' } } } },
    { name: 'set_volume', description: 'Change system volume (0-100).', parameters: { properties: { level: { type: 'NUMBER' } } } }
  ],
  AUTOMATION: [
    { name: 'ghost_type', description: 'Type text via keyboard.', parameters: { properties: { text: { type: 'STRING' } } } },
    { name: 'press_shortcut', description: 'e.g. key: "c", modifiers: ["control"].', parameters: { properties: { key: { type: 'STRING' }, modifiers: { type: 'ARRAY', items: { type: 'STRING' } } } } },
    { name: 'click_on_screen', description: 'Click on specific X, Y coordinates.', parameters: { properties: { x: { type: 'NUMBER', description: 'X Coordinate (e.g. 960)' }, y: { type: 'NUMBER', description: 'Y Coordinate (e.g. 540)' } } } },
    { name: 'run_terminal', description: 'Execute CLI command.', parameters: { properties: { command: { type: 'STRING' }, path: { type: 'STRING' } } } }
  ],
  WEB_INTELLIGENCE: [
    { name: 'google_search', description: 'Open a URL or search.', parameters: { properties: { query: { type: 'STRING' } } } },
    { name: 'deep_research', description: 'AI Web scrape & Notion report.', parameters: { properties: { query: { type: 'STRING' } } } },
    { name: 'deploy_wormhole', description: 'Exposes local server port to the internet.', parameters: { properties: { port: { type: 'NUMBER', description: 'e.g. 3000' } } } },
    { name: 'close_wormhole', description: 'Closes the public wormhole.', parameters: {} }
  ],
  COMMUNICATION: [
    { name: 'send_email', description: 'Send an email instantly.', parameters: { properties: { to: { type: 'STRING' }, subject: { type: 'STRING' }, body: { type: 'STRING' } } } },
    { name: 'read_emails', description: 'Read latest unread emails.', parameters: { properties: { max_results: { type: 'NUMBER', description: 'Default is 5' } } } },
    { name: 'draft_email', description: 'Create an email draft.', parameters: { properties: { to: { type: 'STRING' }, subject: { type: 'STRING' }, body: { type: 'STRING' } } } }
  ],
  MOBILE_LINK: [
    {
      name: 'send_app_message',
      description: 'Send message/file in desktop messaging app (WhatsApp/Telegram/Discord/Slack/Teams).',
      parameters: {
        properties: {
          app_name: { type: 'STRING' },
          recipient: { type: 'STRING' },
          message: { type: 'STRING' },
          file_path: { type: 'STRING', description: 'Optional' }
        }
      }
    },
    { name: 'open_mobile_app', description: 'Requires Android package name.', parameters: { properties: { package_name: { type: 'STRING' } } } },
    { name: 'toggle_mobile_hardware', description: 'Toggle Wifi/Bluetooth.', parameters: { properties: { setting: { type: 'STRING' }, state: { type: 'BOOLEAN' } } } },
    { name: 'send_whatsapp', description: 'Send instant message.', parameters: { properties: { name: { type: 'STRING' }, message: { type: 'STRING' }, file_path: { type: 'STRING', description: 'Optional' } } } },
    { name: 'schedule_whatsapp', description: 'Schedule a WhatsApp message.', parameters: { properties: { name: { type: 'STRING' }, message: { type: 'STRING' }, delay_minutes: { type: 'NUMBER' }, file_path: { type: 'STRING', description: 'Optional' } } } }
  ]
}

const CATEGORY_COLORS: Record<string, string> = {
  TRIGGERS: 'text-red-400 border-red-500/20',
  SYSTEM: 'text-blue-400 border-blue-500/20',
  AUTOMATION: 'text-yellow-400 border-yellow-500/20',
  WEB_INTELLIGENCE: 'text-cyan-400 border-cyan-500/20',
  COMMUNICATION: 'text-orange-400 border-orange-500/20',
  MOBILE_LINK: 'text-indigo-400 border-indigo-500/20'
}

const ALL_TOOLS = Object.values(CATEGORIZED_TOOLS).flat()
const nodeTypes = { customTool: ToolNode }

function Editor() {
  const [nodes, setNodes] = useState<any[]>([])
  const [edges, setEdges] = useState<any[]>([])
  const [workflowName, setWorkflowName] = useState('New ELI Macro')
  const [description, setDescription] = useState('Custom Macro')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [saveFlash, setSaveFlash] = useState(false)
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [isRunning, setIsRunning] = useState(false)
  const [runProgress, setRunProgress] = useState<{ current: number; total: number; step: string } | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  const openParameterEditor = useCallback((nodeId: string) => setSelectedNodeId(nodeId), [])

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const loadMacroToCanvas = (macro: any) => {
    setWorkflowName(macro.name)
    setDescription(macro.description)
    const rehydratedNodes = (macro.nodes || []).map((node: any) => ({
      ...node,
      data: { ...node.data, openParameterEditor }
    }))
    setNodes(rehydratedNodes)
    setEdges(macro.edges || [])
    setIsSaved(true)
  }

  const resetCanvas = () => {
    setWorkflowName('New ELI Macro')
    setDescription('Custom Macro')
    setNodes([])
    setEdges([])
    setIsSaved(false)
    setRunProgress(null)
  }

  const updateNodeInputs = useCallback((nodeId: string, updatedInputs: any, updatedComment: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, inputs: updatedInputs, comment: updatedComment } }
        }
        return node
      })
    )
  }, [])

  const onNodesChange = useCallback((changes: any) => setNodes((nds) => applyNodeChanges(changes, nds)), [])
  const onEdgesChange = useCallback((changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)), [])

  const onConnect = useCallback(
    (params: any) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'default',
            animated: true,
            style: { stroke: '#7c3aed', strokeWidth: 2, filter: 'drop-shadow(0 0 4px rgba(124,58,237,0.6))' }
          },
          eds
        )
      ),
    []
  )

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const toolName = event.dataTransfer.getData('application/reactflow')
      if (!toolName) return
      const toolSchema = ALL_TOOLS.find((t) => t.name === toolName)
      const position = { x: event.clientX - (isSidebarOpen ? 300 : 50), y: event.clientY - 100 }
      const newNode = {
        id: `${toolName}_${Date.now()}`,
        type: 'customTool',
        position,
        data: { tool: toolSchema, inputs: {}, comment: '', openParameterEditor }
      }
      setNodes((nds) => nds.concat(newNode))
    },
    [openParameterEditor, isSidebarOpen]
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const saveWorkflow = async () => {
    const sanitizedNodes = nodes.map((node) => {
      const cleanData = { ...node.data }
      delete cleanData.openParameterEditor
      return { ...node, data: cleanData }
    })
    try {
      const res = await (window as any).electron.ipcRenderer.invoke('save-workflow', {
        name: workflowName,
        description: description,
        nodes: sanitizedNodes,
        edges
      })
      if (res.success) {
        setIsSaved(true)
        setSaveFlash(true)
        setTimeout(() => setSaveFlash(false), 2000)
      }
    } catch (err) { }
  }

  const runMacroManually = async () => {
    if (isRunning) return
    setIsRunning(true)
    await saveWorkflow()
    const macroRes = await getMacroSequence(workflowName)
    if (!macroRes.success) {
      setIsRunning(false)
      setRunProgress(null)
      addToast(`Execution failed: ${macroRes.error}`, 'error')
      return
    }
    const totalSteps = macroRes.steps.length
    for (let i = 0; i < totalSteps; i++) {
      const step = macroRes.steps[i]
      setRunProgress({ current: i + 1, total: totalSteps, step: step.tool })
      try {
        if (step.tool === 'TRIGGER' || step.tool === 'TRIGGER_VOICE') {
        } else if (step.tool === 'WAIT') {
          await new Promise((resolve) => setTimeout(resolve, Number(step.args.milliseconds) || 1000))
        } else if (step.tool === 'set_volume') {
          await setVolume(Number(step.args.level))
        } else if (step.tool === 'open_app') {
          await openApp(step.args.app_name)
        } else if (step.tool === 'close_app') {
          await closeApp(step.args.app_name)
        } else if (step.tool === 'send_whatsapp') {
          await sendWhatsAppMessage(step.args.name, step.args.message, step.args.file_path)
        } else if (step.tool === 'send_app_message') {
          await sendMessageOnApp(
            step.args.app_name,
            step.args.recipient,
            step.args.message,
            step.args.file_path
          )
        } else if (step.tool === 'schedule_whatsapp') {
          await scheduleWhatsAppMessage(step.args.name, step.args.message, Number(step.args.delay_minutes), step.args.file_path)
        } else if (step.tool === 'google_search') {
          await performWebSearch(step.args.query)
        } else if (step.tool === 'run_terminal') {
          await runTerminal(step.args.command, step.args.path)
        } else if (step.tool === 'send_email') {
          await sendEmail(step.args.to, step.args.subject, step.args.body)
        } else if (step.tool === 'draft_email') {
          await draftEmail(step.args.to, step.args.subject, step.args.body)
        } else if (step.tool === 'read_emails') {
          await readEmails(Number(step.args.max_results) || 5)
        } else if (step.tool === 'deploy_wormhole') {
          await (window as any).electron.ipcRenderer.invoke('deploy-wormhole', Number(step.args.port))
        } else if (step.tool === 'close_wormhole') {
          await (window as any).electron.ipcRenderer.invoke('close-wormhole')
        } else if (step.tool === 'click_on_screen') {
          await clickOnCoordinate(Number(step.args.x), Number(step.args.y))
        } else if (step.tool === 'scroll_screen') {
          await scrollScreen(step.args.direction, Number(step.args.amount))
        } else if (step.tool === 'ghost_type') {
          await (window as any).electron.ipcRenderer.invoke('ghost-sequence', [{ type: 'type', text: step.args.text }])
        } else if (step.tool === 'press_shortcut') {
          let safeModifiers: string[] = []
          if (step.args.modifiers) {
            if (Array.isArray(step.args.modifiers)) {
              safeModifiers = step.args.modifiers
            } else if (typeof step.args.modifiers === 'string') {
              safeModifiers = step.args.modifiers.split(',').map((m: string) => m.trim()).filter(Boolean)
            }
          }
          await (window as any).electron.ipcRenderer.invoke('ghost-sequence', [{ type: 'press', key: step.args.key, modifiers: safeModifiers }])
        } else if (step.tool === 'take_screenshot') {
          await takeScreenshot()
        }
      } catch (stepError) {
        setIsRunning(false)
        setRunProgress(null)
        addToast(`Macro halted at step ${i + 1}: ${step.tool}`, 'error')
        return
      }
    }
    setIsRunning(false)
    setRunProgress({ current: totalSteps, total: totalSteps, step: 'COMPLETE' })
    setTimeout(() => setRunProgress(null), 3000)
  }

  // Filter tools by sidebar search
  const filteredTools = Object.entries(CATEGORIZED_TOOLS).map(([category, tools]) => ({
    category,
    tools: sidebarSearch
      ? tools.filter(t => t.name.toLowerCase().includes(sidebarSearch.toLowerCase()) || t.description.toLowerCase().includes(sidebarSearch.toLowerCase()))
      : tools
  })).filter(g => g.tools.length > 0)

  return (
    <div className="flex h-full w-full bg-[#040407] relative overflow-hidden">

      {/* â”€â”€ Sidebar â”€â”€ */}
      <div
        className={`fixed top-[52px] left-0 h-[calc(100vh-52px)] bg-[#08080e]/95 backdrop-blur-xl border-r border-white/[0.06] flex flex-col transition-all duration-300 ease-in-out z-40 ${isSidebarOpen ? 'w-[290px] opacity-100' : 'w-0 opacity-0'}`}
      >
        {isSidebarOpen && (
          <div className="flex flex-col h-full">
            {/* Sidebar Header */}
            <div className="px-4 py-4 border-b border-white/[0.05] shrink-0">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-6 h-6 rounded-lg bg-violet-600/15 border border-violet-500/25 flex items-center justify-center">
                  <RiFlowChart size={12} className="text-violet-400" />
                </div>
                <h2 className="text-[10px] font-black tracking-[0.25em] text-violet-400/80 uppercase">
                  Module Library
                </h2>
              </div>
              {/* Search */}
              <div className="relative">
                <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" size={13} />
                <input
                  type="text"
                  placeholder="Search modules..."
                  value={sidebarSearch}
                  onChange={e => setSidebarSearch(e.target.value)}
                  className="w-full bg-white/[0.02] border border-white/[0.06] rounded-lg text-[11px] py-2 pl-8 pr-3 text-zinc-300 outline-none focus:border-violet-500/30 transition-colors placeholder:text-zinc-700 font-medium"
                />
              </div>
            </div>

            {/* Tool Categories */}
            <div className="p-3 flex flex-col gap-1 flex-1 overflow-y-auto scrollbar-none">
              {filteredTools.map(({ category, tools }) => {
                const colorClass = CATEGORY_COLORS[category] || 'text-zinc-400 border-zinc-500/20'
                const isCollapsed = collapsedCategories.has(category)
                return (
                  <div key={category} className="mb-1">
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors cursor-pointer group"
                    >
                      {isCollapsed
                        ? <RiArrowRightSLine size={14} className="text-zinc-600 group-hover:text-zinc-400" />
                        : <RiArrowDownSLine size={14} className="text-zinc-600 group-hover:text-zinc-400" />
                      }
                      <span className={`text-[9px] font-black tracking-[0.2em] uppercase ${colorClass.split(' ')[0]}`}>
                        {category.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[9px] text-zinc-700 ml-auto font-mono">{tools.length}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="flex flex-col gap-0.5 ml-2 mt-0.5">
                        {tools.map((tool: any) => (
                          <div
                            key={tool.name}
                            className="flex items-center gap-2.5 p-2 bg-white/[0.01] border border-transparent rounded-lg cursor-grab hover:border-violet-500/20 hover:bg-violet-500/[0.03] transition-all duration-150 group/tool"
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData('application/reactflow', tool.name)}
                            data-tooltip-id="sidebar-tooltip"
                            data-tooltip-content={tool.description}
                          >
                            <div className="w-6 h-6 rounded-md bg-black/40 flex items-center justify-center border border-white/[0.04] shrink-0">
                              {getIcon(tool.name, 12)}
                            </div>
                            <span className="text-[10px] font-semibold text-zinc-500 group-hover/tool:text-zinc-200 tracking-wide transition-colors uppercase truncate">
                              {tool.name.replace(/_/g, ' ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar Toggle */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className={`absolute top-1/2 -translate-y-1/2 z-50 bg-[#0d0d14]/90 backdrop-blur-md border border-white/[0.06] border-l-0 p-2 rounded-r-xl text-zinc-600 hover:text-violet-400 transition-all duration-150 hover:bg-violet-500/[0.06] ${isSidebarOpen ? 'left-[290px]' : 'left-0'}`}
      >
        {isSidebarOpen ? <RiLayoutColumnLine size={16} /> : <RiLayoutColumnFill size={16} />}
      </button>

      {/* â”€â”€ Canvas Area â”€â”€ */}
      <div
        className={`grow flex flex-col relative transition-all duration-300 ease-in-out ${isSidebarOpen ? 'ml-[290px]' : 'ml-0'}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        {/* Top Toolbar */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2 bg-[#0a0a12]/90 backdrop-blur-xl border border-white/[0.06] rounded-xl px-3 py-2 shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
            <button
              onClick={resetCanvas}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.06] text-zinc-600 hover:text-zinc-200 hover:bg-white/[0.08] hover:border-white/[0.12] transition-all duration-150 cursor-pointer"
              data-tooltip-id="global-tooltip"
              data-tooltip-content="New Macro"
            >
              <RiAddLine size={15} />
            </button>

            <div className="w-px h-6 bg-white/[0.06]" />

            <MacroManagementMenu loadMacroToCanvas={loadMacroToCanvas} />

            <div className="w-px h-6 bg-white/[0.06]" />

            {/* Name + Description */}
            <div className="flex flex-col gap-0.5">
              <input
                type="text"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                className="bg-transparent border-none outline-none text-[12px] text-zinc-200 font-bold w-48 placeholder:text-zinc-700 tracking-wide"
                placeholder="Macro name..."
              />
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-transparent border-none outline-none text-[9px] text-zinc-600 font-mono w-48 placeholder:text-zinc-800 tracking-wider"
                placeholder="Description..."
              />
            </div>

            <div className="w-px h-6 bg-white/[0.06]" />

            {/* Run Button */}
            <button
              onClick={runMacroManually}
              disabled={isRunning || nodes.length === 0}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-bold tracking-wider transition-all duration-200 cursor-pointer border ${isRunning
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : nodes.length === 0
                    ? 'bg-white/[0.02] border-white/[0.04] text-zinc-700 cursor-not-allowed'
                    : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40'
                }`}
            >
              {isRunning
                ? <><RiLoader4Line size={13} className="animate-spin" /> RUNNING</>
                : <><RiPlayFill size={13} /> RUN</>
              }
            </button>

            {/* Save Button */}
            <button
              onClick={saveWorkflow}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-bold tracking-wider transition-all duration-200 cursor-pointer border ${saveFlash
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-violet-600/15 border-violet-500/25 text-violet-300 hover:bg-violet-600/25 hover:border-violet-500/40'
                }`}
            >
              {saveFlash ? <RiCheckLine size={13} /> : <RiSave3Line size={13} />}
              {saveFlash ? 'Saved' : 'Save'}
            </button>
          </div>

          {/* Right side stats */}
          <div className="flex items-center gap-2">
            {/* Execution Progress */}
            {runProgress && (
              <div className="flex items-center gap-2 bg-[#0a0a12]/90 backdrop-blur-xl border border-violet-500/20 rounded-xl px-3 py-2 shadow-[0_0_20px_rgba(124,58,237,0.1)]">
                <div className="w-20 h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${runProgress.step === 'COMPLETE' ? 'bg-emerald-400' : 'bg-violet-500'}`}
                    style={{ width: `${(runProgress.current / runProgress.total) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono text-zinc-500 tracking-wider">
                  {runProgress.step === 'COMPLETE' ? 'âœ“ DONE' : `${runProgress.current}/${runProgress.total}`}
                </span>
              </div>
            )}
            {/* Node Count */}
            <div className="flex items-center gap-2 bg-[#0a0a12]/90 backdrop-blur-xl border border-white/[0.06] rounded-xl px-3 py-2">
              <RiBrainLine size={13} className="text-violet-500" />
              <span className="text-[10px] font-mono text-zinc-500 tracking-wider">{nodes.length} nodes</span>
              <span className="text-[10px] text-zinc-700">|</span>
              <span className="text-[10px] font-mono text-zinc-500 tracking-wider">{edges.length} links</span>
            </div>
          </div>
        </div>

        {/* Empty State */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-[5]">
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-2xl bg-violet-500/5 border border-violet-500/10 flex items-center justify-center">
                <RiFlowChart size={32} className="text-violet-500/30" />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-violet-500/30 animate-ping" />
            </div>
            <h3 className="text-[13px] font-black tracking-[0.3em] text-zinc-600 uppercase mb-2">
              Empty Canvas
            </h3>
            <p className="text-[10px] text-zinc-700 font-mono tracking-wider max-w-xs text-center leading-relaxed">
              Drag modules from the sidebar to build your automation workflow. Connect them to define execution order.
            </p>
          </div>
        )}

        {/* ReactFlow Canvas */}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          className="bg-[#040407]"
        >
          <Background color="rgba(124,58,237,0.03)" gap={28} size={1} />
          <Controls className="react-flow__controls" />
        </ReactFlow>

        <Tooltip
          id="global-tooltip"
          place="top"
          style={{
            maxWidth: '220px',
            backgroundColor: '#0d0d14',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '10px',
            fontSize: '11px',
            color: '#a1a1aa',
            zIndex: 100
          }}
        />
        <Tooltip
          id="sidebar-tooltip"
          place="right"
          style={{
            maxWidth: '200px',
            backgroundColor: '#0d0d14',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '10px',
            fontSize: '10px',
            color: '#71717a',
            zIndex: 100
          }}
        />

        {selectedNodeId && (
          <ParameterEditorDrawer
            nodeData={nodes.find((n) => n.id === selectedNodeId)}
            updateNodeInputs={updateNodeInputs}
            closeEditor={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  )
}

export default function WorkFlowEditorView() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  )
}

