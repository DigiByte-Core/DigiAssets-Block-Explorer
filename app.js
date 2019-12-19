var casimir = global.casimir = require(__dirname + '/bin/casimir')
var db = casimir.db
var cluster = require('cluster')
var os = require('os')

var logger = casimir.logger
var properties = casimir.properties

properties.roles = {
  SCANNER: 'SCANNER',
  FIXER: 'FIXER',
  DA_PARSER: 'DA_PARSER',
  API: 'API'
}

var cluster_size = properties.server.cluster || 0
var numCPUs = os.cpus().length
if (cluster_size) cluster_size = parseInt(cluster_size, 10)
if (!cluster_size) cluster_size = numCPUs
if (cluster_size > numCPUs) cluster_size = numCPUs

var workers = {}
var api_workers_ids = []
var scanner_worker
var fixer_worker
var da_parser

var listen = function (worker) {
  worker.on('message', function (data) {
    switch (data.to) {
      case properties.roles.SCANNER:
        scanner_worker.send(data)
        break
      case properties.roles.FIXER:
        fixer_worker.send(data)
        break
      case properties.roles.DA_PARSER:
        da_parser.send(data)
        break
      default:
        api_workers_ids.forEach(function (worker_id) {
          workers[worker_id].send(data)
        })
        break
    }
  })
}

var fork = function (role) {
  var worker = cluster.fork({ROLE: role})
  workers[worker.id] = worker
  return worker
}

if (cluster.isMaster) {
  // init DB (creating tables if not exist)
  db.sequelize.sync()
    .then(function () {
      // Fork workers.
      scanner_worker = fork(properties.roles.SCANNER)
      fixer_worker = fork(properties.roles.FIXER)
      da_parser = fork(properties.roles.DA_PARSER)
      // Register workers to the message bus
      listen(scanner_worker)
      listen(fixer_worker)
      listen(da_parser)
      var worker = fork(properties.roles.API)
      api_workers_ids.push(worker.id)
      listen(worker)
      console.log('cluster_size', cluster_size)
      for (var i = 4; i < cluster_size - 1; i++) {
        var worker = fork(properties.roles.API)
        api_workers_ids.push(worker.id)
        listen(worker)
      }

      cluster.on('exit', function (worker, code, signal) {
        logger.error('Worker number ' + worker.id + ' has died')
        switch (worker.id) {
          case scanner_worker.id:
            scanner_worker = fork(properties.roles.SCANNER)
            listen(scanner_worker)
            break
          case fixer_worker.id:
            fixer_worker = fork(properties.roles.FIXER)
            listen(fixer_worker)
            break
          case da_parser.id:
            da_parser = fork(properties.roles.DA_PARSER)
            listen(da_parser)
            break
          default:
            var new_worker = fork(properties.roles.API)
            var index = api_workers_ids.indexOf(worker.id)
            if (~index) api_workers_ids.splice(index, 1)
            api_workers_ids.push(new_worker.id)
            listen(new_worker)
            break
        }
        delete workers[worker.id]
      })

      cluster.on('fork', function (worker) {
        logger.info('Forking worker number ' + worker.id + ' on process number ' + worker.process.pid)
      })

      cluster.on('online', function (worker) {
        logger.info('Yay, the worker responded after it was forked')
      })

      cluster.on('listening', function (worker, address) {
        logger.info('Worker ' + worker.id + ' is listening on ' + address.address + ':' + address.port)
      })

      cluster.on('disconnect', function (worker) {
        logger.info('Worker number ' + worker.id + ' has disconnected')
      })
    })
    .catch(console.error)
} else {
  require('./startup.js')
}
