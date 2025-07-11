import type { Author, FeedOptions, Item } from 'feed'
import type { ResolvedValaxyOptions } from '../../options'
import { readFile } from 'node:fs/promises'

import { dirname, join, resolve } from 'node:path'
import { ensurePrefix } from '@antfu/utils'
import { consola } from 'consola'
import { colors } from 'consola/utils'
import dayjs from 'dayjs'
import fg from 'fast-glob'
import { Feed } from 'feed'

import fs from 'fs-extra'
import matter from 'gray-matter'
import MarkdownIt from 'markdown-it'

import ora from 'ora'
import { getBorderCharacters, table } from 'table'
import { tObject } from '../../../shared'
import { matterOptions } from '../../plugins/markdown/transform/matter'
import { isExternal } from '../../utils'
import { getCreatedTime, getUpdatedTime } from '../../utils/date'

const markdown = MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
})

/**
 * generate rss
 * @param options
 */
export async function build(options: ResolvedValaxyOptions) {
  // consola.info(`${yellow('RSS Generating ...')}`)
  const s = ora('RSS Generating ...').start()

  const { config } = options
  const siteConfig = config.siteConfig
  const lang = siteConfig.lang || 'en'

  if (!siteConfig.url || siteConfig.url === '/') {
    consola.error('You must set `url` (like `https://example.com`) in `site.config.ts` to generate rss.')
    return
  }

  // url has been ensured '/'
  const siteUrl = siteConfig.url

  const author: Author = {
    name: siteConfig.author?.name,
    email: siteConfig.author?.email,
    link: siteConfig.author?.link,
  }

  const ccVersion = (siteConfig.license?.type === 'zero') ? '1.0' : '4.0'
  const feedNameMap: Record<string, string> = {
    atom: siteConfig.feed?.name ? `${siteConfig.feed?.name}.atom` : 'atom.xml',
    json: `${siteConfig.feed?.name || 'feed'}.json`,
    rss: `${siteConfig.feed?.name || 'feed'}.xml`,
  }

  const feedLinks: FeedOptions['feedLinks'] = {}
  Object.keys(feedNameMap).forEach((key) => {
    feedLinks[key] = `${siteUrl}${feedNameMap[key]}`
  })
  const title = tObject(siteConfig.title, lang)
  const description = tObject(siteConfig.description, lang)
  const feedOptions: FeedOptions = {
    title: title || 'Valaxy Blog',
    description,
    id: siteUrl || 'valaxy',
    link: siteUrl,
    copyright: `CC ${siteConfig.license?.type?.toUpperCase()} ${ccVersion} ${new Date().getFullYear()} © ${siteConfig.author?.name}`,
    feedLinks,
  }

  const DOMAIN = siteConfig.url.slice(0, -1)

  // generate
  const files = await fg(`${options.userRoot}/pages/posts/**/*.md`)
  const posts = await getPosts({
    author,
    files,
    DOMAIN,
  }, options)

  if (!posts)
    return

  // write
  const authorAvatar = siteConfig.author?.avatar || '/favicon.svg'
  feedOptions.author = author
  feedOptions.image = isExternal(authorAvatar)
    ? siteConfig.author?.avatar
    : `${DOMAIN}${ensurePrefix('/', authorAvatar)}`
  feedOptions.favicon = `${DOMAIN}${siteConfig.feed?.favicon || siteConfig.favicon}`

  s.succeed('RSS Generated.')
  await writeFeed(feedOptions, posts, options, feedNameMap)
}

/**
 * get posts from files
 */
export async function getPosts(params: {
  author: Author
  files: string[]
  DOMAIN: string
}, options: ResolvedValaxyOptions) {
  const { config } = options
  const siteConfig = config.siteConfig
  const lang = siteConfig.lang || 'en'

  const { files, author, DOMAIN } = params

  // read file & matter
  const readFilePromises = files.map(async (i) => {
    const raw = await readFile(i, 'utf-8')
    const { data, content, excerpt } = matter(raw, matterOptions)
    return { data, content, excerpt, path: i }
  })
  const draftPosts: {
    data: Record<string, any>
    content: string
    excerpt?: string
    path: string
  }[] = []
  const rawPosts = (await Promise.all(readFilePromises))
  // filter
  const filteredPosts = rawPosts.filter((p) => {
    const { data } = p
    // skip encrypt post
    if (data.password)
      return false
      // skip draft post
    if (data.draft) {
      // TODO: console draftPosts
      draftPosts.push(p)
      return false
    }
    // skip hidden post
    if (data.hide)
      return false
    return true
  })

  // returned posts
  const posts: Item[] = []
  for (const rawPost of filteredPosts) {
    const { data, path, content, excerpt } = rawPost
    if (!data.date)
      data.date = await getCreatedTime(path)
    if (siteConfig.lastUpdated) {
      if (!data.updated)
        data.updated = await getUpdatedTime(path)
    }

    // todo i18n

    // render excerpt
    // default excerpt content length: 100
    const fullText = options.config.modules.rss.fullText
    const rssContent = fullText ? content : (excerpt || content.slice(0, 100))
    const html = markdown.render(rssContent)
      .replace('src="/', `src="${DOMAIN}/`)

    if (data.image?.startsWith('/'))
      data.image = DOMAIN + data.image

    const link = DOMAIN + path.replace(`${options.userRoot}/pages`, '').replace(/\.md$/, '')
    const tip = `<br/><p>${
      lang === 'zh-CN'
        ? `访问 <a href="${link}" target="_blank">${link}</a> ${fullText ? '查看原文' : '阅读全文'}。`
        : `Visit <a href="${link}" target="_blank">${link}</a> to ${fullText ? 'view original article' : 'read more'}.`
    }</p>`

    posts.push({
      ...data,
      title: tObject(data.title, lang),
      description: tObject(data.description, lang),
      date: new Date(data.date),
      published: new Date(data.updated || data.date),
      content: html + tip,
      author: [author],
      id: data.id || link,
      link,
    })
  }

  // sort by updated
  posts.sort((a, b) => +(b.published || b.date) - +(a.published || a.date))
  return posts
}

/**
 * write feed to local
 */
export async function writeFeed(feedOptions: FeedOptions, posts: Item[], options: ResolvedValaxyOptions, feedNameMap: Record<string, string>) {
  const feed = new Feed(feedOptions)
  posts.forEach(item => feed.addItem(item))

  await fs.ensureDir(dirname(`./dist/${feedNameMap.atom}`))
  const path = resolve(options.userRoot, './dist')
  const publicFolder = resolve(options.userRoot, 'public')

  const { config } = options
  const siteConfig = config.siteConfig
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss zzz')
  const tableData = [
    [`${colors.yellow('RSS Feed Files')} 📡 ${colors.dim(now)}`, '', ''],
    [colors.bold('Site Url'), '', colors.cyan(siteConfig.url)],
    ['Type', 'Folder', 'Path'],
  ]

  const types = ['rss', 'atom', 'json']
  for (const type of types) {
    let data = ''
    const distFeedPath = `${path}/${feedNameMap[type]}`
    if (type === 'rss')
      data = feed.rss2()
    else if (type === 'atom')
      data = feed.atom1()
    else if (type === 'json')
      data = feed.json1()

    await fs.writeFile(distFeedPath, data, 'utf-8')
    consola.debug(`[${colors.cyan(type)}] dist: ${colors.dim(distFeedPath)}`)
    tableData.push([colors.cyan(type), colors.yellow('dist'), colors.dim(distFeedPath)])

    const publicFeedPath = resolve(publicFolder, feedNameMap[type])
    const publicRelativeFile = join('public', feedNameMap[type])
    await fs.writeFile(publicFeedPath, data, 'utf-8')
    consola.debug(`[${colors.cyan(type)}] public: ${colors.dim(publicFeedPath)}`)
    tableData.push(['', colors.green('public'), colors.dim(publicFeedPath)])

    try {
      const gitignorePath = resolve(options.userRoot, '.gitignore')
      const gitignore = await fs.readFile(gitignorePath, 'utf-8')
      const ignorePath = publicRelativeFile.replace(/\\/g, '/')
      if (!gitignore.includes(ignorePath)) {
        await fs.appendFile(gitignorePath, `\n# valaxy rss\n${ignorePath}\n`)
        consola.success(`Add ${colors.dim(ignorePath)} to ${colors.dim('.gitignore')}`)
      }
    }
    catch {}
  }
  // eslint-disable-next-line no-console
  console.log(table(tableData, {
    columns: [
      { alignment: 'center' },
      { alignment: 'right' },
      { alignment: 'left' },
    ],
    spanningCells: [
      { col: 0, row: 0, colSpan: 3 },
      { col: 0, row: 1, colSpan: 2 },
      { col: 0, row: 3, rowSpan: 2, verticalAlignment: 'middle' },
      { col: 0, row: 5, rowSpan: 2, verticalAlignment: 'middle' },
      { col: 0, row: 7, rowSpan: 2, verticalAlignment: 'middle' },
    ],
    border: getBorderCharacters('norc'),
  }))
}
