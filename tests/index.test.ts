import { format } from "date-fns"
import path from "path"
import * as child_process from "child_process"
import MediaDateTime from "../index"
import { describe, it, expect, beforeEach, vi } from "vitest"

// Hoist a mock for child_process to allow controllable execSync behavior
vi.mock("child_process", () => ({
  execSync: vi.fn(),
}))

const exifOutput = (createDate?: string) => {
  const lines = [
    "ExifTool Version Number                 : 12.30",
    "File Name                                : IMG_0001.JPG",
    "Directory                                : /photos",
    "File Size                                : 1.2 MB",
    "File Modification Date/Time              : 2021:12:25 14:23:59+02:00",
  ]
  if (createDate) {
    lines.push(`Create Date                             : ${createDate}`)
  }
  // Add a noisy field with embedded colons to ensure parsing robustness
  lines.push("Comment                                  : Some:Value:With:Colons")
  return Buffer.from(lines.join("\n"))
}

describe("MediaDateTime plugin", () => {
  let plugin: MediaDateTime

  beforeEach(() => {
    vi.restoreAllMocks()
    plugin = new MediaDateTime()
  })

  it("renames an image using EXIF CreateDate (preserves extension case)", () => {
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      exifOutput("2021:12:25 14:23:59.123+02:00"),
    )

    const input = path.join("/photos", "IMG_1234.JPG")
    const output = plugin.replace(input)

    expect(output).toBe(path.join("/photos", "20211225_142359.JPG"))
  })

  it("renames a video using EXIF CreateDate", () => {
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(exifOutput("2020:01:02 03:04:05"))

    const input = path.join("/videos", "clip.mov")
    const output = plugin.replace(input)

    expect(output).toBe(path.join("/videos", "20200102_030405.mov"))
  })

  it("does not change when filename already starts with a date pattern", () => {
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(exifOutput())

    const input = path.join("/photos", "20210518_122045_sample.jpg")
    const output = plugin.replace(input)

    // The plugin treats filenames starting with yyyyMMdd_HHmmss as already formatted
    expect(output).toBe(input)
  })

  it("does not change files already in correct format", () => {
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(exifOutput())

    const input = path.join("/photos", "20210518_122045.jpg")
    const output = plugin.replace(input)

    expect(output).toBe(input)
  })

  it("falls back to unix timestamp in filename when EXIF missing (starting with 15...)", () => {
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(exifOutput())

    const knownDate = new Date("2017-07-14T02:40:00Z")
    const timestampMs = knownDate.getTime() // 1500000000000 (starts with 15)
    const base = `${timestampMs}_photo.jpg`

    const input = path.join("/media", base)
    const output = plugin.replace(input)

    const expected = format(knownDate, "yyyyMMdd_HHmmss")
    expect(output).toBe(path.join("/media", `${expected}.jpg`))
  })

  it("returns original path for unsupported file types", () => {
    // Even if EXIF is mocked, non-image/video should not be processed
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(exifOutput("2021:12:25 14:23:59"))

    const input = path.join("/docs", "readme.txt")
    const output = plugin.replace(input)

    expect(output).toBe(input)
  })

  it("handles duplicate timestamps by adding incremental suffixes starting from _1", () => {
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(exifOutput("2019:07:04 08:09:10"))

    const input1 = path.join("/photos", "a.jpg")
    const input2 = path.join("/photos", "b.jpg")
    const input3 = path.join("/photos", "c.jpg")

    const out1 = plugin.replace(input1)
    const out2 = plugin.replace(input2)
    const out3 = plugin.replace(input3)

    expect(out1).toBe(path.join("/photos", "20190704_080910.jpg"))
    expect(out2).toBe(path.join("/photos", "20190704_080910_1.jpg"))
    expect(out3).toBe(path.join("/photos", "20190704_080910_2.jpg"))
  })

  it("groups collisions case-insensitively on extension, but preserves original case in output", () => {
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(exifOutput("2022:03:14 15:09:26"))

    const upper = path.join("/mix", "one.JPG")
    const lower = path.join("/mix", "two.jpg")

    const outUpper = plugin.replace(upper)
    const outLower = plugin.replace(lower)

    expect(outUpper).toBe(path.join("/mix", "20220314_150926.JPG"))
    // Despite different original case, the second gets suffixed _1
    expect(outLower).toBe(path.join("/mix", "20220314_150926_1.jpg"))
  })

  it("supports HEIC and GIF extensions", () => {
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      exifOutput("2018:11:23 10:11:12.456Z"),
    )

    const heic = path.join("/pics", "img.HEIC")
    const gif = path.join("/pics", "anim.gif")

    const outHeic = plugin.replace(heic)
    const outGif = plugin.replace(gif)

    expect(outHeic).toBe(path.join("/pics", "20181123_101112.HEIC"))
    expect(outGif).toBe(path.join("/pics", "20181123_101112.gif"))
  })

  it("ignores EXIF when execSync throws and returns original path (error path)", () => {
    ;(child_process.execSync as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("exiftool not available")
    })

    const input = path.join("/photos", "20210518_122045_sample.jpg")
    const output = plugin.replace(input)

    // Due to try/catch around getDate, fallback parsing will not occur
    expect(output).toBe(input)
  })
})
