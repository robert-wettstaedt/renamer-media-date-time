import { execSync } from "child_process"
import { format, parse } from "date-fns"
import path, { ParsedPath } from "path"

const isImage = (file: ParsedPath) => file.ext.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|heic)$/) != null

const isVideo = (file: ParsedPath) => file.ext.toLowerCase().match(/\.(mp4|mov)$/) != null

type ExifMap = Map<string, string>

class MediaDateTime {
  #indexMap: Record<string, number | undefined> = {}

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
      const baseNewFilePath = path.join(file.dir, `${formattedDate}${file.ext.toLowerCase()}`)
      const index = this.#indexMap[baseNewFilePath]
      const indexStr = index == null ? "" : `_${index + 1}`
      const newFilePath = path.join(file.dir, `${formattedDate}${indexStr}${file.ext}`)

      this.#indexMap[baseNewFilePath] = (this.#indexMap[baseNewFilePath] ?? -1) + 1

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
}

export default MediaDateTime
