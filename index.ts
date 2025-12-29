import { execSync } from "child_process"
import { format, parse } from "date-fns"
import fs from "fs"
import path, { ParsedPath } from "path"

const isImage = (file: ParsedPath) => file.ext.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|heic)$/) != null

const isVideo = (file: ParsedPath) => file.ext.toLowerCase().match(/\.(mp4|mov)$/) != null

type ExifMap = Map<string, string>

class MediaDateTime {
  #indexMap: Record<string, number | undefined> = {}
  #dirCache: Map<string, Set<string>> = new Map()

  description(): string {
    return "Renames image and video files to a yyyyMMdd_HHmmss format."
  }

  /**
   * This method is mandatory and should modify the incoming file path as required, returning the new path.
   */
  replace(filePath: string): string {
    const file = path.parse(filePath)
    let date: Date | undefined

    try {
      if (isImage(file) || isVideo(file)) {
        date = this.#getDate(filePath)
      }
    } catch (error) {}

    if (date == null) {
      return filePath
    }

    try {
      const formattedDate = format(date, "yyyyMMdd_HHmmss", {})

      const extLower = file.ext.toLowerCase()
      const baseKey = path.join(file.dir, `${formattedDate}${extLower}`)

      // Initialize index from filesystem once for this base key to avoid collisions
      if (this.#indexMap[baseKey] == null) {
        this.#indexMap[baseKey] = this.#computeInitialIndex(file.dir, formattedDate, extLower)
      }

      // Find next available suffix, checking in-memory and filesystem cache
      const nextIndex = this.#nextAvailableIndex(file.dir, formattedDate, extLower, this.#indexMap[baseKey] ?? -1)
      const indexStr = nextIndex < 0 ? "" : `_${nextIndex + 1}`
      const newFileNameLower = `${formattedDate}${indexStr}${extLower}`
      const newFilePath = path.join(file.dir, `${formattedDate}${indexStr}${file.ext}`)

      // Update in-memory trackers and cache for subsequent calls
      this.#indexMap[baseKey] = nextIndex
      this.#addToDirCache(file.dir, newFileNameLower)

      return newFilePath
    } catch (error) {
      return filePath
    }
  }

  #getExif = (filePath: string): ExifMap => {
    const output = execSync(`exiftool "${filePath}"`)
    const outStr = new TextDecoder().decode(output)

    const lines = outStr.split("\n")
    const exifMap = new Map<string, string>()

    lines.forEach((line) => {
      const [rawKey, ...rawValues] = line.split(":")
      const key = rawKey.trim().replace(/\s/gi, "")
      const value = rawValues.join(":").trim()

      exifMap.set(key, value)
    })

    return exifMap
  }

  #getDateFromExif = (file: ParsedPath, exifMap: ExifMap): Date | undefined => {
    const dateString = exifMap.get("CreateDate")?.split(".")[0]

    if (dateString != null) {
      const date = parse(dateString, "yyyy:MM:dd HH:mm:ss", new Date(), {})
      return date
    }
  }

  #isCorrectFileName = (file: ParsedPath): boolean => {
    const base = file.base.split(file.ext)[0]
    const match = base.match(/\d{8}_\d{6,}/)

    return match != null && match.length === 1 && match.index != null && match.index === 0
  }

  #getDateFromFileName = (file: ParsedPath): Date | undefined => {
    const base = file.base.split(file.ext)[0]
    const match = base.match(/\d{8}_\d{6,}/)

    if (match == null || match.length > 1) {
      return undefined
    }

    const dateString = match[0].substring(0, 15)
    const date = parse(dateString, "yyyyMMdd_HHmmss", new Date(), {})
    return date
  }

  #getDateFromUnixTimestamp = (file: ParsedPath): Date | undefined => {
    const base = file.base.split(file.ext)[0]
    const match = base.match(/15\d{11}/)

    if (match == null || match.length > 1) {
      return undefined
    }

    const unixTimestampString = match[0].substring(0, 13)
    const unixTimestamp = parseInt(unixTimestampString)
    const date = new Date(unixTimestamp)
    return date
  }

  #getDate = (filePath: string): Date | undefined => {
    const file = path.parse(filePath)

    if (this.#isCorrectFileName(file)) {
      return undefined
    }

    const exifData = this.#getExif(filePath)
    const dateFromExif = this.#getDateFromExif(file, exifData)
    if (dateFromExif != null) {
      return dateFromExif
    }

    const dateFromFileName = this.#getDateFromFileName(file)
    if (dateFromFileName != null) {
      return dateFromFileName
    }

    const dateFromUnixTimestamp = this.#getDateFromUnixTimestamp(file)
    if (dateFromUnixTimestamp != null) {
      return dateFromUnixTimestamp
    }
  }

  // Directory cache helpers
  #getDirCache = (dir: string): Set<string> => {
    const cached = this.#dirCache.get(dir)
    if (cached != null) return cached

    let entries: string[] = []
    try {
      entries = fs.readdirSync(dir)
    } catch (_) {
      // Directory may not exist or be inaccessible; treat as empty for performance/safety
      entries = []
    }

    const set = new Set(entries.map((name) => name.toLowerCase()))
    this.#dirCache.set(dir, set)
    return set
  }

  #addToDirCache = (dir: string, nameLower: string): void => {
    const set = this.#getDirCache(dir)
    set.add(nameLower)
  }

  #computeInitialIndex = (dir: string, formattedDate: string, extLower: string): number => {
    const set = this.#getDirCache(dir)
    const regex = new RegExp(`^${formattedDate}(?:_(\\d+))?${extLower}$`)

    let maxSuffix = -1
    for (const name of set) {
      const m = name.match(regex)
      if (m) {
        if (m[1] != null) {
          const n = parseInt(m[1], 10)
          if (!Number.isNaN(n)) maxSuffix = Math.max(maxSuffix, n)
        } else {
          // Base name without suffix exists; ensure next becomes _1 if no higher suffix
          maxSuffix = Math.max(maxSuffix, -1)
        }
      }
    }

    return maxSuffix
  }

  #nextAvailableIndex = (dir: string, formattedDate: string, extLower: string, startIndex: number): number => {
    const set = this.#getDirCache(dir)
    let idx = startIndex

    // Try candidate names until one is not present in cache (filesystem or in-memory additions)
    while (true) {
      const candidate = idx < 0 ? `${formattedDate}${extLower}` : `${formattedDate}_${idx + 1}${extLower}`
      if (!set.has(candidate)) {
        return idx
      }
      idx += 1
    }
  }
}

export default MediaDateTime
