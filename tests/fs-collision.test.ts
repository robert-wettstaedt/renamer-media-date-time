import * as child_process from "child_process"
import fs from "fs"
import path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import MediaDateTime from "../index"

// Mock child_process for EXIF reads
vi.mock("child_process", () => ({
  execSync: vi.fn(),
}))
// Mock fs for directory reads
vi.mock("fs", () => ({
  default: {
    readdirSync: vi.fn(),
  },
  readdirSync: vi.fn(),
}))

const exifOutput = (createDate: string) => {
  const lines = [
    "ExifTool Version Number                 : 12.30",
    `Create Date                             : ${createDate}`,
  ]
  return Buffer.from(lines.join("\n"))
}

const VDIR = "/virtual-dir"

describe("Filesystem collision detection", () => {
  let plugin: MediaDateTime

  beforeEach(() => {
    vi.restoreAllMocks()
    plugin = new MediaDateTime()
    ;(fs.readdirSync as unknown as ReturnType<typeof vi.fn>).mockReset()
  })

  afterEach(() => {
    ;(fs.readdirSync as unknown as ReturnType<typeof vi.fn>).mockReset()
  })

  it("adds _1 when base name already exists in directory", () => {
    const dateStr = "2020:01:01 01:02:03"
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(exifOutput(dateStr))

    const formatted = "20200101_010203"
    ;(fs.readdirSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue([`${formatted}.jpg`])

    const input = path.join(VDIR, "input.jpg")
    const output = plugin.replace(input)

    expect(output).toBe(path.join(VDIR, `${formatted}_1.jpg`))
  })

  it("picks next suffix when multiple existing suffixes exist", () => {
    const dateStr = "2020:01:01 01:02:03"
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(exifOutput(dateStr))

    const formatted = "20200101_010203"
    ;(fs.readdirSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      `${formatted}.jpg`,
      `${formatted}_1.jpg`,
      `${formatted}_2.jpg`,
    ])

    const input = path.join(VDIR, "another.jpg")
    const output = plugin.replace(input)

    expect(output).toBe(path.join(VDIR, `${formatted}_3.jpg`))
  })

  it("handles case-insensitive collisions on extension", () => {
    const dateStr = "2020:01:01 01:02:03"
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(exifOutput(dateStr))

    const formatted = "20200101_010203"
    ;(fs.readdirSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue([`${formatted}.JPG`])

    const input = path.join(VDIR, "photo.jpg")
    const output = plugin.replace(input)

    // Output preserves input extension case, but collision is detected case-insensitively
    expect(output).toBe(path.join(VDIR, `${formatted}_1.jpg`))
  })

  it("uses base name when no collisions found", () => {
    const dateStr = "2020:01:01 01:02:03"
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(exifOutput(dateStr))

    const formatted = "20200101_010203"
    ;(fs.readdirSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue([])

    const input = path.join(VDIR, "clean.jpg")
    const output = plugin.replace(input)

    expect(output).toBe(path.join(VDIR, `${formatted}.jpg`))
  })

  it("increments further for multiple calls within same run considering existing files", () => {
    const dateStr = "2020:01:01 01:02:03"
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(exifOutput(dateStr))

    const formatted = "20200101_010203"
    ;(fs.readdirSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      `${formatted}.jpg`,
      `${formatted}_1.jpg`,
      `${formatted}_2.jpg`,
    ])

    const out1 = plugin.replace(path.join(VDIR, "a.jpg"))
    const out2 = plugin.replace(path.join(VDIR, "b.jpg"))

    expect(out1).toBe(path.join(VDIR, `${formatted}_3.jpg`))
    expect(out2).toBe(path.join(VDIR, `${formatted}_4.jpg`))
  })

  it("reads directory only once per dir thanks to cache", () => {
    const dateStr = "2024:04:29 13:25:57"
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(exifOutput(dateStr))
    ;(fs.readdirSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue([])

    const dir = "/dir"
    const out1 = plugin.replace(path.join(dir, "a.jpg"))
    const out2 = plugin.replace(path.join(dir, "b.jpg"))

    expect(out1).toBe(path.join(dir, "20240429_132557.jpg"))
    expect(out2).toBe(path.join(dir, "20240429_132557_1.jpg"))

    expect(fs.readdirSync as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1)
    expect(fs.readdirSync as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(dir)
  })
})
