# renamer-media-date-time

This is a [renamer](https://github.com/75lb/renamer) replace chain plugin - see [this tutorial](https://github.com/75lb/renamer/wiki/How-to-use-replace-chain-plugins) to learn how to use renamer plugins.

Replaces the filename of image and video files with the creation date in the following format: `yyyyMMdd_HHmmss.{ext}` based on EXIF data.

⚠️ Requires [exiftool](https://github.com/exiftool/exiftool) to be installed.

## Install

```bash
npm install -g renamer renamer-media-date-time
```

## Usage

Remove the `--dry-run` flag to rename the files on disk.

Supported file formats: `.jpg`, `.png`, `.gif`, `.bmp`, `.heic`, `.mp4`, `.mov`.

```bash
$ tree
.
├── one.jpg
└── two.mp4

0 directories, 2 files

$ renamer --chain renamer-media-date-time --dry-run *

✔︎ one.jpg → 20240429_132557.jpg
✔︎ two.mp4 → 20240429_132557.mp4

Rename complete: 2 of 2 files renamed.

$ tree -N
.
├── 20240429_132557.jpg
└── 20240429_132557.mp4

0 directories, 2 files
```
