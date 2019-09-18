var url = require('url')
var errorHandler = require('digiasset-errors').errorHandler
var requestId = require('digiasset-request-id')
var casimir_core = require('casimircore')()
var properties = casimir_core.properties(__dirname + '/../config/')
if (properties.ENV.type === 'development') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

properties.server.favicon = __dirname + '/../' + properties.server.favicon
properties.engine.view_folder = __dirname + '/../' + properties.engine.view_folder
properties.engine.static_folder = __dirname + '/../' + properties.engine.static_folder

var log_settings = {
  env: properties.ENV.type,
  logentries_api_ley: properties.logentries.api_key,
  log_dir: __dirname + '/../app/log'
}

var logger = global.logger = casimir_core.logger(log_settings)
// Log console.log to logger.debug
console.log = logger.info
// Log console.error to logger.error
console.error = logger.error
// Log console.warn to logger.warn
console.warn = logger.warn

// Framework modules
properties.db.dir = __dirname + '/../' + properties.db.dir
var db = casimir_core.sqldb(properties.db)

var requestSettings = {
  secret: properties.JWT.jwtTokenSecret,
  namespace: properties.server.name
}

// Add custom framwork modules for server
properties.modules = {
  validator: require(__dirname + '/../app/modules/validator.js'),
  router: casimir_core.router(__dirname + '/../routes/', __dirname + '/../app/controllers/'),
  error: errorHandler({env: properties.ENV.type}),
  logger: logger,
  requestid: requestId(requestSettings)
}

// Set server and server port
var server = casimir_core.server(properties)

module.exports = {
  server: server,
  logger: logger,
  properties: properties,
  db: db
}
