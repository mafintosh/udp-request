const dgram = require('dgram')
const { EventEmitter } = require('events')
const passthrough = require('passthrough-encoding')

const ETIMEDOUT = new Error('Request timed out')
ETIMEDOUT.timeout = true
ETIMEDOUT.code = 'ETIMEDOUT'

const RETRIES = [4, 8, 12]

module.exports = opts => new UDPRequest(opts)

class UDPRequest extends EventEmitter {
  constructor (opts) {
    if (!opts) opts = {}

    super()

    const timeout = Math.ceil(opts.timeout || 1000, 4)

    this.socket = opts.socket || dgram.createSocket('udp4')
    this.retry = !!opts.retry
    this.inflight = 0
    this.requestEncoding = opts.requestEncoding || opts.encoding || passthrough
    this.responseEncoding = opts.responseEncoding || opts.encoding || passthrough
    this.destroyed = false

    this._tick = (Math.random() * 32767) | 0
    this._tids = []
    this._reqs = []
    this._interval = setInterval(this._checkTimeouts.bind(this), Math.floor(timeout / 4))

    this.socket.on('error', this._onerror.bind(this))
    this.socket.on('message', this._onmessage.bind(this))
    this.socket.on('listening', this.emit.bind(this, 'listening'))
    this.socket.on('close', this.emit.bind(this, 'close'))
  }

  address () {
    return this.socket.address()
  }

  listen (port, cb) {
    if (typeof port === 'function') return this.listen(0, port)
    if (!port) port = 0
    this.socket.bind(port, cb)
  }

  request (val, peer, opts, cb) {
    if (typeof opts === 'function') return this._request(val, peer, {}, opts)
    return this._request(val, peer, opts || {}, cb || noop)
  }

  _request (val, peer, opts, cb) {
    if (this.destroyed) return cb(new Error('Request cancelled'))
    if (this._tick === 32767) this._tick = 0

    const tid = this._tick++
    const header = 32768 | tid
    const message = Buffer.allocUnsafe(this.requestEncoding.encodingLength(val) + 2)

    message.writeUInt16BE(header, 0)
    this.requestEncoding.encode(val, message, 2)

    this._push(tid, val, message, peer, opts, cb)
    this.socket.send(message, 0, message.length, peer.port, peer.host)

    return tid
  }

  forwardRequest (val, from, to) {
    this._forward(true, val, from, to)
  }

  forwardResponse (val, from, to) {
    this._forward(false, val, from, to)
  }

  _forward (request, val, from, to) {
    if (this.destroyed) return

    const enc = request ? this.requestEncoding : this.responseEncoding
    const message = Buffer.allocUnsafe(enc.encodingLength(val) + 2)
    const header = (request ? 32768 : 0) | from.tid

    message.writeUInt16BE(header, 0)
    enc.encode(val, message, 2)

    this.socket.send(message, 0, message.length, to.port, to.host)
  }

  response (val, peer) {
    if (this.destroyed) return

    const message = Buffer.allocUnsafe(this.responseEncoding.encodingLength(val) + 2)

    message.writeUInt16BE(peer.tid, 0)
    this.responseEncoding.encode(val, message, 2)

    this.socket.send(message, 0, message.length, peer.port, peer.host)
  }

  destroy (err) {
    if (this.destroyed) return
    this.destroyed = true

    clearInterval(this._interval)
    this.socket.close()
    for (var i = 0; i < this._reqs.length; i++) {
      if (this._reqs[i]) this._cancel(i, err)
    }
  }

  cancel (tid, err) {
    const i = this._tids.indexOf(tid)
    if (i > -1) this._cancel(i, err)
  }

  _cancel (i, err) {
    const req = this._reqs[i]
    this._tids[i] = -1
    this._reqs[i] = null
    this.inflight--
    req.callback(err || new Error('Request cancelled'), null, req.peer, req.request)
  }

  _onmessage (message, rinfo) {
    if (this.destroyed) return

    const request = !!(message[0] & 128)
    const tid = message.readUInt16BE(0) & 32767
    const enc = request ? this.requestEncoding : this.responseEncoding

    try {
      var value = enc.decode(message, 2)
    } catch (err) {
      this.emit('warning', err)
      return
    }

    const peer = {
      port: rinfo.port,
      host: rinfo.address,
      tid,
      request
    }

    if (request) {
      this.emit('request', value, peer)
      return
    }

    const state = this._pull(tid)

    this.emit('response', value, peer, state && state.request)
    if (state) state.callback(null, value, peer, state.request, state.peer)
  }

  _checkTimeouts () {
    for (var i = 0; i < this._reqs.length; i++) {
      const req = this._reqs[i]
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

  _pull (tid) {
    const free = this._tids.indexOf(tid)
    if (free === -1) return null

    const req = this._reqs[free]
    this._reqs[free] = null
    this._tids[free] = -1

    this.inflight--

    return req
  }

  _push (tid, req, buf, peer, opts, cb) {
    const retry = opts.retry !== undefined ? opts.retry : this.retry
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
      timeout: 5,
      tries: retry ? 0 : RETRIES.length
    }
  }

  _onerror (err) {
    if (err.code === 'EADDRINUSE' || err.code === 'EPERM' || err.code === 'EACCES') this.emit('error', err)
    else this.emit('warning', err)
  }
}

function noop () {}
