var dgram = require('dgram')
var events = require('events')
var inherits = require('inherits')
var passthrough = require('passthrough-encoding')

var ETIMEDOUT = new Error('Request timed out')
ETIMEDOUT.timeout = true
ETIMEDOUT.code = 'ETIMEDOUT'

var RETRIES = [4, 6, 12]

module.exports = UDP

function UDP (opts) {
  if (!(this instanceof UDP)) return new UDP(opts)
  if (!opts) opts = {}

  var self = this

  events.EventEmitter.call(this)

  this.socket = opts.socket || dgram.createSocket('udp4')
  this.retry = !!opts.retry
  this.inflight = 0
  this.requestEncoding = opts.requestEncoding || opts.encoding || passthrough
  this.responseEncoding = opts.responseEncoding || opts.encoding || passthrough
  this.destroyed = false

  this._tick = (Math.random() * 32767) | 0
  this._tids = []
  this._reqs = []
  this._interval = setInterval(kick, 250)

  this.socket.on('error', onerror)
  this.socket.on('message', onmessage)
  this.socket.on('listening', onlistening)
  this.socket.on('close', onclose)

  function onerror (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES') self.emit('error', err)
    else self.emit('warning', err)
  }

  function onmessage (message, rinfo) {
    self._onmessage(message, rinfo)
  }

  function onlistening () {
    self.emit('listening')
  }

  function onclose () {
    self.emit('close')
  }

  function kick () {
    self._checkTimeouts()
  }
}

inherits(UDP, events.EventEmitter)

UDP.prototype.address = function () {
  return this.socket.address()
}

UDP.prototype.listen = function (port, cb) {
  if (typeof port === 'function') return this.listen(0, port)
  if (!port) port = 0
  this.socket.bind(port, cb)
}

UDP.prototype.request = function (val, peer, opts, cb) {
  if (typeof opts === 'function') return this._request(val, peer, {}, opts)
  return this._request(val, peer, opts || {}, cb || noop)
}

UDP.prototype._request = function (val, peer, opts, cb) {
  if (this.destroyed) return cb(new Error('Request cancelled'))
  if (this._tick === 32767) this._tick = 0

  var tid = this._tick++
  var header = 32768 | tid
  var message = new Buffer(this.requestEncoding.encodingLength(val) + 2)

  message.writeUInt16BE(header, 0)
  this.requestEncoding.encode(val, message, 2)

  this._push(tid, val, message, peer, opts, cb)
  this.socket.send(message, 0, message.length, peer.port, peer.host)

  return tid
}

UDP.prototype.forwardRequest = function (val, from, to) {
  this._forward(true, val, from, to)
}

UDP.prototype.forwardResponse = function (val, from, to) {
  this._forward(false, val, from, to)
}

UDP.prototype._forward = function (request, val, from, to) {
  if (this.destroyed) return

  var enc = request ? this.requestEncoding : this.responseEncoding
  var message = new Buffer(enc.encodingLength(val) + 2)
  var header = (request ? 32768 : 0) | from.tid

  message.writeUInt16BE(header, 0)
  enc.encode(val, message, 2)

  this.socket.send(message, 0, message.length, to.port, to.host)
}

UDP.prototype.response = function (val, peer) {
  if (this.destroyed) return

  var message = new Buffer(this.responseEncoding.encodingLength(val) + 2)

  message.writeUInt16BE(peer.tid, 0)
  this.responseEncoding.encode(val, message, 2)

  this.socket.send(message, 0, message.length, peer.port, peer.host)
}

UDP.prototype.destroy = function (err) {
  if (this.destroyed) return
  this.destroyed = true

  clearInterval(this._interval)
  this.socket.close()
  for (var i = 0; i < this._reqs.length; i++) {
    if (this._reqs[i]) this._cancel(i, err)
  }
}

UDP.prototype.cancel = function (tid, err) {
  var i = this._tids.indexOf(tid)
  if (i > -1) this._cancel(i, err)
}

UDP.prototype._cancel = function (i, err) {
  var req = this._reqs[i]
  this._tids[i] = -1
  this._reqs[i] = null
  this.inflight--
  req.callback(err || new Error('Request cancelled'))
}

UDP.prototype._onmessage = function (message, rinfo) {
  if (this.destroyed) return

  var request = !!(message[0] & 128)
  var tid = message.readUInt16BE(0) & 32767
  var enc = request ? this.requestEncoding : this.responseEncoding

  try {
    var value = enc.decode(message, 2)
  } catch (err) {
    this.emit('warning', err)
    return
  }

  var peer = {port: rinfo.port, host: rinfo.address, tid: tid, request: request}

  if (request) {
    this.emit('request', value, peer)
    return
  }

  var state = this._pull(tid)

  this.emit('response', value, peer, state && state.request)
  if (state) state.callback(null, value, peer, state.request)
}

UDP.prototype._checkTimeouts = function () {
  for (var i = 0; i < this._reqs.length; i++) {
    var req = this._reqs[i]
    if (!req) continue

    if (req.timeout) {
      req.timeout--
      continue
    }
    if (req.tries < RETRIES.length) {
      req.timeout = RETRIES[req.tries++]
      this.socket.send(req.buffer, 0, req.buffer.length, req.peer.port, req.peer.host)
      continue
    }

    this._cancel(i, ETIMEDOUT)
  }
}

UDP.prototype._pull = function (tid) {
  var free = this._tids.indexOf(tid)
  if (free === -1) return null

  var req = this._reqs[free]
  this._reqs[free] = null
  this._tids[free] = -1

  this.inflight--

  return req
}

UDP.prototype._push = function (tid, req, buf, peer, opts, cb) {
  var retry = opts.retry !== undefined ? opts.retry : this.retry
  var free = this._tids.indexOf(-1)
  if (free === -1) {
    this._reqs.push(null)
    free = this._tids.push(-1) - 1
  }

  this.inflight++

  this._tids[free] = tid
  this._reqs[free] = {
    callback: cb || noop,
    request: req,
    peer: peer,
    buffer: buf,
    timeout: 4,
    tries: retry ? 0 : RETRIES.length
  }
}

function noop () {}
