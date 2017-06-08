const fs = require('fs')

function ExtraneousFileCleanupPlugin (options) {
  options = options || {}
  this.extensions = options.extensions || []
  this.minBytes = options.minBytes || 1024 // 1 KB minimum size
  this.manifestJsonName = options.manifestJsonName || 'manifest.json'
}

// check if the extension is in our allowed list
ExtraneousFileCleanupPlugin.prototype.validExtension = function (fileName) {
  let i
  let len

  // all extensions are valid
  if (this.extensions.length === 0) {
    return true
  }

  for (i = 0, len = this.extensions.length; i < len; i++) {
    if (fileName.endsWith(this.extensions[i])) {
      return true
    }
  }

  return false
}

ExtraneousFileCleanupPlugin.prototype.removeFromWebpackStats = (compilation, assetKey) => {
  for (let i = 0, iLen = compilation.chunks.length; i < iLen; i++) {
    if (typeof compilation.chunks[i] === 'undefined') {
      continue
    }

    for (let j = 0, jLen = compilation.chunks[i].files.length; j < jLen; j++) {
      if (compilation.chunks[i].files[j] === assetKey) {
        delete compilation.chunks[i]
        return
      }
    }
  }
}

ExtraneousFileCleanupPlugin.prototype.apply = function (compiler) {
  compiler.plugin('after-emit', (compilation, callback) => {
    const outputPath = compilation.options.output.path

    let manifestJson = {}
    let usingManifestJson = false
    let manifestOutputPath = outputPath + '/' + this.manifestJsonName
    let manifestKey
    let assetStat

    // if we're using the webpack manifest plugin, we need to make sure we clean that up too
    if (fs.existsSync(manifestOutputPath)) {
      usingManifestJson = true
      manifestJson = JSON.parse(fs.readFileSync(manifestOutputPath).toString())
    }

    // for all assets
    Object.keys(compilation.assets).forEach(assetKey => {
      if (!this.validExtension(assetKey)) {
        return
      }

      // if it passes min byte check, ignore it
      assetStat = fs.statSync(outputPath + '/' + assetKey)
      if (assetStat.size > this.minBytes) {
        return
      }

      // remove from various places
      fs.unlinkSync(outputPath + '/' + assetKey)          // unlink the asset
      fs.unlinkSync(outputPath + '/' + assetKey + '.map') // unlink the map file
      delete compilation.assets[assetKey]                 // remove from webpack output
      delete compilation.assets[assetKey + '.map']        // remove from webpack output

      if (usingManifestJson) {
        for (manifestKey in manifestJson) {
          if (manifestJson.hasOwnProperty(manifestKey) && manifestJson[manifestKey] === assetKey) {
            delete manifestJson[manifestKey]              // remove from manifest.json
            delete manifestJson[manifestKey + '.map']
          }
        }
      }

      this.removeFromWebpackStats(compilation, assetKey)  // remove from webpack stats
    })

    // write the new manifest.json file if we're using it
    if (usingManifestJson) {
      fs.writeFileSync(manifestOutputPath, JSON.stringify(manifestJson, null, 2))
    }

    callback()
  })
}

module.exports = ExtraneousFileCleanupPlugin