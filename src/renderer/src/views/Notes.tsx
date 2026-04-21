import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  RiStickyNoteLine,
  RiFileTextLine,
  RiMarkdownLine,
  RiAddLine,
  RiSave3Line,
  RiCloseLine,
  RiEditLine,
  RiCalendarLine
} from 'react-icons/ri'

interface Note {
  filename: string
  title: string
  content: string
  createdAt: Date
}

const MarkdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    return !inline ? (
      <div className="bg-black/60 rounded-xl p-4 my-3 border border-white/[0.06] font-mono text-xs overflow-x-auto scrollbar-small">
        <code {...props} className="text-zinc-300">{children}</code>
      </div>
    ) : (
      <code
        className="bg-violet-500/10 px-1.5 py-0.5 rounded text-violet-300 font-mono text-xs border border-violet-500/15"
        {...props}
      >
        {children}
      </code>
    )
  }
}

const NotesView = ({ glassPanel }: { glassPanel?: string }) => {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)

  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [editOriginalFilename, setEditOriginalFilename] = useState<string | null>(null)

  const fetchNotes = async () => {
    try {
      const data = await window.electron.ipcRenderer.invoke('get-notes')
      setNotes(data)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchNotes()
    const interval = setInterval(fetchNotes, 3000)
    return () => clearInterval(interval)
  }, [])

  const startCreating = () => {
    setSelectedNote(null)
    setEditOriginalFilename(null)
    setNewTitle('')
    setNewContent('')
    setIsEditorOpen(true)
  }

  const startEditing = () => {
    if (!selectedNote) return
    setEditOriginalFilename(selectedNote.filename)
    setNewTitle(selectedNote.title)
    const cleanContent = selectedNote.content.replace(/^# .+\n\n/, '')
    setNewContent(cleanContent)
    setIsEditorOpen(true)
  }

  const cancelEditor = () => {
    setIsEditorOpen(false)
    setEditOriginalFilename(null)
  }

  const saveManualNote = async () => {
    if (!newTitle.trim() || !newContent.trim()) return
    await window.electron.ipcRenderer.invoke('save-note', {
      title: newTitle,
      content: newContent
    })
    setIsEditorOpen(false)
    setEditOriginalFilename(null)
    fetchNotes()
    setTimeout(() => {
      window.electron.ipcRenderer.invoke('get-notes').then((data: Note[]) => {
        const created = data.find((n: any) =>
          n.title.toLowerCase().includes(newTitle.toLowerCase().replace(/ /g, '_'))
        )
        if (created) setSelectedNote(created)
      })
    }, 500)
  }

  return (
    <div className="flex-1 bg-[#040407] h-full grid grid-cols-12 gap-0 animate-in fade-in zoom-in duration-300 w-full overflow-hidden">
      
      {/* ── Sidebar — Note List ── */}
      <div className="col-span-4 border-r border-white/[0.05] flex flex-col h-full overflow-hidden">
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05] shrink-0">
          <div className="flex items-center gap-2">
            <RiStickyNoteLine className="text-violet-400" size={16} />
            <span className="text-[11px] font-semibold tracking-wide text-zinc-300">Memory Bank</span>
            <span className="text-[9px] font-mono text-zinc-600 bg-white/[0.03] px-2 py-0.5 rounded-md border border-white/[0.05]">
              {notes.length}
            </span>
          </div>
          <button
            onClick={startCreating}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-violet-600/10 text-violet-400 hover:bg-violet-600/20 hover:text-violet-300 border border-violet-500/20 transition-all duration-150"
            title="New Note"
          >
            <RiAddLine size={14} />
          </button>
        </div>

        {/* Note List */}
        <div className="flex-1 overflow-y-auto scrollbar-small p-3 space-y-1.5 min-h-0">
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-700 gap-3 py-16">
              <RiFileTextLine size={32} className="opacity-20" />
              <div className="text-center">
                <p className="text-[11px] text-zinc-600 font-medium">No memories saved</p>
                <p className="text-[10px] text-zinc-700 mt-1 font-mono">Click + or ask ELI</p>
              </div>
            </div>
          ) : (
            notes.map((note) => {
              const isSelected = selectedNote?.filename === note.filename && !isEditorOpen
              return (
                <div
                  key={note.filename}
                  onClick={() => {
                    setIsEditorOpen(false)
                    setSelectedNote(note)
                  }}
                  className={`group p-3.5 rounded-xl border transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? 'bg-violet-600/10 border-violet-500/25 border-l-[3px] border-l-violet-500'
                      : 'bg-white/[0.01] border-white/[0.04] hover:bg-white/[0.03] hover:border-white/[0.08]'
                  }`}
                >
                  <h3 className={`text-[12px] font-semibold truncate ${isSelected ? 'text-violet-200' : 'text-zinc-300 group-hover:text-zinc-100'}`}>
                    {note.title}
                  </h3>
                  <div className="flex items-center gap-1 mt-1.5">
                    <RiCalendarLine size={9} className="text-zinc-700" />
                    <p className="text-[9px] text-zinc-700 font-mono">
                      {new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Main Panel — Editor / Viewer ── */}
      <div className="col-span-8 flex flex-col overflow-hidden h-full bg-[#06060b]">
        {isEditorOpen ? (
          <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Editor Header */}
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.05] shrink-0">
              <input
                type="text"
                placeholder="Note title..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="bg-transparent border-none outline-none text-base font-semibold text-white placeholder-zinc-700 w-full tracking-tight"
                autoFocus
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={saveManualNote}
                  disabled={!newTitle || !newContent}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600/15 text-violet-300 font-semibold text-[11px] rounded-lg hover:bg-violet-600/25 border border-violet-500/25 hover:border-violet-500/40 disabled:opacity-30 disabled:pointer-events-none transition-all duration-150"
                >
                  <RiSave3Line size={13} />
                  {editOriginalFilename ? 'Update' : 'Save'}
                </button>
                <button
                  onClick={cancelEditor}
                  className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] rounded-lg transition-all"
                >
                  <RiCloseLine size={16} />
                </button>
              </div>
            </div>
            <textarea
              placeholder="Write in Markdown..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none resize-none text-sm font-mono text-zinc-300 placeholder-zinc-700 leading-7 px-6 py-5 scrollbar-small"
            />
          </div>
        ) : selectedNote ? (
          <>
            {/* Note Viewer Header */}
            <div className="h-12 border-b border-white/[0.05] flex items-center justify-between px-5 shrink-0">
              <div className="flex items-center gap-2 text-zinc-300 min-w-0">
                <RiMarkdownLine size={14} className="text-zinc-600 shrink-0" />
                <span className="text-[12px] font-semibold truncate">{selectedNote.title}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[9px] font-mono text-zinc-700 bg-white/[0.03] px-2 py-0.5 rounded border border-white/[0.04]">
                  READ ONLY
                </span>
                <button
                  onClick={startEditing}
                  className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-violet-400 hover:bg-violet-500/8 rounded-lg transition-all"
                >
                  <RiEditLine size={14} />
                </button>
              </div>
            </div>
            {/* Markdown Content */}
            <div className="flex-1 overflow-y-auto px-8 py-6 scrollbar-small">
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                  {selectedNote.content}
                </ReactMarkdown>
              </div>
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-700 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center">
              <RiFileTextLine size={28} className="opacity-30" />
            </div>
            <div className="text-center">
              <p className="text-[12px] text-zinc-600 font-medium">Select a note to read</p>
              <p className="text-[10px] text-zinc-700 mt-1 font-mono">or create a new one with +</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default NotesView
