# renamer-media-date-time

This is a [renamer](https://github.com/75lb/renamer) replace chain plugin - see [this tutorial](https://github.com/75lb/renamer/wiki/How-to-use-replace-chain-plugins) to learn how to use renamer plugins.

This plugin renames image and video files to the following format: `yyyyMMdd_HHmmss.{ext}` based on exif data. Requires [exiftool](https://github.com/exiftool/exiftool) to be installed.

## Usage

```bash
git clone git@github.com:robert-wettstaedt/renamer-media-date-time.git
cd renamer-media-date-time
npm i && npm build
npx renamer --chain [PATH TO CLONED FOLDER]/renamer-media-date-time/dist/main.js [PATH TO MEDIA FOLDER]/**/*
```
