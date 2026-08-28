import type { Env, MarkdownItOptions } from 'markdown-it'
import MarkdownIt from 'markdown-it'

type MarkdownItPresetName = 'default' | 'zero' | 'commonmark'
type AsyncHighlighter = (str: string, lang: string, attrs: string) => string | Promise<string>

export interface MarkdownItAsyncOptions extends Omit<MarkdownItOptions, 'highlight'> {
  highlight?: AsyncHighlighter | null
  /** Emit a warning when an async renderer is called through render(). */
  warnOnSyncRender?: boolean
}

interface PendingHighlight {
  lang: string
  promise: Promise<string>
}

const placeholderRE = /<pre><!--::valaxy-markdown-async::(\w+)::--><code>[\s\S]*?<\/code><\/pre>/g
let placeholderId = 0

export class MarkdownItAsync extends MarkdownIt {
  private readonly pendingHighlights: Map<string, PendingHighlight>
  private readonly warnOnSyncRender: boolean
  private disableSyncRenderWarning = false

  constructor(presetName: MarkdownItPresetName, options?: MarkdownItAsyncOptions)
  constructor(options?: MarkdownItAsyncOptions)
  constructor(
    presetOrOptions?: MarkdownItPresetName | MarkdownItAsyncOptions,
    options?: MarkdownItAsyncOptions,
  ) {
    const pendingHighlights = new Map<string, PendingHighlight>()
    const asyncOptions = typeof presetOrOptions === 'string' ? options : presetOrOptions
    if (typeof presetOrOptions === 'string')
      super(presetOrOptions, wrapOptions(options, pendingHighlights))
    else if (presetOrOptions)
      super(wrapOptions(presetOrOptions, pendingHighlights)!)
    else
      super()

    this.pendingHighlights = pendingHighlights
    this.warnOnSyncRender = asyncOptions?.warnOnSyncRender ?? false
  }

  override render(src: string, env?: Env): string {
    if (this.warnOnSyncRender && !this.disableSyncRenderWarning)
      console.warn('[valaxy] Use renderAsync() when Markdown highlighting can be asynchronous.')
    return super.render(src, env)
  }

  async renderAsync(src: string, env?: Env): Promise<string> {
    this.disableSyncRenderWarning = true
    let html: string
    try {
      html = this.render(src, env)
    }
    finally {
      this.disableSyncRenderWarning = false
    }
    const replacements: string[] = []

    for (const match of html.matchAll(placeholderRE)) {
      const id = match[1]
      const pending = this.pendingHighlights.get(id)
      if (!pending)
        throw new Error(`Unknown async highlight placeholder: ${id}`)

      const highlighted = await pending.promise || ''
      replacements.push(highlighted.startsWith('<pre')
        ? highlighted
        : `<pre><code class="language-${pending.lang}">${highlighted}</code></pre>`)
      this.pendingHighlights.delete(id)
    }

    let index = 0
    return html.replace(placeholderRE, () => replacements[index++] || '')
  }
}

export function createMarkdownItAsync(options?: MarkdownItAsyncOptions): MarkdownItAsync
export function createMarkdownItAsync(
  presetName: MarkdownItPresetName,
  options?: MarkdownItAsyncOptions,
): MarkdownItAsync
export function createMarkdownItAsync(
  presetOrOptions?: MarkdownItPresetName | MarkdownItAsyncOptions,
  options?: MarkdownItAsyncOptions,
) {
  return typeof presetOrOptions === 'string'
    ? new MarkdownItAsync(presetOrOptions, options)
    : new MarkdownItAsync(presetOrOptions)
}

function wrapOptions(
  options: MarkdownItAsyncOptions | undefined,
  pendingHighlights: Map<string, PendingHighlight>,
): MarkdownItOptions | undefined {
  if (!options)
    return undefined

  const { highlight, warnOnSyncRender: _, ...markdownItOptions } = options
  if (!highlight)
    return markdownItOptions

  return {
    ...markdownItOptions,
    highlight(str, lang, attrs) {
      const result = highlight(str, lang, attrs)
      if (typeof result === 'string')
        return result

      const id = (++placeholderId).toString(36)
      pendingHighlights.set(id, { lang, promise: result })
      const code = str.endsWith('\n') ? str.slice(0, -1) : str
      return `<pre><!--::valaxy-markdown-async::${id}::--><code>${escapeHtml(code)}</code></pre>`
    },
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
