var pull   = require('pull-stream')
var pfs    = require('pull-fs')
var glob   = require('pull-glob')
var semver = require('semver')
var path   = require('path')

module.exports = function (cacheDir) {

  cacheDir = cacheDir || '~/.npm'
  
  return pull(
    glob(path.join(cacheDir, '*', '.cache.json')),
    pfs.readFile(),
    pull.map(function (data) {
      try { return JSON.parse(data) } catch (_) { }
    }),
    pull.filter(Boolean),
    pull.flatMap(function (pkg) {
      var depns = []
      var versions = pkg.versions
      for(var version in versions) {
        var tests = versions[version].scripts
        tests = !!(tests && tests.test)
        var deps = versions[version].dependencies
        for(var m in deps)
          depns.push([
            m, deps[m], pkg.name, version,
            {
              shasum: versions[version].dist.shasum,
              dev: false,
              tests: tests
            }
          ])
        var deps = versions[version].devDependencies
        for(var m in deps)
          depns.push([
            m, deps[m], pkg.name,
            version, 
            {
              shasum: versions[version].dist.shasum,
              dev: true,
              tests: tests
            }
          ])
      }
      return depns
    })
  )

}

if(!module.parent) {
  var m = process.argv[2]
  var v = process.argv[3]

  if(!m)
    throw new Error('usage: npmd-reverse-resolve module version')

  var config = require('npmd-config')
  //this is completely out of date.
  var db = require('level')(config.dbPath, {valueEncoding: 'json'})
  var cache  = require('npmd-cache')(db, config)
  var resolve = require('npmd-resolve')(null, cache, config)
  /*
  //this is how you use override, for now...
  config.override = {
    through: {
      name: 'through', version: '2.3.5',
      shasum: 'abababababababababababababababababababab',
      dependencies: {}
    }
  }
  */
  pull(
    module.exports(),
    pull.filter(function (deps) {
      if(deps[0] != m) return
      if(v && !semver.satisfies(v, deps[1]))
        return
      return true
    }),
    pull.asyncMap(function (data, cb) {
      //resolve the dependant module,
      resolve({name: data[2], version: data[3]}, config, function (err, tree) {
        if(err) console.error(err)
        cb(null, tree)
      })
    }),
    pull.filter(Boolean),
    pull.drain(console.log, function (err) {
      if(err) throw err
    })
  )

  //TODO: package a directory and put it in the cache
  //      without indexing it - just as a hash. 
}
